import { and, eq } from "drizzle-orm";

import { db } from "./db/client";
import { jobs, jobSkills, skills, resumes, userSkills, studentProfiles } from "./db/schema";
import { resumes as resumesTable, resumeSkills, resumeAnalyses } from "./db/schema";
import { careers, engineeringBranches } from "./db/schema";
import { matchSkillSlug, matchBranchSlug } from "./resume-matching";
import { ensureSkillsSeeded } from "./db/seed";
import type { JDExtraction } from "./jd-intelligence.server";
import type { JDStructuredData, JDRequirementSeverity } from "./db/schema";

/**
 * Match Engine — computes multi-dimensional match scores between a student's
 * profile/resume and a parsed job description.
 *
 * The AI extracts and classifies information from the JD. The backend computes
 * ALL scores using transparent, versioned scoring logic. AI-generated percentages
 * are never stored as match scores.
 *
 * Scoring version is stored with each analysis so results remain auditable.
 *
 * `.server.ts` — always called with a `userId` from the verified session.
 */

export const SCORING_VERSION = "2026-08-30.1";

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

export type SkillMatchDetail = {
  name: string;
  category: string;
  severity: JDRequirementSeverity;
  status: "match" | "partial" | "gap";
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
  mid: 3,
  senior: 4,
  lead: 5,
};

// --- The scoring logic -------------------------------------------------------

/**
 * Compute all match dimensions. The weights are configurable per-scoring-version
 * but hardcoded here for now:
 *   - skills:      35% (most important — can the person do the job?)
 *   - tools:       15% (cloud, devops, databases, tools)
 *   - experience:  20%
 *   - education:   10%
 *   - keywords:    20% (overall keyword coverage across the JD)
 */
const WEIGHTS = {
  skills: 0.35,
  tools: 0.15,
  experience: 0.2,
  education: 0.1,
  keywords: 0.2,
} as const;

/**
 * Given a JD extraction and a user's skills/profile, compute the full match.
 */
export async function computeMatch(userId: string, extraction: JDExtraction): Promise<MatchResult> {
  await ensureSkillsSeeded();

  // 1. Resolve JD skills to catalog slugs and fetch student's skills.
  const jdSkillEntries = extraction.requiredSkills.map((s) => ({
    ...s,
    catalogSlug: matchSkillSlug(s.name),
  }));

  const [studentSkillRows, profileRow, latestResume] = await Promise.all([
    // Student's skills from all sources (resume + assessment).
    db
      .select({
        skillId: userSkills.skillId,
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
    // Student profile for experience/education comparison.
    db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    // Latest resume analysis for experience level.
    db
      .select({ experienceLevel: resumeAnalyses.aiExperienceLevel })
      .from(resumeAnalyses)
      .innerJoin(resumesTable, eq(resumesTable.id, resumeAnalyses.resumeId))
      .where(eq(resumesTable.userId, userId))
      .orderBy(resumeAnalyses.createdAt)
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  // Build a quick lookup: catalogSlug → student skill info.
  const studentBySlug = new Map<
    string,
    { level: string | null; confidence: number | null; source: string }
  >();
  for (const row of studentSkillRows) {
    const slug = row.skillSlug;
    const existing = studentBySlug.get(slug);
    // Prefer verified > current > claimed.
    const level = row.verifiedLevel ?? row.currentLevel ?? row.claimedLevel ?? null;
    if (!existing || (level && !existing.level)) {
      studentBySlug.set(slug, {
        level: level ?? null,
        confidence: row.confidence ?? null,
        source: row.source ?? "resume",
      });
    }
  }

  // 2. Compute skills score (mandatory skills only).
  const mandatorySkills = jdSkillEntries.filter((s) => s.severity === "mandatory");
  const preferredSkills = jdSkillEntries.filter((s) => s.severity === "preferred");

  let mandatoryMatched = 0;
  const mandatoryTotal = mandatorySkills.length;
  const skillDetails: SkillMatchDetail[] = [];

  for (const skill of mandatorySkills) {
    const studentSkill = skill.catalogSlug ? studentBySlug.get(skill.catalogSlug) : null;
    const status = studentSkill?.level ? "match" : "gap";
    if (status === "match") mandatoryMatched++;
    skillDetails.push({
      name: skill.name,
      category: skill.category,
      severity: skill.severity,
      status,
      studentLevel: studentSkill?.level ?? null,
      studentConfidence: studentSkill?.confidence ?? null,
    });
  }

  for (const skill of preferredSkills) {
    const studentSkill = skill.catalogSlug ? studentBySlug.get(skill.catalogSlug) : null;
    const status = studentSkill?.level ? "match" : "gap";
    skillDetails.push({
      name: skill.name,
      category: skill.category,
      severity: skill.severity,
      status,
      studentLevel: studentSkill?.level ?? null,
      studentConfidence: studentSkill?.confidence ?? null,
    });
  }

  const skillsScore =
    mandatoryTotal > 0
      ? Math.round((mandatoryMatched / mandatoryTotal) * 100)
      : mandatorySkills.length === 0 && preferredSkills.length > 0
        ? // No mandatory skills — score against preferred.
          Math.round(
            (preferredSkills.filter((s) => s.catalogSlug && studentBySlug.has(s.catalogSlug))
              .length /
              preferredSkills.length) *
              100,
          )
        : 100; // No skills mentioned at all.

  // 3. Compute tools score (cloud + devops + database + tool categories).
  const toolCategories = new Set(["cloud", "devops", "database", "tool"]);
  const toolSkills = jdSkillEntries.filter((s) => toolCategories.has(s.category));
  const mandatoryTools = toolSkills.filter((s) => s.severity === "mandatory");
  const toolsScore =
    mandatoryTools.length > 0
      ? Math.round(
          (mandatoryTools.filter((s) => s.catalogSlug && studentBySlug.has(s.catalogSlug)).length /
            mandatoryTools.length) *
            100,
        )
      : // If no explicit tool skills, check if any tool-category skills exist at all.
        toolSkills.length > 0
        ? Math.round(
            (toolSkills.filter((s) => s.catalogSlug && studentBySlug.has(s.catalogSlug)).length /
              toolSkills.length) *
              100,
          )
        : 85; // No tools mentioned — assume reasonable default.

  // 4. Compute experience score.
  const studentExpLevel = latestResume?.experienceLevel ?? profileRow?.experienceLevel ?? null;
  const jdSeniority = extraction.seniority;
  let experienceScore: number;
  if (!jdSeniority) {
    experienceScore = 80; // No seniority mentioned — assume flexible.
  } else if (!studentExpLevel) {
    experienceScore = 50; // Student hasn't indicated experience.
  } else {
    const studentRank = EXPERIENCE_ORDER[studentExpLevel] ?? 0;
    const requiredRank = EXPERIENCE_ORDER[jdSeniority] ?? 0;
    // If student meets or exceeds requirement → high score.
    // If 1 level below → partial. 2+ levels below → low.
    const diff = requiredRank - studentRank;
    if (diff <= 0) experienceScore = 100;
    else if (diff === 1) experienceScore = 60;
    else if (diff === 2) experienceScore = 30;
    else experienceScore = 15;
  }

  // 5. Compute education score.
  // Simple: if the student has a degree, give full score. If not mentioned, full.
  const educationScore = profileRow?.degree
    ? 95
    : extraction.educationRequirements.length === 0
      ? 90
      : 70;

  // 6. Compute keywords score (overall coverage of all mentioned skills, not just mandatory).
  const allSkillEntries = jdSkillEntries.filter((s) => s.catalogSlug);
  const matchedCount = allSkillEntries.filter((s) => studentBySlug.has(s.catalogSlug!)).length;
  const keywordsScore =
    allSkillEntries.length > 0 ? Math.round((matchedCount / allSkillEntries.length) * 100) : 80;

  // 7. Compute weighted overall score.
  const overallScore = clamp(
    Math.round(
      skillsScore * WEIGHTS.skills +
        toolsScore * WEIGHTS.tools +
        experienceScore * WEIGHTS.experience +
        educationScore * WEIGHTS.education +
        keywordsScore * WEIGHTS.keywords,
    ),
  );

  // 8. Collect missing/matching skill names.
  const matchingSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const detail of skillDetails) {
    if (detail.status === "match") {
      matchingSkills.push(detail.name);
    } else if (detail.severity === "mandatory" || detail.severity === "preferred") {
      missingSkills.push(detail.name);
    }
  }

  // 9. Build structured data for persistence.
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
    skillDetails: skillDetails.sort((a, b) => {
      // Mandatory first, then preferred. Within same severity, gap before match.
      const sevOrder: Record<string, number> = { mandatory: 0, preferred: 1, optional: 2 };
      const sv = (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
      if (sv !== 0) return sv;
      if (a.status === "gap" && b.status !== "gap") return -1;
      if (a.status !== "gap" && b.status === "gap") return 1;
      return 0;
    }),
    missingSkills,
    matchingSkills,
    structuredData,
  } as const;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
