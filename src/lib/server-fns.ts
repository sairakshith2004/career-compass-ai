import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { auth, enabledProviders } from "./auth";
import { readSessionUser } from "./session.server";
import { getAssessmentDef } from "./assessment-catalog";
import { db } from "./db/client";
import { ensureAssessmentsSeeded, ensureSkillsSeeded } from "./db/seed";
import {
  assessmentAttempts,
  assessmentResults,
  assessments,
  jobs,
  jobSkills,
  learningRoadmaps,
  resumes,
  roadmapItems,
  skills,
  userPreferences,
  userSkills,
} from "./db/schema";
import { userSkillHistory } from "./db/career-schema";
import { extractSkillSlugs } from "./skill-matching";
import { recordStudentSkill } from "./student-skills.server";
import { recordActivity } from "./activity.server";
import { levelFromScore } from "./career-levels";
import { getPrimaryGoal } from "./career.server";
import { recomputeSkillGaps } from "./skill-gap-engine.server";
import { getActivity, type ActivityEntry } from "./activity.server";

/** Which social login buttons the login page should render. No secrets leave the server. */
export const getEnabledProviders = createServerFn({ method: "GET" }).handler(
  () => enabledProviders,
);

/**
 * Current member, or null if signed out — read from the HttpOnly session cookie
 * and gated on account status (see `readSessionUser`). Kept as a thin alias of
 * `getSessionUser` so existing callers don't churn.
 */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(() =>
  readSessionUser(getRequestHeaders()),
);

/** Signed-in member's saved career preferences, or null if signed out / not set yet. */
export const getPreferences = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user) return null;

  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, session.user.id))
    .limit(1);

  return row ?? null;
});

const preferencesInput = z.object({
  targetRole: z.string().trim().min(1, "Target role is required").max(120),
  weeklyStudyHours: z.coerce
    .number()
    .int("Whole hours only")
    .min(1, "At least 1 hour")
    .max(80, "80 hours or fewer"),
});

/** Upserts the signed-in member's career preferences (target role, weekly study hours). */
export const updatePreferences = createServerFn({ method: "POST" })
  .validator(preferencesInput)
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user) throw new Error("Not signed in");

    await db
      .insert(userPreferences)
      .values({ userId: session.user.id, ...data })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { ...data, updatedAt: new Date() },
      });

    return { ok: true } as const;
  });

/**
 * Signed-in member's most recently uploaded resume (row only — the structured
 * AI analysis lives in `resume_analyses`, fetched via `getResume` in
 * resume-fns.ts). Kept here because route guards + the dashboard import it.
 */
export const getLatestResume = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user) return null;

  const [row] = await db
    .select({
      id: resumes.id,
      fileName: resumes.fileName,
      status: resumes.status,
      createdAt: resumes.createdAt,
      analyzedAt: resumes.analyzedAt,
    })
    .from(resumes)
    .where(eq(resumes.userId, session.user.id))
    .orderBy(desc(resumes.createdAt))
    .limit(1);

  return row ?? null;
});

/**
 * Signed-in member's skills for the Skills page, merged across sources: resume-derived
 * confidence (how often a skill was mentioned — see `confidenceFromMentions`) and, once an
 * assessment has been taken for that skill, a real verified level and score. A skill can
 * have either, both, or (if only assessed, never seen in the resume) just the verified side.
 *
 * Enhanced to return category grouping, evidence details, current level, and skill history.
 */
export const getUserSkills = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user) return [];

  const rows = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      category: skills.category,
      confidence: userSkills.confidence,
      source: userSkills.source,
      verifiedLevel: userSkills.verifiedLevel,
      claimedLevel: userSkills.claimedLevel,
      currentLevel: userSkills.currentLevel,
      score: userSkills.score,
      evidence: userSkills.evidence,
      lastAssessedAt: userSkills.lastAssessedAt,
    })
    .from(userSkills)
    .innerJoin(skills, eq(skills.id, userSkills.skillId))
    .where(eq(userSkills.userId, session.user.id));

  type MergedSkill = {
    slug: string;
    name: string;
    category: string | null;
    resumeConfidence: number | null;
    verifiedLevel: "beginner" | "intermediate" | "advanced" | "expert" | null;
    verifiedConfidence: number | null;
    claimedLevel: "beginner" | "intermediate" | "advanced" | "expert" | null;
    currentLevel: "beginner" | "intermediate" | "advanced" | "expert" | null;
    score: number | null;
    evidence: { kind: string; label: string }[] | null;
    lastAssessedAt: Date | null;
  };

  const bySkill = new Map<string, MergedSkill>();
  for (const r of rows) {
    const existing = bySkill.get(r.slug) ?? {
      slug: r.slug,
      name: r.name,
      category: r.category,
      resumeConfidence: null,
      verifiedLevel: null,
      verifiedConfidence: null,
      claimedLevel: null,
      currentLevel: null,
      score: null,
      evidence: null,
      lastAssessedAt: null,
    };
    if (r.source === "resume") {
      existing.resumeConfidence = r.confidence;
      existing.claimedLevel = r.claimedLevel;
      if (!existing.evidence && r.evidence) existing.evidence = r.evidence;
    }
    if (r.source === "assessment") {
      existing.verifiedLevel = r.verifiedLevel;
      existing.verifiedConfidence = r.confidence;
      existing.score = r.score;
      existing.lastAssessedAt = r.lastAssessedAt;
    }
    existing.currentLevel = r.currentLevel ?? existing.currentLevel;
    bySkill.set(r.slug, existing);
  }

  return [...bySkill.values()].sort(
    (a, b) =>
      (b.verifiedConfidence ?? b.resumeConfidence ?? 0) -
      (a.verifiedConfidence ?? a.resumeConfidence ?? 0),
  );
});

/**
 * Skill history for a specific skill — shows level progression over time.
 */
export const getSkillHistory = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user) return [];

    const [skill] = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.slug, data.slug))
      .limit(1);
    if (!skill) return [];

    return db
      .select({
        previousLevel: userSkillHistory.previousLevel,
        newLevel: userSkillHistory.newLevel,
        score: userSkillHistory.score,
        source: userSkillHistory.source,
        reason: userSkillHistory.reason,
        createdAt: userSkillHistory.createdAt,
      })
      .from(userSkillHistory)
      .where(
        and(eq(userSkillHistory.userId, session.user.id), eq(userSkillHistory.skillId, skill.id)),
      )
      .orderBy(userSkillHistory.createdAt);
  });

/**
 * Skills grouped by category for the Skills page overview.
 */
export const getSkillCategories = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user) return [];

  const rows = await db
    .select({
      category: skills.category,
      slug: skills.slug,
      name: skills.name,
      confidence: userSkills.confidence,
      source: userSkills.source,
      verifiedLevel: userSkills.verifiedLevel,
      currentLevel: userSkills.currentLevel,
    })
    .from(userSkills)
    .innerJoin(skills, eq(skills.id, userSkills.skillId))
    .where(eq(userSkills.userId, session.user.id));

  const categoryMap = new Map<
    string,
    {
      name: string;
      skills: typeof rows;
      avgConfidence: number;
      verifiedCount: number;
    }
  >();

  for (const r of rows) {
    const cat = r.category ?? "Other";
    const existing = categoryMap.get(cat) ?? {
      name: cat,
      skills: [],
      avgConfidence: 0,
      verifiedCount: 0,
    };
    existing.skills.push(r);
    categoryMap.set(cat, existing);
  }

  return [...categoryMap.values()]
    .map((c) => {
      const confidences = c.skills.map((s) => s.confidence ?? 0).filter((x) => x > 0);
      c.avgConfidence =
        confidences.length > 0
          ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
          : 0;
      c.verifiedCount = c.skills.filter((s) => s.verifiedLevel != null).length;
      return c;
    })
    .sort((a, b) => b.skills.length - a.skills.length);
});

const jobInput = z.object({
  rawDescription: z
    .string()
    .trim()
    .min(30, "Paste the full job description (at least a few sentences)")
    .max(20000),
  title: z.string().trim().max(160).optional(),
  company: z.string().trim().max(160).optional(),
});

/** Signed-in member's analyzed jobs, most recent first. */
export const listJobs = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user) return [];

  return db
    .select()
    .from(jobs)
    .where(eq(jobs.userId, session.user.id))
    .orderBy(desc(jobs.createdAt));
});

/**
 * Get detailed match results for a specific job.
 */
export const getJobMatchDetails = createServerFn({ method: "GET" })
  .validator(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user) return null;

    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, data.jobId), eq(jobs.userId, session.user.id)))
      .limit(1);
    if (!job) return null;

    // Resolve skills for this job.
    const jobSkillRows = await db
      .select({
        name: skills.name,
        category: skills.category,
        requirement: jobSkills.requirement,
      })
      .from(jobSkills)
      .innerJoin(skills, eq(skills.id, jobSkills.skillId))
      .where(eq(jobSkills.jobId, job.id));

    // Get student skills for status computation.
    const studentSkillRows = await db
      .select({ skillSlug: skills.slug, currentLevel: userSkills.currentLevel })
      .from(userSkills)
      .innerJoin(skills, eq(skills.id, userSkills.skillId))
      .where(eq(userSkills.userId, session.user.id));
    const studentSlugs = new Set(studentSkillRows.map((r) => r.skillSlug));
    const studentLevels = new Map(studentSkillRows.map((r) => [r.skillSlug, r.currentLevel]));

    const skillDetails = jobSkillRows.map((s) => ({
      name: s.name,
      category: s.category,
      severity: s.requirement === "required" ? ("mandatory" as const) : ("preferred" as const),
      status: studentSlugs.has(s.name.toLowerCase().replace(/[^a-z0-9]/g, "-"))
        ? ("match" as const)
        : ("gap" as const),
      studentLevel: null as string | null,
      studentConfidence: null as number | null,
    }));

    return {
      id: job.id,
      title: job.title,
      company: job.company,
      rawDescription: job.rawDescription,
      status: job.status,
      matchScore: job.matchScore,
      matchSkillsScore: job.matchSkillsScore,
      matchExperienceScore: job.matchExperienceScore,
      matchEducationScore: job.matchEducationScore,
      matchToolsScore: job.matchToolsScore,
      matchKeywordsScore: job.matchKeywordsScore,
      scoringVersion: job.scoringVersion,
      structuredData: job.structuredData,
      analyzedAt: job.analyzedAt,
      skillDetails,
    };
  });

/**
 * Phase 7: AI-powered job analysis. Sends the JD to Claude for structured extraction,
 * computes multi-dimensional match scores, and stores everything.
 *
 * Falls back to keyword-only analysis if no AI key is configured.
 */
export const analyzeJob = createServerFn({ method: "POST" })
  .validator(jobInput)
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user) throw new Error("Not signed in");

    const userId = session.user.id;

    // Try AI-powered JD intelligence first.
    let matchResult: Awaited<
      ReturnType<typeof import("./match-engine.server").computeMatch>
    > | null = null;
    let extractionModel = "keyword-fallback";

    try {
      const { analyzeJobDescription, isAIConfigured } = await import("./jd-intelligence.server");
      if (isAIConfigured()) {
        const { extraction, model } = await analyzeJobDescription(data.rawDescription);
        extractionModel = model;
        const { computeMatch, SCORING_VERSION } = await import("./match-engine.server");
        matchResult = await computeMatch(userId, extraction);
        matchResult.structuredData.scoringVersion = SCORING_VERSION;
      }
    } catch (err) {
      // AI analysis failed — fall through to keyword-only.
      console.error(
        "[analyzeJob] AI analysis failed, falling back to keyword:",
        (err as Error).message?.slice(0, 200),
      );
    }

    if (matchResult) {
      // AI-powered path: store structured data + multi-dimensional scores.
      const { structuredData, scores, matchingSkills, missingSkills } = matchResult;
      structuredData.scoringVersion = extractionModel; // store model for traceability
      const [job] = await db
        .insert(jobs)
        .values({
          userId,
          title: data.title || structuredData.extractedTitle || null,
          company: data.company || structuredData.extractedCompany || null,
          rawDescription: data.rawDescription,
          status: "analyzed",
          matchScore: scores.overallScore,
          matchSkillsScore: scores.skillsScore,
          matchExperienceScore: scores.experienceScore,
          matchEducationScore: scores.educationScore,
          matchToolsScore: scores.toolsScore,
          matchKeywordsScore: scores.keywordsScore,
          scoringVersion: extractionModel,
          structuredData: structuredData as unknown as import("./db/schema").JDStructuredData,
          analyzedAt: new Date(),
        })
        .returning();

      // Store skills in job_skills table.
      await ensureSkillsSeeded();
      const allSkillNames = [
        ...new Set([
          ...structuredData.requiredSkills.map((s) => s.name),
          ...matchingSkills,
          ...missingSkills,
        ]),
      ];
      const catalogSkills = allSkillNames.length
        ? await db
            .select({ id: skills.id, name: skills.name })
            .from(skills)
            .where(
              inArray(
                skills.slug,
                allSkillNames.map((n) =>
                  n
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
                ),
              ),
            )
        : [];
      const skillIdByName = new Map(catalogSkills.map((s) => [s.name.toLowerCase(), s.id]));

      const skillRows = structuredData.requiredSkills
        .filter((s) => {
          const id = skillIdByName.get(s.name.toLowerCase());
          return Boolean(id);
        })
        .map((s) => ({
          jobId: job!.id,
          skillId: skillIdByName.get(s.name.toLowerCase())!,
          requirement: s.severity === "mandatory" ? ("required" as const) : ("preferred" as const),
        }));

      if (skillRows.length > 0) {
        await db.insert(jobSkills).values(skillRows);
      }

      return {
        id: job!.id,
        matchScore: scores.overallScore,
        skillsFound: structuredData.requiredSkills.length,
        aiPowered: true,
        structuredData,
        scores,
      };
    }

    // Fallback: keyword-only analysis (no AI key).
    await ensureSkillsSeeded();
    const skillSlugs = extractSkillSlugs(data.rawDescription);

    const requiredSkills = skillSlugs.length
      ? await db.select({ id: skills.id }).from(skills).where(inArray(skills.slug, skillSlugs))
      : [];

    const resumeSkillRows = await db
      .select({ skillId: userSkills.skillId })
      .from(userSkills)
      .where(and(eq(userSkills.userId, userId), eq(userSkills.source, "resume")));
    const resumeSkillIds = new Set(resumeSkillRows.map((r) => r.skillId));

    const matchScore = requiredSkills.length
      ? Math.round(
          (requiredSkills.filter((s) => resumeSkillIds.has(s.id)).length / requiredSkills.length) *
            100,
        )
      : null;

    const [job] = await db
      .insert(jobs)
      .values({
        userId,
        title: data.title || null,
        company: data.company || null,
        rawDescription: data.rawDescription,
        status: "analyzed",
        matchScore,
        analyzedAt: new Date(),
      })
      .returning();

    if (requiredSkills.length > 0) {
      await db.insert(jobSkills).values(
        requiredSkills.map((s) => ({
          jobId: job!.id,
          skillId: s.id,
          requirement: "required" as const,
        })),
      );
    }

    return { id: job!.id, matchScore, skillsFound: requiredSkills.length, aiPowered: false };
  });

/**
 * Skills required by the member's analyzed jobs but missing from their resume, ranked by
 * how many of those jobs actually require them — shared by the dashboard's gap list and
 * the roadmap generator, so "impact" means the same real thing in both places.
 */
async function computeSkillGaps(userId: string, limit: number) {
  const [resumeSkills, analyzedJobs] = await Promise.all([
    db
      .select({ slug: skills.slug })
      .from(userSkills)
      .innerJoin(skills, eq(skills.id, userSkills.skillId))
      .where(and(eq(userSkills.userId, userId), eq(userSkills.source, "resume"))),
    db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), eq(jobs.status, "analyzed"))),
  ]);

  if (analyzedJobs.length === 0) return [];

  const resumeSlugSet = new Set(resumeSkills.map((s) => s.slug));
  const allRequired = await db
    .select({ slug: skills.slug, name: skills.name })
    .from(jobSkills)
    .innerJoin(skills, eq(skills.id, jobSkills.skillId))
    .where(
      inArray(
        jobSkills.jobId,
        analyzedJobs.map((j) => j.id),
      ),
    );

  const gapCounts = new Map<string, { name: string; count: number }>();
  for (const r of allRequired) {
    if (!resumeSlugSet.has(r.slug)) {
      const existing = gapCounts.get(r.slug);
      gapCounts.set(r.slug, { name: r.name, count: (existing?.count ?? 0) + 1 });
    }
  }

  return [...gapCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([slug, g]) => ({
      slug,
      name: g.name,
      impact: (g.count >= 2 ? "High" : "Medium") as "High" | "Medium",
    }));
}

/**
 * Everything the dashboard needs in one call: whether a resume/jobs exist yet, the
 * skills detected in the resume, and — once at least one job has been analyzed — a
 * readiness score and gap list computed from real matches, not mock numbers.
 */
export const getDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user) return { signedIn: false as const };

  const userId = session.user.id;

  const [preferences, [resumeRow]] = await Promise.all([
    db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1),
    db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, userId))
      .orderBy(desc(resumes.createdAt))
      .limit(1),
  ]);
  const targetRole = preferences[0]?.targetRole ?? null;

  if (!resumeRow) {
    return { signedIn: true as const, targetRole, hasResume: false as const };
  }

  const resumeSkills = await db
    .select({ slug: skills.slug, name: skills.name })
    .from(userSkills)
    .innerJoin(skills, eq(skills.id, userSkills.skillId))
    .where(and(eq(userSkills.userId, userId), eq(userSkills.source, "resume")));

  const analyzedJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.status, "analyzed")))
    .orderBy(desc(jobs.analyzedAt));

  if (analyzedJobs.length === 0) {
    return {
      signedIn: true as const,
      targetRole,
      hasResume: true as const,
      hasJobs: false as const,
      resumeSkills,
    };
  }

  const latestJob = analyzedJobs[0]!;
  const resumeSlugSet = new Set(resumeSkills.map((s) => s.slug));

  const latestJobSkills = (
    await db
      .select({ slug: skills.slug, name: skills.name })
      .from(jobSkills)
      .innerJoin(skills, eq(skills.id, jobSkills.skillId))
      .where(eq(jobSkills.jobId, latestJob.id))
  ).map((r) => ({ name: r.name, matched: resumeSlugSet.has(r.slug) }));

  const gaps = await computeSkillGaps(userId, 6);

  return {
    signedIn: true as const,
    targetRole,
    hasResume: true as const,
    hasJobs: true as const,
    resumeSkills,
    jobsAnalyzedCount: analyzedJobs.length,
    latestJob: {
      id: latestJob.id,
      title: latestJob.title,
      company: latestJob.company,
      matchScore: latestJob.matchScore,
      requiredSkills: latestJobSkills,
    },
    gaps: gaps.map(({ name, impact }) => ({ name, impact })),
  };
});

function verifiedLevelFromScore(
  score: number,
): "beginner" | "intermediate" | "advanced" | "expert" {
  if (score >= 85) return "expert";
  if (score >= 70) return "advanced";
  if (score >= 50) return "intermediate";
  return "beginner";
}

/**
 * Signed-in member's assessment catalog, each with their best scored attempt (if any) —
 * "best" so retaking an assessment to improve a verified level doesn't hide the improvement
 * behind an earlier, worse attempt.
 */
export const listAssessments = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user) return [];

  await ensureAssessmentsSeeded();

  const [catalogRows, attemptRows] = await Promise.all([
    db
      .select({
        id: assessments.id,
        slug: assessments.slug,
        name: assessments.name,
        type: assessments.type,
        durationMinutes: assessments.durationMinutes,
        description: assessments.description,
        skillName: skills.name,
      })
      .from(assessments)
      .leftJoin(skills, eq(skills.id, assessments.skillId)),
    db
      .select({
        assessmentId: assessmentAttempts.assessmentId,
        score: assessmentAttempts.score,
      })
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.userId, session.user.id),
          eq(assessmentAttempts.status, "scored"),
        ),
      ),
  ]);

  const bestScoreByAssessment = new Map<string, number>();
  for (const a of attemptRows) {
    const existing = bestScoreByAssessment.get(a.assessmentId);
    if (a.score !== null && (existing === undefined || a.score > existing)) {
      bestScoreByAssessment.set(a.assessmentId, a.score);
    }
  }

  return catalogRows.map((c) => ({ ...c, bestScore: bestScoreByAssessment.get(c.id) ?? null }));
});

const assessmentSlugInput = z.object({ slug: z.string().min(1) });

/** Questions for one assessment, answers stripped — see assessment-catalog.ts's file-level note. */
export const getAssessmentQuestions = createServerFn({ method: "GET" })
  .validator(assessmentSlugInput)
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user) throw new Error("Not signed in");

    const def = getAssessmentDef(data.slug);
    if (!def) throw new Error("Unknown assessment");

    return {
      slug: def.slug,
      name: def.name,
      description: def.description,
      durationMinutes: def.durationMinutes,
      questions: def.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options })),
    };
  });

const submitAssessmentInput = z.object({
  slug: z.string().min(1),
  answers: z.record(z.string(), z.number().int().min(0)),
});

/**
 * Grades a submitted attempt server-side against assessment-catalog.ts (the client never
 * receives correct answers). A scored attempt writes a verified skill: source "assessment",
 * separate from the resume-derived row for the same skill (Skills page merges both).
 */
export const submitAssessment = createServerFn({ method: "POST" })
  .validator(submitAssessmentInput)
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user) throw new Error("Not signed in");

    const def = getAssessmentDef(data.slug);
    if (!def) throw new Error("Unknown assessment");

    await ensureAssessmentsSeeded();

    const [assessmentRow] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.slug, data.slug))
      .limit(1);
    if (!assessmentRow) throw new Error("Assessment not found");

    const correct = def.questions.filter((q) => data.answers[q.id] === q.correctIndex).length;
    const score = Math.round((correct / def.questions.length) * 100);
    const verifiedLevel = verifiedLevelFromScore(score);
    const now = new Date();

    const [attempt] = await db
      .insert(assessmentAttempts)
      .values({
        userId: session.user.id,
        assessmentId: assessmentRow.id,
        status: "scored",
        score,
        startedAt: now,
        submittedAt: now,
      })
      .returning();

    if (assessmentRow.skillId) {
      // A scored assessment is VERIFIED evidence. Routed through the
      // student-skills service so the level change is written to
      // user_skill_history and the user_skills row stays consistent.
      await recordStudentSkill(session.user.id, {
        skillId: assessmentRow.skillId,
        level: levelFromScore(score),
        source: "assessment",
        score,
        reason: `Scored ${score}% on ${assessmentRow.name}`,
      });

      await db.insert(assessmentResults).values({
        attemptId: attempt!.id,
        skillId: assessmentRow.skillId,
        verifiedLevel,
        confidence: score,
      });
    }

    await recordActivity(session.user.id, "assessment_completed", {
      entityType: "assessment",
      entityId: assessmentRow.id,
      metadata: { score, name: assessmentRow.name },
    });

    // Keep skill gaps for the active career goal in sync with the new evidence.
    try {
      const goal = await getPrimaryGoal(session.user.id);
      if (goal) await recomputeSkillGaps(session.user.id, goal.id, goal.careerId);
    } catch (err) {
      console.error("[assessment] gap recompute failed", (err as Error).message);
    }

    return { score, correct, total: def.questions.length, verifiedLevel };
  });

/** Recent activity for the dashboard activity feed. */
export const getRecentActivity = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user) return [];
  return getActivity(session.user.id, 10);
});

/**
 * The member's active roadmap (with weeks) if one exists, plus how many skill gaps are
 * currently available to generate one from — so the UI can tell "no roadmap yet, but you
 * could generate one" apart from "analyze a job first".
 */
export const getRoadmap = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user) return { roadmap: null, gapsAvailable: 0 };

  const userId = session.user.id;

  const [existing] = await db
    .select()
    .from(learningRoadmaps)
    .where(and(eq(learningRoadmaps.userId, userId), eq(learningRoadmaps.status, "active")))
    .orderBy(desc(learningRoadmaps.createdAt))
    .limit(1);

  const gaps = await computeSkillGaps(userId, 8);

  if (!existing) {
    return { roadmap: null, gapsAvailable: gaps.length };
  }

  const items = await db
    .select()
    .from(roadmapItems)
    .where(eq(roadmapItems.roadmapId, existing.id))
    .orderBy(roadmapItems.week);

  return { roadmap: { ...existing, items }, gapsAvailable: gaps.length };
});

/**
 * Generates an N-week roadmap, one week per skill gap (highest-impact first — same ranking
 * as the dashboard's gap list). Replaces any existing active roadmap rather than stacking.
 */
export const generateRoadmap = createServerFn({ method: "POST" }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user) throw new Error("Not signed in");
  const userId = session.user.id;

  const gaps = await computeSkillGaps(userId, 8);
  if (gaps.length === 0) {
    throw new Error("Analyze a job first — the roadmap is built from your skill gaps");
  }

  const [preferences] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  await db
    .update(learningRoadmaps)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(learningRoadmaps.userId, userId), eq(learningRoadmaps.status, "active")));

  const [roadmap] = await db
    .insert(learningRoadmaps)
    .values({
      userId,
      targetRole: preferences?.targetRole ?? null,
      weeklyHours: preferences?.weeklyStudyHours ?? null,
      status: "active",
    })
    .returning();

  await db.insert(roadmapItems).values(
    gaps.map((g, i) => ({
      roadmapId: roadmap!.id,
      week: i + 1,
      topic: g.name,
      status: (i === 0 ? "active" : "todo") as "active" | "todo",
    })),
  );

  return { id: roadmap!.id };
});

const completeRoadmapWeekInput = z.object({ itemId: z.string().min(1) });

/** Marks a roadmap week done and activates the next one, or completes the roadmap if it was the last. */
export const completeRoadmapWeek = createServerFn({ method: "POST" })
  .validator(completeRoadmapWeekInput)
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user) throw new Error("Not signed in");

    const [item] = await db
      .select()
      .from(roadmapItems)
      .where(eq(roadmapItems.id, data.itemId))
      .limit(1);
    if (!item) throw new Error("Roadmap item not found");

    const [roadmap] = await db
      .select()
      .from(learningRoadmaps)
      .where(
        and(eq(learningRoadmaps.id, item.roadmapId), eq(learningRoadmaps.userId, session.user.id)),
      )
      .limit(1);
    if (!roadmap) throw new Error("Not authorized");

    await db
      .update(roadmapItems)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(roadmapItems.id, item.id));

    const [nextItem] = await db
      .select()
      .from(roadmapItems)
      .where(and(eq(roadmapItems.roadmapId, roadmap.id), eq(roadmapItems.status, "todo")))
      .orderBy(roadmapItems.week)
      .limit(1);

    if (nextItem) {
      await db
        .update(roadmapItems)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(roadmapItems.id, nextItem.id));
    } else {
      await db
        .update(learningRoadmaps)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(learningRoadmaps.id, roadmap.id));
    }

    return { ok: true } as const;
  });
