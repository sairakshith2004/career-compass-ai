import { and, eq } from "drizzle-orm";

import { db } from "./db/client";
import { skills, userSkills } from "./db/schema";
import { userSkillHistory, type SkillSource } from "./db/career-schema";
import { levelRank, type Level } from "./career-levels";
import { recordActivity } from "./activity.server";

/**
 * Student-skills service. The single writer for `user_skills` and the
 * append-only `user_skill_history`. Every meaningful skill signal — from a
 * résumé analysis, an assessment, a completed project — flows through here so
 * that:
 *   - a student's skill profile is one consistent row per skill, and
 *   - every level change is recorded as history (progression over time).
 *
 * AI-inferred levels are kept distinct from verified evidence: an
 * `ai_inference` signal never raises `verifiedLevel`, only `claimedLevel` /
 * `currentLevel`.
 *
 * `.server.ts` — always called with a `userId` from the verified session.
 */

const VERIFIED_SOURCES: SkillSource[] = ["assessment", "project", "interview", "coding_practice"];

export type SkillSignal = {
  skillId: string;
  level: Level;
  source: SkillSource;
  score?: number;
  reason?: string;
  evidence?: { kind: string; label: string }[];
};

/**
 * Record a skill signal for a student. Upserts the `user_skills` row and, if
 * the effective level moved, appends a `user_skill_history` entry.
 * Returns whether the level changed and the new effective level.
 */
export async function recordStudentSkill(
  userId: string,
  signal: SkillSignal,
): Promise<{ changed: boolean; previousLevel: Level | null; newLevel: Level }> {
  const isVerified = VERIFIED_SOURCES.includes(signal.source);

  const [existing] = await db
    .select()
    .from(userSkills)
    .where(and(eq(userSkills.userId, userId), eq(userSkills.skillId, signal.skillId)))
    .limit(1);

  const prevEffective: Level | null =
    (existing?.currentLevel as Level | null) ??
    (existing?.verifiedLevel as Level | null) ??
    (existing?.claimedLevel as Level | null) ??
    null;

  // The new effective level never regresses below a stronger existing signal
  // unless this is verified evidence (which is authoritative).
  const newEffective: Level = isVerified
    ? signal.level
    : levelRank(signal.level) >= levelRank(prevEffective)
      ? signal.level
      : (prevEffective as Level);

  const nextVerified: Level | null = isVerified
    ? levelRank(signal.level) >= levelRank((existing?.verifiedLevel as Level | null) ?? null)
      ? signal.level
      : ((existing?.verifiedLevel as Level | null) ?? null)
    : ((existing?.verifiedLevel as Level | null) ?? null);

  const now = new Date();
  const values = {
    userId,
    skillId: signal.skillId,
    claimedLevel: (existing?.claimedLevel as Level | null) ?? signal.level,
    verifiedLevel: nextVerified,
    currentLevel: newEffective,
    score: signal.score ?? existing?.score ?? null,
    source: signal.source,
    evidence: signal.evidence ?? existing?.evidence ?? null,
    lastAssessedAt: isVerified ? now : (existing?.lastAssessedAt ?? null),
    updatedAt: now,
  };

  await db
    .insert(userSkills)
    .values(values)
    .onConflictDoUpdate({
      target: [userSkills.userId, userSkills.skillId],
      set: {
        verifiedLevel: values.verifiedLevel,
        currentLevel: values.currentLevel,
        score: values.score,
        source: values.source,
        evidence: values.evidence,
        lastAssessedAt: values.lastAssessedAt,
        updatedAt: now,
      },
    });

  const changed = prevEffective !== newEffective;
  if (changed) {
    await db.insert(userSkillHistory).values({
      userId,
      skillId: signal.skillId,
      previousLevel: prevEffective,
      newLevel: newEffective,
      score: signal.score ?? null,
      source: signal.source,
      reason: signal.reason ?? null,
    });
  }

  return { changed, previousLevel: prevEffective, newLevel: newEffective };
}

/** Bulk helper — records many signals, returns how many changed level. */
export async function recordStudentSkills(
  userId: string,
  signals: SkillSignal[],
): Promise<{ recorded: number; changed: number }> {
  let changed = 0;
  for (const s of signals) {
    const r = await recordStudentSkill(userId, s);
    if (r.changed) changed++;
  }
  if (signals.length > 0) {
    await recordActivity(userId, "resume_analyzed", {
      entityType: "skill_profile",
      entityId: userId,
      metadata: { skills: signals.length, changed },
    });
  }
  return { recorded: signals.length, changed };
}

export type SkillHistoryEntry = {
  skillId: string;
  skillName: string;
  previousLevel: Level | null;
  newLevel: Level;
  score: number | null;
  source: SkillSource;
  reason: string | null;
  createdAt: Date;
};

/** The caller's skill progression over time, newest first. */
export async function getSkillHistory(userId: string, limit = 100): Promise<SkillHistoryEntry[]> {
  const rows = await db
    .select({
      skillId: userSkillHistory.skillId,
      skillName: skills.name,
      previousLevel: userSkillHistory.previousLevel,
      newLevel: userSkillHistory.newLevel,
      score: userSkillHistory.score,
      source: userSkillHistory.source,
      reason: userSkillHistory.reason,
      createdAt: userSkillHistory.createdAt,
    })
    .from(userSkillHistory)
    .innerJoin(skills, eq(skills.id, userSkillHistory.skillId))
    .where(eq(userSkillHistory.userId, userId))
    .orderBy(userSkillHistory.createdAt)
    .limit(Math.min(Math.max(limit, 1), 500));
  return rows.reverse() as SkillHistoryEntry[];
}
