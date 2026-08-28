/**
 * Pure profile-completion scoring for the student profile (Phase 2).
 *
 * A weighted 0–100 score over the profile fields, recomputed and persisted
 * (`student_profiles.profile_completion`) on every profile write. No DB, no
 * auth — just arithmetic, so it is trivially unit-testable.
 */

export type ProfileCompletionInput = {
  fullName?: string | null;
  degree?: string | null;
  branchId?: string | null;
  specialization?: string | null;
  collegeName?: string | null;
  countryCode?: string | null;
  currentYear?: string | null;
  currentSemester?: number | null;
  graduationYear?: number | null;
  experienceLevel?: string | null;
  careerGoalStatus?: string | null;
  preferredWorkLocation?: string | null;
  careerNotes?: string | null;
  targetCareerCount?: number;
  interestAreaCount?: number;
};

const has = (v: unknown) =>
  v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");

/** Weighted completion percentage (0–100), rounded to the nearest integer. */
export function computeProfileCompletion(p: ProfileCompletionInput): number {
  const stillStudying = has(p.currentYear) && p.currentYear !== "graduated";

  // [weight, satisfied]. `currentSemester` only counts while still studying, so
  // a graduated student is never penalised for leaving it blank.
  const fields: [number, boolean][] = [
    [3, has(p.fullName)],
    [1, has(p.degree)],
    [2, has(p.branchId)],
    [1, has(p.specialization)],
    [1, has(p.collegeName)],
    [1, has(p.countryCode)],
    [1, has(p.currentYear)],
    ...(stillStudying ? ([[1, has(p.currentSemester)]] as [number, boolean][]) : []),
    [1, has(p.graduationYear)],
    [1, has(p.experienceLevel)],
    [3, has(p.careerGoalStatus)],
    [2, (p.targetCareerCount ?? 0) > 0],
    [1, (p.interestAreaCount ?? 0) > 0],
    [1, has(p.preferredWorkLocation)],
    [1, has(p.careerNotes)],
  ];

  const total = fields.reduce((sum, [w]) => sum + w, 0);
  const got = fields.reduce((sum, [w, ok]) => sum + (ok ? w : 0), 0);
  return total === 0 ? 0 : Math.round((got / total) * 100);
}
