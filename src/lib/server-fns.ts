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
import { extractSkillSlugs } from "./skill-matching";

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
    };
    if (r.source === "resume") existing.resumeConfidence = r.confidence;
    if (r.source === "assessment") {
      existing.verifiedLevel = r.verifiedLevel;
      existing.verifiedConfidence = r.confidence;
    }
    bySkill.set(r.slug, existing);
  }

  return [...bySkill.values()].sort(
    (a, b) =>
      (b.verifiedConfidence ?? b.resumeConfidence ?? 0) -
      (a.verifiedConfidence ?? a.resumeConfidence ?? 0),
  );
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
 * Scans a pasted job description for catalog skills and scores it against the
 * member's resume-derived skills: matchScore = matched / required, both keyword-based.
 */
export const analyzeJob = createServerFn({ method: "POST" })
  .validator(jobInput)
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user) throw new Error("Not signed in");

    await ensureSkillsSeeded();
    const skillSlugs = extractSkillSlugs(data.rawDescription);

    const requiredSkills = skillSlugs.length
      ? await db.select({ id: skills.id }).from(skills).where(inArray(skills.slug, skillSlugs))
      : [];

    const resumeSkillRows = await db
      .select({ skillId: userSkills.skillId })
      .from(userSkills)
      .where(and(eq(userSkills.userId, session.user.id), eq(userSkills.source, "resume")));
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
        userId: session.user.id,
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

    return { id: job!.id, matchScore, skillsFound: requiredSkills.length };
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
      // Replace any previous assessment-sourced claim for this skill with the fresh result.
      await db
        .delete(userSkills)
        .where(
          and(
            eq(userSkills.userId, session.user.id),
            eq(userSkills.skillId, assessmentRow.skillId),
            eq(userSkills.source, "assessment"),
          ),
        );
      await db.insert(userSkills).values({
        userId: session.user.id,
        skillId: assessmentRow.skillId,
        verifiedLevel,
        confidence: score,
        source: "assessment",
      });

      await db.insert(assessmentResults).values({
        attemptId: attempt!.id,
        skillId: assessmentRow.skillId,
        verifiedLevel,
        confidence: score,
      });
    }

    return { score, correct, total: def.questions.length, verifiedLevel };
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
