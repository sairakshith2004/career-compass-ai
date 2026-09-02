import { eq } from "drizzle-orm";

import { db } from "./db/client";
import {
  skills,
  userSkills,
  studentProfiles,
  resumes as resumesTable,
  resumeAnalyses,
} from "./db/schema";
import { matchSkillSlug } from "./resume-matching";
import { ensureSkillsSeeded } from "./db/seed";
import type { JDExtraction, JDRequiredSkill } from "./jd-intelligence.server";
import type { JDStructuredData, JDRequirementSeverity } from "./db/schema";

/**
 * Match Engine — computes multi-dimensional match scores between a student's
 * profile/resume and a parsed job description.
 *
 * The AI extracts and classifies information from the JD. The backend computes
 * ALL scores here using transparent, versioned scoring logic. AI-generated
 * percentages are never stored as match scores.
 *
 * `SCORING_VERSION` is stored with each analysis (`jobs.scoring_version`) so a
 * result can always be traced back to the exact weights/logic that produced it.
 * Bump it whenever the weights or any dimension formula below changes.
 *
 * `.server.ts` — every entry point takes a `userId` resolved from the verified
 * session; nothing here trusts a client-supplied id.
 */

export const SCORING_VERSION = "2026-09-02.1";

// --- Score types -------------------------------------------------------------

export type MatchDimensionScores = {
  /** 0-100: % of mandatory skills the student has. */
  skillsScore: number;
  /** 0-100: experience level match (0 = no match, 100 = perfect match). */
  experienceScore: number;
  /** 0-100: education requirement match. */
  educationScore: number;
  /** 0-100: % of mandatory tools/cloud/devops the student has. */
  toolsScore: number;
  /** 0-100: keyword coverage across the full JD. */
  keywordsScore: number;
  /** 0-100: overall weighted match. */
  overallScore: number;
};

export type SkillMatchStatus = "match" | "partial" | "gap";

export type SkillMatchDetail = {
  name: string;
  category: string;
  severity: JDRequirementSeverity;
  status: SkillMatchStatus;
  /** The catalog slug this JD skill resolved to, or null when uncatalogued. */
  catalogSlug: string | null;
  studentLevel: string | null;
  studentConfidence: number | null;
};

export type MatchResult = {
  scores: MatchDimensionScores;
  /** Per-skill match details, sorted by severity (mandatory first). */
  skillDetails: SkillMatchDetail[];
  /** Skills the student is missing (mandatory + preferred). */
  missingSkills: string[];
  /** Skills the student has that match. */
  matchingSkills: string[];
  /** The AI-extracted structured data persisted on the job row. */
  structuredData: JDStructuredData;
};

// --- Experience level ordering -----------------------------------------------

const EXPERIENCE_ORDER: Record<string, number> = {
  student: 0,
  internship: 1,
  junior: 2,
  entry: 2,
  mid: 3,
  senior: 4,
  lead: 5,
};

// --- Weights ----------------------------------------------------------------
//
// Configurable per scoring version; hardcoded for the current one:
//   - skills:      35% (most important — can the person do the job?)
//   - tools:       15% (cloud, devops, databases, tools)
//   - experience:  20%
//   - education:   10%
//   - keywords:    20% (overall keyword coverage across the JD)
const WEIGHTS = {
  skills: 0.35,
  tools: 0.15,
  experience: 0.2,
  education: 0.1,
  keywords: 0.2,
} as const;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// --- Student skill context (shared) ----------------------------------------

type StudentSkill = {
  level: string | null;
  confidence: number | null;
  verified: boolean;
  source: string;
};

export type StudentMatchContext = {
  /** catalog slug → best signal the student has for that skill */
  bySlug: Map<string, StudentSkill>;
  hasDegree: boolean;
  experienceLevel: string | null;
};

/**
 * Load everything the match engine needs about a student: their merged skill
 * signals (verified beats claimed beats resume-derived), whether they have a
 * degree, and their experience level (resume analysis first, declared profile
 * second). Used by both `computeMatch` and `computeSkillMatchDetails`.
 */
export async function loadStudentMatchContext(userId: string): Promise<StudentMatchContext> {
  const [studentSkillRows, profileRow, latestResume] = await Promise.all([
    db
      .select({
        currentLevel: userSkills.currentLevel,
        verifiedLevel: userSkills.verifiedLevel,
        claimedLevel: userSkills.claimedLevel,
        confidence: userSkills.confidence,
        source: userSkills.source,
        skillSlug: skills.slug,
      })
      .from(userSkills)
      .innerJoin(skills, eq(skills.id, userSkills.skillId))
      .where(eq(userSkills.userId, userId)),
    db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({ experienceLevel: resumeAnalyses.aiExperienceLevel })
      .from(resumeAnalyses)
      .innerJoin(resumesTable, eq(resumesTable.id, resumeAnalyses.resumeId))
      .where(eq(resumesTable.userId, userId))
      .orderBy(resumeAnalyses.createdAt)
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const bySlug = new Map<string, StudentSkill>();
  for (const row of studentSkillRows) {
    const level = row.verifiedLevel ?? row.currentLevel ?? row.claimedLevel ?? null;
    const verified = row.verifiedLevel != null;
    const existing = bySlug.get(row.skillSlug);
    // Keep the strongest signal: a verified row always wins; otherwise the first
    // row that actually carries a level.
    if (!existing || (verified && !existing.verified) || (level && !existing.level)) {
      bySlug.set(row.skillSlug, {
        level,
        confidence: row.confidence ?? null,
        verified,
        source: row.source ?? "resume",
      });
    }
  }

  return {
    bySlug,
    hasDegree: Boolean(profileRow?.degree),
    experienceLevel: latestResume?.experienceLevel ?? profileRow?.experienceLevel ?? null,
  };
}

/**
 * Classify how well the student covers one JD skill:
 *   - match:   has it, verified OR resume/claimed with reasonable confidence
 *   - partial: has it, but only weak resume/AI-inferred evidence (low confidence,
 *              not verified) — the "◐" state in the UI
 *   - gap:     no signal at all
 */
function classify(student: StudentSkill | undefined): SkillMatchStatus {
  if (!student || !student.level) return "gap";
  if (student.verified) return "match";
  if ((student.confidence ?? 0) < 40) return "partial";
  return "match";
}

/**
 * Build per-skill match details for a list of JD skills against a loaded student
 * context. Pure — no DB access — so it can be reused by the detail endpoint,
 * which re-derives current status every time skills change.
 */
export function buildSkillDetails(
  requiredSkills: JDRequiredSkill[],
  ctx: StudentMatchContext,
): SkillMatchDetail[] {
  const sevOrder: Record<string, number> = { mandatory: 0, preferred: 1, optional: 2 };
  return requiredSkills
    .map((skill) => {
      const catalogSlug = matchSkillSlug(skill.name);
      const student = catalogSlug ? ctx.bySlug.get(catalogSlug) : undefined;
      return {
        name: skill.name,
        category: skill.category,
        severity: skill.severity,
        status: classify(student),
        catalogSlug,
        studentLevel: student?.level ?? null,
        studentConfidence: student?.confidence ?? null,
      };
    })
    .sort((a, b) => {
      const sv = (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
      if (sv !== 0) return sv;
      const rank = { gap: 0, partial: 1, match: 2 } as const;
      return rank[a.status] - rank[b.status];
    });
}

/**
 * Re-derive per-skill match status for an already-analyzed job. Called by
 * `getJobMatchDetails` so the breakdown always reflects the student's *current*
 * skills, not what they had the day the JD was analyzed.
 */
export async function computeSkillMatchDetails(
  userId: string,
  requiredSkills: JDRequiredSkill[],
): Promise<SkillMatchDetail[]> {
  await ensureSkillsSeeded();
  const ctx = await loadStudentMatchContext(userId);
  return buildSkillDetails(requiredSkills, ctx);
}

// --- The scoring logic -----------------------------------------------------

const ratio = (matched: number, total: number) =>
  total > 0 ? Math.round((matched / total) * 100) : null;

/**
 * Given a JD extraction and a user's skills/profile, compute the full match.
 */
export async function computeMatch(userId: string, extraction: JDExtraction): Promise<MatchResult> {
  await ensureSkillsSeeded();

  const ctx = await loadStudentMatchContext(userId);
  const has = (slug: string | null) => Boolean(slug && ctx.bySlug.get(slug)?.level);

  const skillDetails = buildSkillDetails(extraction.requiredSkills, ctx);

  const mandatory = skillDetails.filter((d) => d.severity === "mandatory");
  const preferred = skillDetails.filter((d) => d.severity === "preferred");
  const covered = (d: SkillMatchDetail) => d.status === "match" || d.status === "partial";

  // 1. Skills score — mandatory coverage, falling back to preferred, then 100.
  const skillsScore =
    mandatory.length > 0
      ? ratio(mandatory.filter(covered).length, mandatory.length)!
      : preferred.length > 0
        ? ratio(preferred.filter(covered).length, preferred.length)!
        : 100;

  // 2. Tools score — cloud / devops / database / tool categories.
  const toolCategories = new Set(["cloud", "devops", "database", "tool"]);
  const toolDetails = skillDetails.filter((d) => toolCategories.has(d.category));
  const mandatoryTools = toolDetails.filter((d) => d.severity === "mandatory");
  const toolsScore =
    mandatoryTools.length > 0
      ? ratio(mandatoryTools.filter(covered).length, mandatoryTools.length)!
      : toolDetails.length > 0
        ? ratio(toolDetails.filter(covered).length, toolDetails.length)!
        : 85;

  // 3. Experience score.
  const jdSeniority = extraction.seniority;
  let experienceScore: number;
  if (!jdSeniority) {
    experienceScore = 80;
  } else if (!ctx.experienceLevel) {
    experienceScore = 50;
  } else {
    const diff =
      (EXPERIENCE_ORDER[jdSeniority] ?? 0) - (EXPERIENCE_ORDER[ctx.experienceLevel] ?? 0);
    if (diff <= 0) experienceScore = 100;
    else if (diff === 1) experienceScore = 60;
    else if (diff === 2) experienceScore = 30;
    else experienceScore = 15;
  }

  // 4. Education score.
  const educationScore = ctx.hasDegree
    ? 95
    : extraction.educationRequirements.length === 0
      ? 90
      : 70;

  // 5. Keywords score — coverage of every catalogued skill mentioned anywhere.
  const catalogued = skillDetails.filter((d) => d.catalogSlug);
  const keywordsScore =
    catalogued.length > 0
      ? ratio(catalogued.filter((d) => has(d.catalogSlug)).length, catalogued.length)!
      : 80;

  // 6. Weighted overall.
  const overallScore = clamp(
    skillsScore * WEIGHTS.skills +
      toolsScore * WEIGHTS.tools +
      experienceScore * WEIGHTS.experience +
      educationScore * WEIGHTS.education +
      keywordsScore * WEIGHTS.keywords,
  );

  // 7. Matching / missing skill names (mandatory + preferred only).
  const matchingSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const d of skillDetails) {
    if (d.severity === "optional") continue;
    if (d.status === "gap") missingSkills.push(d.name);
    else matchingSkills.push(d.name);
  }

  // 8. Structured data for persistence — stamped with the scoring version.
  const structuredData: JDStructuredData = {
    extractedTitle: extraction.extractedTitle,
    extractedCompany: extraction.extractedCompany,
    seniority: extraction.seniority,
    employmentType: extraction.employmentType,
    location: extraction.location,
    remote: extraction.remote,
    requiredSkills: extraction.requiredSkills,
    educationRequirements: extraction.educationRequirements,
    experienceRequirements: extraction.experienceRequirements,
    responsibilities: extraction.responsibilities,
    softSkills: extraction.softSkills,
    certifications: extraction.certifications,
    domainKnowledge: extraction.domainKnowledge,
    summary: extraction.summary,
    scoringVersion: SCORING_VERSION,
  };

  return {
    scores: {
      skillsScore,
      experienceScore,
      educationScore,
      toolsScore,
      keywordsScore,
      overallScore,
    },
    skillDetails,
    missingSkills,
    matchingSkills,
    structuredData,
  };
}
