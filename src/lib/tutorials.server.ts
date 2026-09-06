import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "./db/client";
import { ensureSkillsSeeded } from "./db/seed";
import {
  careerSkillRequirements,
  careers,
  jobSkills,
  jobs,
  resumes,
  skills,
  studentTargetCareers,
  userSkills,
} from "./db/schema";
import { levelRank } from "./career-levels";
import { tutorialsForSkill, type Tutorial } from "./tutorials-catalog";

/**
 * Tutorial recommendation service (server-only). Answers "what should I watch
 * next?" from the two signals the user asked for:
 *
 *   1. Their RESUME — skills they already have but only at a beginner /
 *      unverified level, worth strengthening.
 *   2. Their JOB DESCRIPTIONS — skills the roles they analyzed require that
 *      their resume doesn't show yet, ranked by how many of those roles want
 *      them (same "impact" ranking the dashboard and roadmap use).
 *
 * Plus a bonus bucket: skills their primary target role needs but they don't
 * hold at all.
 *
 * Every entry carries the four YouTube tutorial links from `tutorials-catalog`
 * (beginner / intermediate / advanced / interview). `.server.ts` — every entry
 * point takes a `userId` resolved from the verified session.
 */

export type TutorialReason = "job_gap" | "resume_weak" | "target_role";

export type TutorialRecommendation = {
  skillSlug: string;
  skillName: string;
  category: string | null;
  reason: TutorialReason;
  /** Human sentence for the card, e.g. "Required by 3 of your analyzed jobs". */
  reasonLabel: string;
  /** How many analyzed jobs require this skill (0 for non-job reasons). */
  demandCount: number;
  /** The student's current level for this skill, or null if they don't hold it. */
  currentLevel: "beginner" | "intermediate" | "advanced" | "expert" | null;
  tutorials: Tutorial[];
};

export type TutorialRecommendations = {
  hasResume: boolean;
  analyzedJobCount: number;
  primaryRoleName: string | null;
  jobGaps: TutorialRecommendation[];
  resumeSkills: TutorialRecommendation[];
  targetRole: TutorialRecommendation[];
};

type HeldSkill = {
  slug: string;
  name: string;
  category: string | null;
  currentLevel: TutorialRecommendation["currentLevel"];
  claimedLevel: TutorialRecommendation["currentLevel"];
  verifiedLevel: TutorialRecommendation["currentLevel"];
  confidence: number | null;
  sources: Set<string>;
};

const JOB_GAP_LIMIT = 24;
const RESUME_LIMIT = 18;
const TARGET_ROLE_LIMIT = 12;

/** Merge the user's `user_skills` rows (many per skill, one per source) by slug. */
async function loadHeldSkills(userId: string): Promise<Map<string, HeldSkill>> {
  const rows = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      category: skills.category,
      currentLevel: userSkills.currentLevel,
      claimedLevel: userSkills.claimedLevel,
      verifiedLevel: userSkills.verifiedLevel,
      confidence: userSkills.confidence,
      source: userSkills.source,
    })
    .from(userSkills)
    .innerJoin(skills, eq(skills.id, userSkills.skillId))
    .where(eq(userSkills.userId, userId));

  const bySlug = new Map<string, HeldSkill>();
  for (const r of rows) {
    const existing =
      bySlug.get(r.slug) ??
      ({
        slug: r.slug,
        name: r.name,
        category: r.category,
        currentLevel: null,
        claimedLevel: null,
        verifiedLevel: null,
        confidence: null,
        sources: new Set<string>(),
      } satisfies HeldSkill);

    if (levelRank(r.currentLevel) > levelRank(existing.currentLevel)) {
      existing.currentLevel = r.currentLevel;
    }
    if (levelRank(r.claimedLevel) > levelRank(existing.claimedLevel)) {
      existing.claimedLevel = r.claimedLevel;
    }
    if (levelRank(r.verifiedLevel) > levelRank(existing.verifiedLevel)) {
      existing.verifiedLevel = r.verifiedLevel;
    }
    if ((r.confidence ?? 0) > (existing.confidence ?? 0)) existing.confidence = r.confidence;
    if (r.source) existing.sources.add(r.source);
    bySlug.set(r.slug, existing);
  }
  return bySlug;
}

function recommendation(
  base: { slug: string; name: string; category: string | null },
  reason: TutorialReason,
  reasonLabel: string,
  demandCount: number,
  currentLevel: TutorialRecommendation["currentLevel"],
): TutorialRecommendation {
  return {
    skillSlug: base.slug,
    skillName: base.name,
    category: base.category,
    reason,
    reasonLabel,
    demandCount,
    currentLevel,
    tutorials: tutorialsForSkill(base.slug),
  };
}

export async function getTutorialRecommendations(userId: string): Promise<TutorialRecommendations> {
  await ensureSkillsSeeded();

  const [held, [resumeRow], analyzedJobs, [primaryTarget]] = await Promise.all([
    loadHeldSkills(userId),
    db
      .select({ id: resumes.id })
      .from(resumes)
      .where(eq(resumes.userId, userId))
      .orderBy(desc(resumes.createdAt))
      .limit(1),
    db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), eq(jobs.status, "analyzed"))),
    db
      .select({ careerId: studentTargetCareers.careerId, name: careers.name })
      .from(studentTargetCareers)
      .innerJoin(careers, eq(careers.id, studentTargetCareers.careerId))
      .where(and(eq(studentTargetCareers.userId, userId), eq(studentTargetCareers.isPrimary, true)))
      .limit(1),
  ]);

  // --- 1. job-description gaps ------------------------------------------------
  const jobGaps: TutorialRecommendation[] = [];
  if (analyzedJobs.length > 0) {
    const required = await db
      .select({ slug: skills.slug, name: skills.name, category: skills.category })
      .from(jobSkills)
      .innerJoin(skills, eq(skills.id, jobSkills.skillId))
      .where(
        inArray(
          jobSkills.jobId,
          analyzedJobs.map((j) => j.id),
        ),
      );

    const demand = new Map<string, { name: string; category: string | null; count: number }>();
    for (const r of required) {
      const cur = demand.get(r.slug);
      demand.set(r.slug, {
        name: r.name,
        category: r.category,
        count: (cur?.count ?? 0) + 1,
      });
    }

    for (const [slug, d] of demand) {
      const heldLevel = held.get(slug)?.currentLevel ?? null;
      // A gap = not held at all, or held only at beginner level.
      if (levelRank(heldLevel) >= levelRank("intermediate")) continue;
      const label =
        d.count > 1
          ? `Required by ${d.count} of your analyzed jobs`
          : "Required by a job you analyzed";
      jobGaps.push(
        recommendation(
          { slug, name: d.name, category: d.category },
          "job_gap",
          label,
          d.count,
          heldLevel,
        ),
      );
    }
    jobGaps.sort((a, b) => b.demandCount - a.demandCount || a.skillName.localeCompare(b.skillName));
  }
  const jobGapSlugs = new Set(jobGaps.map((g) => g.skillSlug));

  // --- 2. resume skills worth strengthening --------------------------------
  const resumeSkills: TutorialRecommendation[] = [];
  for (const s of held.values()) {
    if (jobGapSlugs.has(s.slug)) continue;
    if (!s.sources.has("resume")) continue;
    // Strengthen: unverified and at or below intermediate, or low confidence.
    const weakLevel = levelRank(s.currentLevel) <= levelRank("intermediate");
    const lowConfidence = (s.confidence ?? 0) < 70;
    if (!weakLevel && !lowConfidence) continue;
    const label = s.currentLevel
      ? `On your resume at ${s.currentLevel} level — level it up`
      : "Mentioned on your resume — build a solid foundation";
    resumeSkills.push(
      recommendation(
        { slug: s.slug, name: s.name, category: s.category },
        "resume_weak",
        label,
        0,
        s.currentLevel,
      ),
    );
  }
  resumeSkills.sort(
    (a, b) =>
      levelRank(a.currentLevel) - levelRank(b.currentLevel) ||
      a.skillName.localeCompare(b.skillName),
  );

  // --- 3. primary target-role skills not held ----------------------------
  const targetRole: TutorialRecommendation[] = [];
  if (primaryTarget) {
    const roleReqs = await db
      .select({
        slug: skills.slug,
        name: skills.name,
        category: skills.category,
        importance: careerSkillRequirements.importance,
      })
      .from(careerSkillRequirements)
      .innerJoin(skills, eq(skills.id, careerSkillRequirements.skillId))
      .where(eq(careerSkillRequirements.careerId, primaryTarget.careerId));

    const impRank = { core: 0, important: 1, helpful: 2 } as const;
    roleReqs.sort(
      (a, b) => impRank[a.importance] - impRank[b.importance] || a.name.localeCompare(b.name),
    );
    for (const r of roleReqs) {
      if (jobGapSlugs.has(r.slug)) continue;
      const heldLevel = held.get(r.slug)?.currentLevel ?? null;
      if (heldLevel) continue; // only surface skills they don't hold at all
      targetRole.push(
        recommendation(
          { slug: r.slug, name: r.name, category: r.category },
          "target_role",
          `${primaryTarget.name} needs this (${r.importance})`,
          0,
          null,
        ),
      );
    }
  }

  return {
    hasResume: Boolean(resumeRow),
    analyzedJobCount: analyzedJobs.length,
    primaryRoleName: primaryTarget?.name ?? null,
    jobGaps: jobGaps.slice(0, JOB_GAP_LIMIT),
    resumeSkills: resumeSkills.slice(0, RESUME_LIMIT),
    targetRole: targetRole.slice(0, TARGET_ROLE_LIMIT),
  };
}
