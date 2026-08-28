import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "./db/client";
import { user } from "./db/auth-schema";
import {
  careers,
  engineeringBranches,
  studentInterestAreas,
  studentProfiles,
  studentTargetCareers,
} from "./db/schema";
import { ensureOnboardingCatalogSeeded } from "./db/seed";
import {
  CAREER_GOAL_STATUSES,
  COUNTRIES,
  CURRENT_YEARS,
  DEGREES,
  EXPERIENCE_LEVELS,
  ENGINEERING_BRANCHES,
  CAREERS,
  ONBOARDING_STEP_COUNT,
  isBranchSlug,
  isCareerSlug,
  isCountryCode,
} from "./onboarding-catalog";
import {
  CAREER_GROUPS,
  careerGroupName,
  ENGINEERING_CATEGORIES,
  ENGINEERING_BRANCHES as TAXONOMY_BRANCHES,
  isCareerGroupSlug,
  resolveBranchSlug,
} from "./taxonomy-catalog";
import { computeProfileCompletion } from "./profile-completion";

/**
 * Server-only student-profile logic. Every function takes an explicit `userId`
 * and scopes every read and write to it — there is no code path that accepts a
 * profile id or a target user id from the caller. The `createServerFn` wrappers
 * (src/lib/onboarding-fns.ts) obtain `userId` from the verified session only.
 *
 * `.server.ts` — must never be imported into client code.
 */

// --- validation ---------------------------------------------------------------

const currentYearValues = CURRENT_YEARS.map((y) => y.value) as [string, ...string[]];
const experienceValues = EXPERIENCE_LEVELS.map((e) => e.value) as [string, ...string[]];
const goalStatusValues = CAREER_GOAL_STATUSES.map((g) => g.value) as [string, ...string[]];
const CURRENT_MAX_GRAD_YEAR = new Date().getFullYear() + 8;
const MIN_GRAD_YEAR = 1980;
const MIN_SEMESTER = 1;
const MAX_SEMESTER = 12;

/** "" / null / undefined → undefined; anything else → Number(v). For optional numeric inputs. */
const optionalInt = (schema: z.ZodType<number | undefined>): z.ZodType<number | undefined> =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), schema);

export const academicBackgroundSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  degree: z.enum(DEGREES).optional(),
  collegeName: z.string().trim().min(2).max(160).optional(),
  countryCode: z.string().refine(isCountryCode, "Unknown country").optional(),
});

export const branchSchema = z.object({
  branchSlug: z.string().refine(isBranchSlug, "Unknown branch").optional(),
  specialization: z.string().trim().min(2).max(120).optional(),
});

export const graduationSchema = z.object({
  currentYear: z.enum(currentYearValues).optional(),
  currentSemester: optionalInt(z.number().int().min(MIN_SEMESTER).max(MAX_SEMESTER).optional()),
  graduationYear: optionalInt(
    z.number().int().min(MIN_GRAD_YEAR).max(CURRENT_MAX_GRAD_YEAR).optional(),
  ),
});

export const careerDirectionSchema = z
  .object({
    careerGoalStatus: z.enum(goalStatusValues),
    experienceLevel: z.enum(experienceValues).optional(),
    targetCareerSlugs: z.array(z.string().refine(isCareerSlug, "Unknown career")).max(5).optional(),
    interestAreaSlugs: z
      .array(z.string().refine(isCareerGroupSlug, "Unknown interest area"))
      .max(12)
      .optional(),
    preferredWorkLocation: z.string().trim().max(120).optional(),
    careerNotes: z.string().trim().max(2000).optional(),
  })
  .transform((v) => ({
    ...v,
    // A student who is "not sure yet" has no target careers; "I know exactly
    // what I want" is a single choice.
    targetCareerSlugs:
      v.careerGoalStatus === "unsure"
        ? []
        : v.careerGoalStatus === "known"
          ? (v.targetCareerSlugs ?? []).slice(0, 1)
          : (v.targetCareerSlugs ?? []),
    interestAreaSlugs: [...new Set(v.interestAreaSlugs ?? [])].slice(0, 12),
  }));

/**
 * One-shot full-profile update — backs the dedicated `/app/profile` editor.
 * Unlike the step savers it never touches `lastCompletedStep` /
 * `onboardingCompletedAt`; it just writes whatever the form submitted.
 */
export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    degree: z.enum(DEGREES).optional(),
    branchSlug: z.string().refine(isBranchSlug, "Unknown branch").optional(),
    specialization: z.string().trim().max(120).optional(),
    collegeName: z.string().trim().max(160).optional(),
    countryCode: z.string().refine(isCountryCode, "Unknown country").optional(),
    currentYear: z.enum(currentYearValues).optional(),
    currentSemester: optionalInt(z.number().int().min(MIN_SEMESTER).max(MAX_SEMESTER).optional()),
    graduationYear: optionalInt(
      z.number().int().min(MIN_GRAD_YEAR).max(CURRENT_MAX_GRAD_YEAR).optional(),
    ),
    experienceLevel: z.enum(experienceValues).optional(),
    careerGoalStatus: z.enum(goalStatusValues).optional(),
    targetCareerSlugs: z.array(z.string().refine(isCareerSlug, "Unknown career")).max(5).optional(),
    interestAreaSlugs: z
      .array(z.string().refine(isCareerGroupSlug, "Unknown interest area"))
      .max(12)
      .optional(),
    preferredWorkLocation: z.string().trim().max(120).optional(),
    careerNotes: z.string().trim().max(2000).optional(),
  })
  .transform((v) => ({
    ...v,
    targetCareerSlugs:
      v.careerGoalStatus === "unsure"
        ? []
        : v.careerGoalStatus === "known"
          ? (v.targetCareerSlugs ?? []).slice(0, 1)
          : (v.targetCareerSlugs ?? []),
    interestAreaSlugs: [...new Set(v.interestAreaSlugs ?? [])].slice(0, 12),
  }));

export type AcademicBackgroundInput = z.input<typeof academicBackgroundSchema>;
export type BranchInput = z.input<typeof branchSchema>;
export type GraduationInput = z.input<typeof graduationSchema>;
export type CareerDirectionInput = z.input<typeof careerDirectionSchema>;
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

// --- catalog helpers ---------------------------------------------------------

async function branchMaps() {
  await ensureOnboardingCatalogSeeded();
  const rows = await db
    .select({ id: engineeringBranches.id, slug: engineeringBranches.slug })
    .from(engineeringBranches);
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));
  const slugById = new Map(rows.map((r) => [r.id, r.slug]));
  return { idBySlug, slugById };
}

async function careerMaps() {
  await ensureOnboardingCatalogSeeded();
  const rows = await db.select({ id: careers.id, slug: careers.slug }).from(careers);
  return {
    idBySlug: new Map(rows.map((r) => [r.slug, r.id])),
    slugById: new Map(rows.map((r) => [r.id, r.slug])),
  };
}

type Option = { value: string; label: string };
export type OnboardingCatalog = {
  degrees: string[];
  branches: { slug: string; name: string }[];
  /** Branches grouped by engineering category — for the step-2 grouped picker. */
  branchGroups: { category: string; branches: { slug: string; name: string }[] }[];
  careers: { slug: string; name: string; category: string }[];
  /** Broad career-interest areas (taxonomy career groups). */
  interestAreas: { slug: string; name: string }[];
  countries: { slug: string; name: string }[];
  currentYears: Option[];
  experienceLevels: Option[];
  careerGoalStatuses: Option[];
  maxSemester: number;
  stepCount: number;
};

/** Static option lists the wizard renders (no secrets, safe for the client). */
export function onboardingCatalog(): OnboardingCatalog {
  const branchGroups = ENGINEERING_CATEGORIES.map((c) => ({
    category: c.name,
    branches: TAXONOMY_BRANCHES.filter((b) => b.categorySlug === c.slug).map((b) => ({
      slug: b.slug,
      name: b.name,
    })),
  })).filter((g) => g.branches.length > 0);

  return {
    degrees: [...DEGREES],
    branches: ENGINEERING_BRANCHES.map((b) => ({ slug: b.slug, name: b.name })),
    branchGroups,
    careers: CAREERS.map((c) => ({ slug: c.slug, name: c.name, category: c.category })),
    interestAreas: CAREER_GROUPS.map((g) => ({ slug: g.slug, name: g.name })),
    countries: COUNTRIES.map((c) => ({ slug: c.slug, name: c.name })),
    currentYears: CURRENT_YEARS.map((y) => ({ value: y.value, label: y.label })),
    experienceLevels: EXPERIENCE_LEVELS.map((x) => ({ value: x.value, label: x.label })),
    careerGoalStatuses: CAREER_GOAL_STATUSES.map((g) => ({ value: g.value, label: g.label })),
    maxSemester: MAX_SEMESTER,
    stepCount: ONBOARDING_STEP_COUNT,
  };
}

// --- progress persistence ---------------------------------------------------

/** Upsert the profile row and advance `lastCompletedStep` to at least `step`. */
async function upsertProfile(
  userId: string,
  step: number,
  fields: Partial<typeof studentProfiles.$inferInsert>,
) {
  await db
    .insert(studentProfiles)
    .values({ userId, lastCompletedStep: step, ...fields })
    .onConflictDoUpdate({
      target: studentProfiles.userId,
      set: {
        ...fields,
        lastCompletedStep: sql`max(${studentProfiles.lastCompletedStep}, ${step})`,
        updatedAt: new Date(),
      },
    });
}

/** Replace the user's target-career set with `slugs` (order-independent). */
async function replaceTargetCareers(userId: string, slugs: string[]) {
  const { idBySlug } = await careerMaps();
  const careerIds = slugs.map((slug) => idBySlug.get(slug)).filter((v): v is string => Boolean(v));

  await db.delete(studentTargetCareers).where(eq(studentTargetCareers.userId, userId));
  if (careerIds.length > 0) {
    await db
      .insert(studentTargetCareers)
      .values(careerIds.map((careerId) => ({ userId, careerId })))
      .onConflictDoNothing();
  }
}

/** Replace the user's career-interest-area set with `slugs`. */
async function replaceInterestAreas(userId: string, slugs: string[]) {
  const clean = [...new Set(slugs.filter(isCareerGroupSlug))];
  await db.delete(studentInterestAreas).where(eq(studentInterestAreas.userId, userId));
  if (clean.length > 0) {
    await db
      .insert(studentInterestAreas)
      .values(clean.map((groupSlug) => ({ userId, groupSlug })))
      .onConflictDoNothing();
  }
}

/**
 * Recompute `student_profiles.profile_completion` from the current row + related
 * counts. Cheap; called at the end of every write path so the number is never
 * stale.
 */
async function recomputeCompletion(userId: string) {
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  if (!profile) return;

  const [[u], [targets], [interests]] = await Promise.all([
    db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1),
    db
      .select({ n: sql<number>`count(*)` })
      .from(studentTargetCareers)
      .where(eq(studentTargetCareers.userId, userId)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(studentInterestAreas)
      .where(eq(studentInterestAreas.userId, userId)),
  ]);

  const profileCompletion = computeProfileCompletion({
    fullName: u?.name ?? null,
    degree: profile.degree,
    branchId: profile.branchId,
    specialization: profile.specialization,
    collegeName: profile.collegeName,
    countryCode: profile.countryCode,
    currentYear: profile.currentYear,
    currentSemester: profile.currentSemester,
    graduationYear: profile.graduationYear,
    experienceLevel: profile.experienceLevel,
    careerGoalStatus: profile.careerGoalStatus,
    preferredWorkLocation: profile.preferredWorkLocation,
    careerNotes: profile.careerNotes,
    targetCareerCount: Number(targets?.n ?? 0),
    interestAreaCount: Number(interests?.n ?? 0),
  });

  await db
    .update(studentProfiles)
    .set({ profileCompletion, updatedAt: new Date() })
    .where(eq(studentProfiles.userId, userId));
}

export async function saveAcademicBackground(userId: string, raw: AcademicBackgroundInput) {
  const data = academicBackgroundSchema.parse(raw);

  await db.update(user).set({ name: data.fullName }).where(eq(user.id, userId));
  // Only the fields this step owns are written — branchId (step 2), the
  // graduation fields (step 3) and the career fields (step 4) are untouched, so
  // re-saving step 1 never clobbers later progress.
  await upsertProfile(userId, 1, {
    degree: data.degree ?? null,
    collegeName: data.collegeName ?? null,
    countryCode: data.countryCode ?? null,
  });
  await recomputeCompletion(userId);
  return { ok: true as const };
}

export async function saveBranch(userId: string, raw: BranchInput) {
  const data = branchSchema.parse(raw);
  const { idBySlug } = await branchMaps();
  // Accept either the canonical slug or a Phase 2 alias ("ece", "mech", …).
  const canonical = data.branchSlug ? resolveBranchSlug(data.branchSlug) : null;
  await upsertProfile(userId, 2, {
    branchId: canonical ? (idBySlug.get(canonical) ?? null) : null,
    specialization: data.specialization ?? null,
  });
  await recomputeCompletion(userId);
  return { ok: true as const };
}

export async function saveGraduation(userId: string, raw: GraduationInput) {
  const data = graduationSchema.parse(raw);
  // The semester only makes sense while still studying.
  const currentSemester = data.currentYear === "graduated" ? null : (data.currentSemester ?? null);
  await upsertProfile(userId, 3, {
    currentYear: (data.currentYear as typeof studentProfiles.$inferInsert.currentYear) ?? null,
    currentSemester,
    graduationYear: data.graduationYear ?? null,
  });
  await recomputeCompletion(userId);
  return { ok: true as const };
}

export async function saveCareerDirection(userId: string, raw: CareerDirectionInput) {
  const data = careerDirectionSchema.parse(raw);
  await upsertProfile(userId, 4, {
    careerGoalStatus: data.careerGoalStatus as typeof studentProfiles.$inferInsert.careerGoalStatus,
    experienceLevel:
      (data.experienceLevel as typeof studentProfiles.$inferInsert.experienceLevel) ?? null,
    preferredWorkLocation: data.preferredWorkLocation ?? null,
    careerNotes: data.careerNotes ?? null,
  });

  await replaceTargetCareers(userId, data.targetCareerSlugs);
  await replaceInterestAreas(userId, data.interestAreaSlugs);
  await recomputeCompletion(userId);
  return { ok: true as const };
}

/** Full-profile update from the `/app/profile` editor. */
export async function updateStudentProfile(userId: string, raw: UpdateProfileInput) {
  const data = updateProfileSchema.parse(raw);
  const { idBySlug } = await branchMaps();
  const canonical = data.branchSlug ? resolveBranchSlug(data.branchSlug) : null;
  const currentSemester = data.currentYear === "graduated" ? null : (data.currentSemester ?? null);

  await db.update(user).set({ name: data.fullName }).where(eq(user.id, userId));

  const fields: Partial<typeof studentProfiles.$inferInsert> = {
    degree: data.degree ?? null,
    branchId: canonical ? (idBySlug.get(canonical) ?? null) : null,
    specialization: data.specialization ?? null,
    collegeName: data.collegeName ?? null,
    countryCode: data.countryCode ?? null,
    currentYear: (data.currentYear as typeof studentProfiles.$inferInsert.currentYear) ?? null,
    currentSemester,
    graduationYear: data.graduationYear ?? null,
    experienceLevel:
      (data.experienceLevel as typeof studentProfiles.$inferInsert.experienceLevel) ?? null,
    careerGoalStatus:
      (data.careerGoalStatus as typeof studentProfiles.$inferInsert.careerGoalStatus) ?? null,
    preferredWorkLocation: data.preferredWorkLocation ?? null,
    careerNotes: data.careerNotes ?? null,
  };

  await db
    .insert(studentProfiles)
    .values({ userId, ...fields })
    .onConflictDoUpdate({
      target: studentProfiles.userId,
      set: { ...fields, updatedAt: new Date() },
    });

  await replaceTargetCareers(userId, data.targetCareerSlugs);
  await replaceInterestAreas(userId, data.interestAreaSlugs);
  await recomputeCompletion(userId);
  return { ok: true as const };
}

export async function completeOnboarding(userId: string) {
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);

  if (!profile || !profile.careerGoalStatus) {
    throw new Error("Finish the career-direction step before completing onboarding");
  }

  await db
    .update(studentProfiles)
    .set({
      onboardingCompletedAt: profile.onboardingCompletedAt ?? new Date(),
      lastCompletedStep: ONBOARDING_STEP_COUNT,
      updatedAt: new Date(),
    })
    .where(eq(studentProfiles.userId, userId));

  await recomputeCompletion(userId);
  return { ok: true as const };
}

// --- reads -----------------------------------------------------------------

async function targetCareerSlugsFor(userId: string): Promise<string[]> {
  const rows = await db
    .select({ slug: careers.slug })
    .from(studentTargetCareers)
    .innerJoin(careers, eq(careers.id, studentTargetCareers.careerId))
    .where(eq(studentTargetCareers.userId, userId));
  return rows.map((r) => r.slug);
}

async function interestAreaSlugsFor(userId: string): Promise<string[]> {
  const rows = await db
    .select({ slug: studentInterestAreas.groupSlug })
    .from(studentInterestAreas)
    .where(eq(studentInterestAreas.userId, userId));
  // Only surface slugs the catalog still knows about.
  return rows.map((r) => r.slug).filter(isCareerGroupSlug);
}

export type OnboardingState = {
  fullName: string;
  degree: string | null;
  branchSlug: string | null;
  specialization: string | null;
  collegeName: string | null;
  countryCode: string | null;
  currentYear: string | null;
  currentSemester: number | null;
  graduationYear: number | null;
  experienceLevel: string | null;
  careerGoalStatus: "known" | "exploring" | "unsure" | null;
  targetCareerSlugs: string[];
  interestAreaSlugs: string[];
  preferredWorkLocation: string | null;
  careerNotes: string | null;
  profileCompletion: number;
  lastCompletedStep: number;
  completed: boolean;
  resumeStep: number;
};

/** Everything the wizard + profile editor need to render and resume, scoped to `userId`. */
export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const [[profile], [u]] = await Promise.all([
    db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1),
    db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1),
  ]);

  const { slugById } = await branchMaps();
  const [targetCareerSlugs, interestAreaSlugs] = profile
    ? await Promise.all([targetCareerSlugsFor(userId), interestAreaSlugsFor(userId)])
    : [[], []];
  const completed = Boolean(profile?.onboardingCompletedAt);
  const lastCompletedStep = profile?.lastCompletedStep ?? 0;

  return {
    fullName: u?.name ?? "",
    degree: profile?.degree ?? null,
    branchSlug: profile?.branchId ? (slugById.get(profile.branchId) ?? null) : null,
    specialization: profile?.specialization ?? null,
    collegeName: profile?.collegeName ?? null,
    countryCode: profile?.countryCode ?? null,
    currentYear: profile?.currentYear ?? null,
    currentSemester: profile?.currentSemester ?? null,
    graduationYear: profile?.graduationYear ?? null,
    experienceLevel: profile?.experienceLevel ?? null,
    careerGoalStatus: profile?.careerGoalStatus ?? null,
    targetCareerSlugs,
    interestAreaSlugs,
    preferredWorkLocation: profile?.preferredWorkLocation ?? null,
    careerNotes: profile?.careerNotes ?? null,
    profileCompletion: profile?.profileCompletion ?? 0,
    lastCompletedStep,
    completed,
    // Completed profiles reopen at step 1 for editing; incomplete ones jump to
    // the first unfinished step.
    resumeStep: completed ? 1 : Math.min(lastCompletedStep + 1, ONBOARDING_STEP_COUNT),
  };
}

export type StudentProfileSummary = {
  completed: boolean;
  lastCompletedStep: number;
  profileCompletion: number;
  fullName: string;
  degree: string | null;
  branch: string | null;
  specialization: string | null;
  collegeName: string | null;
  country: string | null;
  currentYear: string | null;
  currentSemester: number | null;
  graduationYear: number | null;
  experienceLevel: string | null;
  careerGoalStatus: string | null;
  targetCareers: string[];
  interestAreas: string[];
  preferredWorkLocation: string | null;
  careerNotes: string | null;
};

const label = (list: readonly { value: string; label: string }[], v: string | null | undefined) =>
  list.find((o) => o.value === v)?.label ?? null;

/** Human-readable profile for the dashboard summary card, scoped to `userId`. */
export async function getStudentProfileSummary(
  userId: string,
): Promise<StudentProfileSummary | null> {
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);

  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);

  if (!profile) {
    return u
      ? {
          completed: false,
          lastCompletedStep: 0,
          profileCompletion: 0,
          fullName: u.name,
          degree: null,
          branch: null,
          specialization: null,
          collegeName: null,
          country: null,
          currentYear: null,
          currentSemester: null,
          graduationYear: null,
          experienceLevel: null,
          careerGoalStatus: null,
          targetCareers: [],
          interestAreas: [],
          preferredWorkLocation: null,
          careerNotes: null,
        }
      : null;
  }

  const { slugById } = await branchMaps();
  const branchSlug = profile.branchId ? slugById.get(profile.branchId) : null;
  const branchName = branchSlug
    ? (ENGINEERING_BRANCHES.find((b) => b.slug === branchSlug)?.name ?? null)
    : null;

  const [targetSlugs, interestSlugs] = await Promise.all([
    targetCareerSlugsFor(userId),
    interestAreaSlugsFor(userId),
  ]);
  const targetCareers = targetSlugs
    .map((slug) => CAREERS.find((c) => c.slug === slug)?.name)
    .filter((v): v is string => Boolean(v));
  const interestAreas = interestSlugs
    .map((slug) => careerGroupName(slug))
    .filter((v): v is string => Boolean(v));

  return {
    completed: Boolean(profile.onboardingCompletedAt),
    lastCompletedStep: profile.lastCompletedStep,
    profileCompletion: profile.profileCompletion,
    fullName: u?.name ?? "",
    degree: profile.degree,
    branch: branchName,
    specialization: profile.specialization,
    collegeName: profile.collegeName,
    country: profile.countryCode
      ? (COUNTRIES.find((c) => c.slug === profile.countryCode)?.name ?? profile.countryCode)
      : null,
    currentYear: label(CURRENT_YEARS, profile.currentYear),
    currentSemester: profile.currentSemester,
    graduationYear: profile.graduationYear,
    experienceLevel: label(EXPERIENCE_LEVELS, profile.experienceLevel),
    careerGoalStatus: label(CAREER_GOAL_STATUSES, profile.careerGoalStatus),
    targetCareers,
    interestAreas,
    preferredWorkLocation: profile.preferredWorkLocation,
    careerNotes: profile.careerNotes,
  };
}
