import { and, eq, inArray } from "drizzle-orm";

import { db } from "./db/client";
import { careerSkillRequirements, skills, userSkills } from "./db/schema";
import { skillGaps } from "./db/career-schema";
import { gapPriority, gapSeverity, levelRank, type GapSeverity, type Level } from "./career-levels";
import { recordActivity } from "./activity.server";

/**
 * Skill Gap Engine — computes the gap between a student's current skills and
 * what their target career role requires, and persists the result to
 * `skill_gaps`. This is the foundation the roadmap builder consumes.
 *
 * `.server.ts` — always called with a `userId` from the verified session.
 */

/** The student's effective current level for a skill: prefer verified evidence,
 * fall back to `currentLevel`, then a claimed level. */
function effectiveLevel(row: {
  currentLevel: Level | null;
  verifiedLevel: Level | null;
  claimedLevel: Level | null;
}): Level | null {
  const candidates = [row.verifiedLevel, row.currentLevel, row.claimedLevel].filter(
    (l): l is Level => l != null,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, l) => (levelRank(l) > levelRank(best) ? l : best));
}

export type SkillGapRow = {
  skillId: string;
  skillSlug: string;
  skillName: string;
  category: string | null;
  importance: "core" | "important" | "helpful";
  currentLevel: Level | null;
  requiredLevel: Level;
  severity: GapSeverity;
  priority: number;
  status: "open" | "in_progress" | "closed";
};

/**
 * Recompute and persist skill gaps for a career goal. Idempotent: existing gap
 * rows for the goal are updated in place (preserving `status` / `resolvedAt`
 * where the gap still exists), and rows for requirements that no longer apply
 * are removed.
 */
export async function recomputeSkillGaps(
  userId: string,
  careerGoalId: string,
  careerId: string,
): Promise<SkillGapRow[]> {
  const [required, current, existing] = await Promise.all([
    db
      .select({
        skillId: careerSkillRequirements.skillId,
        skillSlug: skills.slug,
        skillName: skills.name,
        category: skills.category,
        importance: careerSkillRequirements.importance,
        requiredLevel: careerSkillRequirements.requiredLevel,
      })
      .from(careerSkillRequirements)
      .innerJoin(skills, eq(skills.id, careerSkillRequirements.skillId))
      .where(eq(careerSkillRequirements.careerId, careerId)),
    db
      .select({
        skillId: userSkills.skillId,
        currentLevel: userSkills.currentLevel,
        verifiedLevel: userSkills.verifiedLevel,
        claimedLevel: userSkills.claimedLevel,
      })
      .from(userSkills)
      .where(eq(userSkills.userId, userId)),
    db.select().from(skillGaps).where(eq(skillGaps.careerGoalId, careerGoalId)),
  ]);

  const currentBySkill = new Map(current.map((c) => [c.skillId, effectiveLevel(c)]));
  const existingBySkill = new Map(existing.map((g) => [g.skillId, g]));

  const computed: SkillGapRow[] = [];
  for (const req of required) {
    const currentLevel = currentBySkill.get(req.skillId) ?? null;
    const severity = gapSeverity(currentLevel, req.requiredLevel, req.importance);
    const priority = gapPriority(severity, req.importance);
    const prev = existingBySkill.get(req.skillId);
    computed.push({
      skillId: req.skillId,
      skillSlug: req.skillSlug,
      skillName: req.skillName,
      category: req.category,
      importance: req.importance,
      currentLevel,
      requiredLevel: req.requiredLevel,
      severity,
      priority,
      status: severity === "none" ? "closed" : (prev?.status ?? "open"),
    });
  }

  // Persist: upsert each computed row, delete stale ones.
  const requiredSkillIds = new Set(required.map((r) => r.skillId));
  const staleIds = existing.filter((g) => !requiredSkillIds.has(g.skillId)).map((g) => g.id);
  if (staleIds.length > 0) {
    await db.delete(skillGaps).where(inArray(skillGaps.id, staleIds));
  }

  for (const g of computed) {
    await db
      .insert(skillGaps)
      .values({
        userId,
        careerGoalId,
        skillId: g.skillId,
        currentLevel: g.currentLevel,
        requiredLevel: g.requiredLevel,
        severity: g.severity,
        priority: g.priority,
        status: g.status,
        resolvedAt: g.severity === "none" ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [skillGaps.careerGoalId, skillGaps.skillId],
        set: {
          currentLevel: g.currentLevel,
          requiredLevel: g.requiredLevel,
          severity: g.severity,
          priority: g.priority,
          status: g.status,
          resolvedAt: g.severity === "none" ? new Date() : null,
          updatedAt: new Date(),
        },
      });
  }

  await recordActivity(userId, "skill_gaps_identified", {
    entityType: "career_goal",
    entityId: careerGoalId,
    metadata: {
      total: computed.length,
      open: computed.filter((g) => g.severity !== "none").length,
    },
  });

  return computed.sort((a, b) => a.priority - b.priority);
}

/** Read the persisted skill gaps for a career goal, scoped to the user. Joins
 * the career's requirement for `importance` via the goal's career. */
export async function getSkillGapsForGoal(
  userId: string,
  careerGoalId: string,
  careerId: string,
): Promise<SkillGapRow[]> {
  const [gapRows, reqRows] = await Promise.all([
    db
      .select({
        skillId: skillGaps.skillId,
        skillSlug: skills.slug,
        skillName: skills.name,
        category: skills.category,
        currentLevel: skillGaps.currentLevel,
        requiredLevel: skillGaps.requiredLevel,
        severity: skillGaps.severity,
        priority: skillGaps.priority,
        status: skillGaps.status,
      })
      .from(skillGaps)
      .innerJoin(skills, eq(skills.id, skillGaps.skillId))
      .where(and(eq(skillGaps.userId, userId), eq(skillGaps.careerGoalId, careerGoalId)))
      .orderBy(skillGaps.priority),
    db
      .select({
        skillId: careerSkillRequirements.skillId,
        importance: careerSkillRequirements.importance,
      })
      .from(careerSkillRequirements)
      .where(eq(careerSkillRequirements.careerId, careerId)),
  ]);

  const importanceBySkill = new Map(reqRows.map((r) => [r.skillId, r.importance]));
  return gapRows.map((r) => ({
    ...r,
    importance: (importanceBySkill.get(r.skillId) ?? "important") as SkillGapRow["importance"],
  }));
}
