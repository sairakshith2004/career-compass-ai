import { and, eq, inArray } from "drizzle-orm";

import { db } from "./db/client";
import { jobs, jobSkills, skills, userSkills } from "./db/schema";
import { aiRuns, jobMatches } from "./db/career-schema";
import { ensureSkillsSeeded } from "./db/seed";
import { extractSkillSlugs } from "./skill-matching";
import { matchSkillSlug } from "./resume-matching";
import { recordActivity } from "./activity.server";
import {
  analyzeJobDescription,
  isAIConfigured,
  type AnalyzeDeps,
  type JDRequiredSkill,
} from "./jd-intelligence.server";
import {
  computeMatch,
  computeSkillMatchDetails,
  SCORING_VERSION,
  type SkillMatchDetail,
} from "./match-engine.server";
import type { JDStructuredData } from "./db/schema";

/**
 * Job-analysis service (Phase 7). Two entry points, both taking a `userId`
 * resolved from the verified session by the thin RPC wrappers in `server-fns.ts`:
 *
 *   analyzeAndPersistJob — paste-a-JD flow. Runs AI structured extraction
 *     (`jd-intelligence`) + transparent multi-dimensional scoring (`match-engine`,
 *     `SCORING_VERSION`), then persists the job row, its `job_skills`, a
 *     `job_matches` record and an `ai_runs` audit row. Falls back to a keyword
 *     match — never throwing away the user's input — when no AI key is set or the
 *     provider call fails.
 *
 *   getJobMatchView — the detail breakdown for one already-analyzed job. Stored
 *     dimension scores are the snapshot from analysis time; the per-skill
 *     match/partial/gap list is re-derived from the member's *current* skills
 *     every call, so improving a skill immediately updates it.
 *
 * Ownership is always enforced here (`jobs.userId = userId`), never trusted from
 * the client.
 */

export type JobAnalysisInput = {
  rawDescription: string;
  title?: string | undefined;
  company?: string | undefined;
};

export type JobAnalysisResult = {
  id: string;
  matchScore: number | null;
  skillsFound: number;
  aiPowered: boolean;
};

export type JobAnalysisDeps = {
  /** Inject a fake JD parser (tests) — presence also forces the AI path on. */
  jdParse?: AnalyzeDeps["parse"];
};

const MODEL_ENV = () => process.env["RESUME_AI_MODEL"] ?? "claude-opus-5";

/**
 * Map JD skills (free-text name + severity) to `job_skills` rows via the same
 * `matchSkillSlug` helper the match engine uses, so "Node.js" resolves to
 * `nodejs` in both places. De-dupes by skill id.
 */
async function resolveJobSkillRows(
  jobId: string,
  named: { name: string; severity: "mandatory" | "preferred" | "optional" }[],
) {
  const slugs = [
    ...new Set(named.map((s) => matchSkillSlug(s.name)).filter((s): s is string => Boolean(s))),
  ];
  type Row = { jobId: string; skillId: string; requirement: "required" | "preferred" };
  if (slugs.length === 0) return [] as Row[];

  const catalog = await db
    .select({ id: skills.id, slug: skills.slug })
    .from(skills)
    .where(inArray(skills.slug, slugs));
  const idBySlug = new Map(catalog.map((c) => [c.slug, c.id]));

  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const s of named) {
    const slug = matchSkillSlug(s.name);
    const id = slug ? idBySlug.get(slug) : undefined;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      jobId,
      skillId: id,
      requirement: s.severity === "mandatory" ? "required" : "preferred",
    });
  }
  return rows;
}

export async function analyzeAndPersistJob(
  userId: string,
  input: JobAnalysisInput,
  deps: JobAnalysisDeps = {},
): Promise<JobAnalysisResult> {
  await ensureSkillsSeeded();

  const useAI = Boolean(deps.jdParse) || isAIConfigured();

  if (useAI) {
    const startedAt = Date.now();
    try {
      const { extraction, model, usage } = await analyzeJobDescription(
        input.rawDescription,
        deps.jdParse ? { parse: deps.jdParse } : {},
      );
      const { structuredData, scores, matchingSkills, missingSkills } = await computeMatch(
        userId,
        extraction,
      );

      const [job] = await db
        .insert(jobs)
        .values({
          userId,
          title: input.title || structuredData.extractedTitle || null,
          company: input.company || structuredData.extractedCompany || null,
          rawDescription: input.rawDescription,
          seniority: structuredData.seniority,
          location: structuredData.location,
          remote: structuredData.remote,
          employmentType: structuredData.employmentType,
          status: "analyzed",
          matchScore: scores.overallScore,
          matchSkillsScore: scores.skillsScore,
          matchExperienceScore: scores.experienceScore,
          matchEducationScore: scores.educationScore,
          matchToolsScore: scores.toolsScore,
          matchKeywordsScore: scores.keywordsScore,
          scoringVersion: SCORING_VERSION,
          structuredData,
          analyzedAt: new Date(),
        })
        .returning();

      const skillRows = await resolveJobSkillRows(job!.id, structuredData.requiredSkills);
      if (skillRows.length > 0) await db.insert(jobSkills).values(skillRows);

      await db.insert(jobMatches).values({
        userId,
        jobId: job!.id,
        matchScore: scores.overallScore,
        matchingSkills,
        missingSkills,
      });

      await db.insert(aiRuns).values({
        userId,
        kind: "jd_analysis",
        model,
        promptVersion: SCORING_VERSION,
        inputTokens: usage?.input ?? null,
        outputTokens: usage?.output ?? null,
        durationMs: Date.now() - startedAt,
        status: "ok",
        entityType: "job",
        entityId: job!.id,
      });

      await recordActivity(userId, "job_analyzed", {
        entityType: "job",
        entityId: job!.id,
        metadata: {
          match: scores.overallScore,
          skills: structuredData.requiredSkills.length,
          title: job!.title ?? null,
        },
      });

      return {
        id: job!.id,
        matchScore: scores.overallScore,
        skillsFound: structuredData.requiredSkills.length,
        aiPowered: true,
      };
    } catch (err) {
      // Audit the failure, then fall through to the keyword path — the user's
      // input is never lost to a provider outage.
      const e = err as { code?: string; message?: string };
      console.error("[job-analysis] AI path failed, using keyword fallback:", e.code ?? e.message);
      await db
        .insert(aiRuns)
        .values({
          userId,
          kind: "jd_analysis",
          model: MODEL_ENV(),
          durationMs: Date.now() - startedAt,
          status: "failed",
          errorCode: (e.code ?? "provider_error").slice(0, 64),
          entityType: "job",
        })
        .catch(() => {});
    }
  }

  return keywordAnalyze(userId, input);
}

async function keywordAnalyze(userId: string, input: JobAnalysisInput): Promise<JobAnalysisResult> {
  const skillSlugs = extractSkillSlugs(input.rawDescription);
  const required = skillSlugs.length
    ? await db
        .select({ id: skills.id, name: skills.name })
        .from(skills)
        .where(inArray(skills.slug, skillSlugs))
    : [];

  const resumeSkillRows = await db
    .select({ skillId: userSkills.skillId })
    .from(userSkills)
    .where(and(eq(userSkills.userId, userId), eq(userSkills.source, "resume")));
  const resumeSkillIds = new Set(resumeSkillRows.map((r) => r.skillId));

  const matched = required.filter((s) => resumeSkillIds.has(s.id));
  const matchScore = required.length ? Math.round((matched.length / required.length) * 100) : null;

  const [job] = await db
    .insert(jobs)
    .values({
      userId,
      title: input.title || null,
      company: input.company || null,
      rawDescription: input.rawDescription,
      status: "analyzed",
      matchScore,
      scoringVersion: matchScore === null ? null : `keyword.${SCORING_VERSION}`,
      analyzedAt: new Date(),
    })
    .returning();

  if (required.length > 0) {
    await db
      .insert(jobSkills)
      .values(
        required.map((s) => ({ jobId: job!.id, skillId: s.id, requirement: "required" as const })),
      );
  }

  if (matchScore !== null) {
    const matchedIds = new Set(matched.map((s) => s.id));
    await db.insert(jobMatches).values({
      userId,
      jobId: job!.id,
      matchScore,
      matchingSkills: required.filter((s) => matchedIds.has(s.id)).map((s) => s.name),
      missingSkills: required.filter((s) => !matchedIds.has(s.id)).map((s) => s.name),
    });
  }

  await recordActivity(userId, "job_analyzed", {
    entityType: "job",
    entityId: job!.id,
    metadata: { match: matchScore, skills: required.length, title: job!.title ?? null },
  });

  return { id: job!.id, matchScore, skillsFound: required.length, aiPowered: false };
}

export type JobMatchView = {
  id: string;
  title: string | null;
  company: string | null;
  rawDescription: string;
  status: string;
  aiPowered: boolean;
  matchScore: number | null;
  matchSkillsScore: number | null;
  matchExperienceScore: number | null;
  matchEducationScore: number | null;
  matchToolsScore: number | null;
  matchKeywordsScore: number | null;
  scoringVersion: string | null;
  structuredData: JDStructuredData | null;
  analyzedAt: Date | null;
  skillDetails: SkillMatchDetail[];
};

export async function getJobMatchView(userId: string, jobId: string): Promise<JobMatchView | null> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1);
  if (!job) return null;

  const structured = job.structuredData ?? null;

  // Prefer the AI-extracted requirement list; fall back to the job_skills rows
  // (all a keyword-only analysis produced).
  let requiredSkills: JDRequiredSkill[] = structured?.requiredSkills ?? [];
  if (requiredSkills.length === 0) {
    const rows = await db
      .select({ name: skills.name, category: skills.category, requirement: jobSkills.requirement })
      .from(jobSkills)
      .innerJoin(skills, eq(skills.id, jobSkills.skillId))
      .where(eq(jobSkills.jobId, job.id));
    requiredSkills = rows.map((r) => ({
      name: r.name,
      category: "other",
      severity: r.requirement === "required" ? "mandatory" : "preferred",
    }));
  }

  const skillDetails = await computeSkillMatchDetails(userId, requiredSkills);

  return {
    id: job.id,
    title: job.title,
    company: job.company,
    rawDescription: job.rawDescription,
    status: job.status,
    aiPowered: structured != null,
    matchScore: job.matchScore,
    matchSkillsScore: job.matchSkillsScore,
    matchExperienceScore: job.matchExperienceScore,
    matchEducationScore: job.matchEducationScore,
    matchToolsScore: job.matchToolsScore,
    matchKeywordsScore: job.matchKeywordsScore,
    scoringVersion: job.scoringVersion,
    structuredData: structured,
    analyzedAt: job.analyzedAt,
    skillDetails,
  };
}
