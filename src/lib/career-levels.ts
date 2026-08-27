/**
 * Shared skill-level helpers. Pure, no DB, client-safe — used by the Skill Gap
 * Engine, roadmap builder, and the student-skills service.
 */

export const LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export type Level = (typeof LEVELS)[number];

/** Rank of a level; `null`/absent → -1 ("not held"). */
export function levelRank(l: Level | null | undefined): number {
  return l ? LEVELS.indexOf(l) : -1;
}

/** Map a 0–100 assessment score to a level. */
export function levelFromScore(score: number): Level {
  if (score >= 85) return "expert";
  if (score >= 65) return "advanced";
  if (score >= 40) return "intermediate";
  return "beginner";
}

export type GapSeverity = "none" | "low" | "medium" | "high" | "critical";
export type SkillImportance = "core" | "important" | "helpful";

/**
 * Severity of a gap between the student's current level and the level a role
 * requires, weighted by how central the skill is to the role. A `core` skill
 * the student doesn't hold at all is `critical`; a `helpful` skill one level
 * short is `low`.
 */
export function gapSeverity(
  current: Level | null | undefined,
  required: Level,
  importance: SkillImportance,
): GapSeverity {
  const distance = levelRank(required) - levelRank(current); // >0 means a gap
  if (distance <= 0) return "none";

  const weight = importance === "core" ? 2 : importance === "important" ? 1 : 0;
  const score = distance + weight; // 1 (helpful, 1 short) … 6 (core, missing entirely)

  if (score >= 5) return "critical";
  if (score >= 4) return "high";
  if (score >= 3) return "medium";
  return "low";
}

const SEVERITY_RANK: Record<GapSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

/** Lower number = address sooner. Critical core skills first. */
export function gapPriority(severity: GapSeverity, importance: SkillImportance): number {
  const impWeight = importance === "core" ? 0 : importance === "important" ? 2 : 4;
  return 10 - SEVERITY_RANK[severity] + impWeight; // ~6 (critical core) … ~18 (none helpful)
}

export const severityRank = (s: GapSeverity) => SEVERITY_RANK[s];
