import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "./db/client";
import { user } from "./db/auth-schema";
import {
  careerSkillRequirements,
  careers,
  engineeringBranches,
  resumeAnalyses,
  resumeCareerSignals,
  skills,
  studentProfiles,
  studentTargetCareers,
  userSkills,
} from "./db/schema";
import { ensureTaxonomySeeded } from "./db/seed";
import { DEGREES, EXPERIENCE_LEVELS } from "./onboarding-catalog";
import {
  ENGINEERING_BRANCHES as BRANCH_LIST,
  CAREER_OPTIONS,
  isBranchSlug,
  isCareerSlug,
  resolveBranchSlug,
} from "./taxonomy-catalog";
import { levelRank, type Level } from "./career-levels";
import {
  INDUSTRIES,
  JOB_TYPES,
  MAX_PREFERRED_LOCATIONS,
  WORK_MODES,
  industryName,
  isIndustrySlug,
  isJobTypeValue,
  isWorkMode,
  jobTypeLabel,
  workModeLabel,
} from "./career-profile-catalog";

/**
 * Career Profile service (Phase 6). Assembles "who the student is + what they
 * currently know + what job they want + what that job requires" and persists
 * the parts the student controls.
 *
 * Every function takes an explicit `userId` from the verified session and
 * scopes every read and write to it. No function accepts a profile id or a
 * target-user id — a career-role slug from the client is only ever used to look
 * up REFERENCE data or as an owner-scoped filter.
 *
 * This phase does NOT compute skill gaps or build roadmaps — it prepares the
 * clean inputs `getPhase7Inputs` hands to the Skill Gap Engine.
 *
 * `.server.ts` — never imported into client code.
 */

// --- validation -------------------------------------------------------------

const experienceValues = EXPERIENCE_LEVELS.map((e) => e.value) as [string, ...string[]];
const CURRENT_MAX_GRAD_YEAR = new Date().getFullYear() + 8;
const MIN_GRAD_YEAR = 1980;

const optionalInt = (schema: z.ZodType<number | undefined>): z.ZodType<number | undefined> =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), schema);

const cleanStrArray = (max: number) =>
  z
    .array(z.string().trim().min(1).max(80))
    .max(max)
    .optional()
    .transform((v) => [...new Set(v ?? [])]);

export const careerProfileSchema = z.object({
  branchSlug: z.string().refine(isBranchSlug, "Unknown branch").optional(),
  specialization: z.string().trim().max(120).optional(),
  degree: z.enum(DEGREES).optional(),
  collegeName: z.string().trim().max(160).optional(),
  graduationYear: optionalInt(
    z.number().int().min(MIN_GRAD_YEAR).max(CURRENT_MAX_GRAD_YEAR).optional(),
  ),
  experienceLevel: z.enum(experienceValues).optional(),
  careerGoals: z.string().trim().max(2000).optional(),
  preferredIndustries: z
    .array(z.string().refine(isIndustrySlug, "Unknown industry"))
    .max(12)
    .optional()
    .transform((v) => [...new Set(v ?? [])]),
  preferredJobTypes: z
    .array(z.string().refine(isJobTypeValue, "Unknown job type"))
    .max(JOB_TYPES.length)
    .optional()
    .transform((v) => [...new Set(v ?? [])]),
  preferredLocations: cleanStrArray(MAX_PREFERRED_LOCATIONS),
  workMode: z
    .string()
    .refine(isWorkMode, "Unknown work mode")
    .optional()
    .transform((v) => (v && isWorkMode(v) ? v : undefined)),
  targetRoleSlugs: z
    .array(z.string().refine(isCareerSlug, "Unknown role"))
    .max(10)
    .optional()
    .transform((v) => [...new Set(v ?? [])]),
  primaryRoleSlug: z.string().refine(isCareerSlug, "Unknown role").optional(),
});

export type CareerProfileInput = z.input<typeof careerProfileSchema>;

export const targetRoleSchema = z.object({
  roleSlug: z.string().refine(isCareerSlug, "Unknown role"),
});

// --- static catalog for the frontend --------------------------------------

export type CareerProfileCatalog = {
  roles: { slug: string; name: string; category: string }[];
  branches: { slug: string; name: string }[];
  degrees: string[];
  experienceLevels: { value: string; label: string }[];
  industries: { slug: string; name: string }[];
  jobTypes: { value: string; label: string }[];
  workModes: { value: string; label: string }[];
  maxTargetRoles: number;
  maxPreferredLocations: number;
};

export function careerProfileCatalog(): CareerProfileCatalog {
  return {
    roles: CAREER_OPTIONS.map((c) => ({ slug: c.slug, name: c.name, category: c.category })),
    branches: BRANCH_LIST.map((b) => ({ slug: b.slug, name: b.name })),
    degrees: [...DEGREES],
    experienceLevels: EXPERIENCE_LEVELS.map((e) => ({ value: e.value, label: e.label })),
    industries: INDUSTRIES.map((i) => ({ slug: i.slug, name: i.name })),
    jobTypes: JOB_TYPES.map((j) => ({ value: j.value, label: j.label })),
    workModes: WORK_MODES.map((w) => ({ value: w.value, label: w.label })),
    maxTargetRoles: 10,
    maxPreferredLocations: MAX_PREFERRED_LOCATIONS,
  };
}

// --- helpers -------------------------------------------------------------

async function branchMaps() {
  await ensureTaxonomySeeded();
  const rows = await db
    .select({ id: engineeringBranches.id, slug: engineeringBranches.slug })
    .from(engineeringBranches);
  return {
    idBySlug: new Map(rows.map((r) => [r.slug, r.id])),
    slugById: new Map(rows.map((r) => [r.id, r.slug])),
  };
}

async function careerMaps() {
  await ensureTaxonomySeeded();
  const rows = await db
    .select({ id: careers.id, slug: careers.slug, name: careers.name })
    .from(careers);
  return {
    idBySlug: new Map(rows.map((r) => [r.slug, r.id])),
    slugById: new Map(rows.map((r) => [r.id, r.slug])),
    nameBySlug: new Map(rows.map((r) => [r.slug, r.name])),
  };
}

const BRANCH_NAME = new Map(BRANCH_LIST.map((b) => [b.slug, b.name]));
const EXPERIENCE_LABEL = new Map(EXPERIENCE_LEVELS.map((e) => [e.value, e.label]));

// --- target roles -------------------------------------------------------

export type TargetRoleRow = {
  slug: string;
  name: string;
  category: string;
  isPrimary: boolean;
  addedAt: Date;
};

async function targetRolesFor(userId: string): Promise<TargetRoleRow[]> {
  const rows = await db
    .select({
      slug: careers.slug,
      name: careers.name,
      category: careers.category,
      isPrimary: studentTargetCareers.isPrimary,
      addedAt: studentTargetCareers.createdAt,
    })
    .from(studentTargetCareers)
    .innerJoin(careers, eq(careers.id, studentTargetCareers.careerId))
    .where(eq(studentTargetCareers.userId, userId))
    .orderBy(desc(studentTargetCareers.isPrimary), studentTargetCareers.createdAt);
  return rows;
}

/** Ensure exactly-one-primary: the given career id becomes primary, all others demoted. */
async function makePrimary(userId: string, careerId: string) {
  await db
    .update(studentTargetCareers)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(eq(studentTargetCareers.userId, userId));
  await db
    .update(studentTargetCareers)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(
      and(eq(studentTargetCareers.userId, userId), eq(studentTargetCareers.careerId, careerId)),
    );
}

/** Add a role to the caller's target set (no-op if already there). */
export async function addTargetRole(userId: string, roleSlug: string): Promise<TargetRoleRow[]> {
  const { idBySlug } = await careerMaps();
  const careerId = idBySlug.get(roleSlug);
  if (!careerId) throw new Error("Unknown role");

  const existing = await db
    .select({ n: sql<number>`count(*)` })
    .from(studentTargetCareers)
    .where(eq(studentTargetCareers.userId, userId));
  const count = Number(existing[0]?.n ?? 0);
  if (count >= 10) throw new Error("You can track up to 10 target roles");

  await db
    .insert(studentTargetCareers)
    .values({ userId, careerId, isPrimary: count === 0 })
    .onConflictDoNothing();
  await recomputeCompletion(userId);
  return targetRolesFor(userId);
}

/** Remove a role from the caller's target set. If it was primary, promote another. */
export async function removeTargetRole(userId: string, roleSlug: string): Promise<TargetRoleRow[]> {
  const { idBySlug } = await careerMaps();
  const careerId = idBySlug.get(roleSlug);
  if (!careerId) throw new Error("Unknown role");

  const [row] = await db
    .select()
    .from(studentTargetCareers)
    .where(
      and(eq(studentTargetCareers.userId, userId), eq(studentTargetCareers.careerId, careerId)),
    )
    .limit(1);
  if (!row) return targetRolesFor(userId);

  await db
    .delete(studentTargetCareers)
    .where(
      and(eq(studentTargetCareers.userId, userId), eq(studentTargetCareers.careerId, careerId)),
    );

  if (row.isPrimary) {
    const [next] = await db
      .select({ careerId: studentTargetCareers.careerId })
      .from(studentTargetCareers)
      .where(eq(studentTargetCareers.userId, userId))
      .orderBy(studentTargetCareers.createdAt)
      .limit(1);
    if (next) await makePrimary(userId, next.careerId);
  }
  await recomputeCompletion(userId);
  return targetRolesFor(userId);
}

/** Set the caller's primary target role, adding it to the set first if needed. */
export async function setPrimaryTargetRole(
  userId: string,
  roleSlug: string,
): Promise<TargetRoleRow[]> {
  const { idBySlug } = await careerMaps();
  const careerId = idBySlug.get(roleSlug);
  if (!careerId) throw new Error("Unknown role");

  await db
    .insert(studentTargetCareers)
    .values({ userId, careerId, isPrimary: true })
    .onConflictDoNothing();
  await makePrimary(userId, careerId);
  await recomputeCompletion(userId);
  return targetRolesFor(userId);
}

/** Reference-data search over the role catalog (no user data). */
export function searchTargetRoles(
  q: string,
  limit = 30,
): { slug: string; name: string; category: string }[] {
  const needle = q.trim().toLowerCase();
  const all = CAREER_OPTIONS.map((c) => ({ slug: c.slug, name: c.name, category: c.category }));
  if (!needle) return all.slice(0, limit);
  return all
    .filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.category.toLowerCase().includes(needle) ||
        r.slug.includes(needle),
    )
    .slice(0, limit);
}

// --- role requirements (reference: "what that job requires") ----------------

export type RoleRequirement = {
  skillSlug: string;
  skillName: string;
  category: string | null;
  importance: "core" | "important" | "helpful";
  requiredLevel: Level;
};

export type RoleRequirements = {
  slug: string;
  name: string;
  category: string;
  requirements: RoleRequirement[];
  counts: { core: number; important: number; helpful: number };
};

/** The skills a target role requires + the level expected. Pure reference data. */
export async function getRoleRequirements(roleSlug: string): Promise<RoleRequirements | null> {
  await ensureTaxonomySeeded();
  const [career] = await db
    .select({ id: careers.id, slug: careers.slug, name: careers.name, category: careers.category })
    .from(careers)
    .where(eq(careers.slug, roleSlug))
    .limit(1);
  if (!career) return null;

  const rows = await db
    .select({
      skillSlug: skills.slug,
      skillName: skills.name,
      category: skills.category,
      importance: careerSkillRequirements.importance,
      requiredLevel: careerSkillRequirements.requiredLevel,
    })
    .from(careerSkillRequirements)
    .innerJoin(skills, eq(skills.id, careerSkillRequirements.skillId))
    .where(eq(careerSkillRequirements.careerId, career.id));

  const order = { core: 0, important: 1, helpful: 2 } as const;
  const requirements = rows
    .map((r) => ({ ...r, requiredLevel: r.requiredLevel as Level }))
    .sort(
      (a, b) => order[a.importance] - order[b.importance] || a.skillName.localeCompare(b.skillName),
    );

  return {
    slug: career.slug,
    name: career.name,
    category: career.category,
    requirements,
    counts: {
      core: requirements.filter((r) => r.importance === "core").length,
      important: requirements.filter((r) => r.importance === "important").length,
      helpful: requirements.filter((r) => r.importance === "helpful").length,
    },
  };
}

// --- current skills ("what they currently know") --------------------------

export type CurrentSkill = {
  skillSlug: string;
  skillName: string;
  category: string | null;
  level: Level | null;
  source: string | null;
  score: number | null;
};

async function currentSkillsFor(userId: string): Promise<CurrentSkill[]> {
  const rows = await db
    .select({
      skillSlug: skills.slug,
      skillName: skills.name,
      category: skills.category,
      currentLevel: userSkills.currentLevel,
      verifiedLevel: userSkills.verifiedLevel,
      claimedLevel: userSkills.claimedLevel,
      source: userSkills.source,
      score: userSkills.score,
    })
    .from(userSkills)
    .innerJoin(skills, eq(skills.id, userSkills.skillId))
    .where(eq(userSkills.userId, userId));

  return rows
    .map((r) => {
      const candidates = [r.verifiedLevel, r.currentLevel, r.claimedLevel].filter(
        (l): l is Level => l != null,
      );
      const level =
        candidates.length === 0
          ? null
          : candidates.reduce((best, l) => (levelRank(l) > levelRank(best) ? l : best));
      return {
        skillSlug: r.skillSlug,
        skillName: r.skillName,
        category: r.category,
        level,
        source: r.source,
        score: r.score,
      };
    })
    .sort(
      (a, b) => levelRank(b.level) - levelRank(a.level) || a.skillName.localeCompare(b.skillName),
    );
}

// --- AI-detected suggestions (editable, never auto-applied) ----------------

export type DetectedSuggestions = {
  fromResumeAt: Date | null;
  branchSlug: string | null;
  branchName: string | null;
  branchConfidence: number | null;
  branchUncertain: boolean;
  specialization: string | null;
  experienceLevel: string | null;
  degree: string | null;
  collegeName: string | null;
  graduationYear: number | null;
  suggestedRoles: { title: string; slug: string | null; score: number }[];
};

async function detectedSuggestionsFor(userId: string): Promise<DetectedSuggestions | null> {
  const [analysis] = await db
    .select()
    .from(resumeAnalyses)
    .where(eq(resumeAnalyses.userId, userId))
    .orderBy(desc(resumeAnalyses.createdAt))
    .limit(1);
  if (!analysis) return null;

  const signalRows = await db
    .select({
      title: resumeCareerSignals.careerTitleRaw,
      slug: careers.slug,
      score: resumeCareerSignals.score,
    })
    .from(resumeCareerSignals)
    .leftJoin(careers, eq(careers.id, resumeCareerSignals.careerId))
    .where(eq(resumeCareerSignals.analysisId, analysis.id))
    .orderBy(desc(resumeCareerSignals.score))
    .limit(6);

  return {
    fromResumeAt: analysis.createdAt,
    branchSlug: analysis.aiBranchSlug,
    branchName: analysis.aiBranchSlug
      ? (BRANCH_NAME.get(analysis.aiBranchSlug) ?? analysis.aiBranchSlug)
      : null,
    branchConfidence: analysis.aiBranchConfidence,
    branchUncertain: Boolean(analysis.aiBranchUncertain),
    specialization: analysis.aiSpecialization,
    experienceLevel: analysis.aiExperienceLevel,
    degree: analysis.extractedDegree,
    collegeName: analysis.extractedCollege,
    graduationYear: analysis.extractedGraduationYear,
    suggestedRoles: signalRows.map((s) => ({
      title: s.title,
      slug: s.slug ?? null,
      score: s.score,
    })),
  };
}

// --- completion bump ---------------------------------------------------------

/** Keep `student_profiles.profile_completion` roughly current after a write. */
async function recomputeCompletion(userId: string) {
  const { computeProfileCompletion } = await import("./profile-completion");
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  if (!profile) return;
  const [[u], [targets]] = await Promise.all([
    db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1),
    db
      .select({ n: sql<number>`count(*)` })
      .from(studentTargetCareers)
      .where(eq(studentTargetCareers.userId, userId)),
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
    interestAreaCount: 0,
  });
  await db
    .update(studentProfiles)
    .set({ profileCompletion, updatedAt: new Date() })
    .where(eq(studentProfiles.userId, userId));
}

// --- the assembled Career Profile -----------------------------------------

export type CareerProfileView = {
  identity: {
    fullName: string;
    branchSlug: string | null;
    branchName: string | null;
    specialization: string | null;
    degree: string | null;
    collegeName: string | null;
    graduationYear: number | null;
    experienceLevel: string | null;
    experienceLabel: string | null;
  };
  careerGoals: string | null;
  preferences: {
    industries: { slug: string; name: string }[];
    jobTypes: { value: string; label: string }[];
    locations: string[];
    workMode: string | null;
    workModeLabel: string | null;
  };
  targetRoles: TargetRoleRow[];
  primaryRole: TargetRoleRow | null;
  currentSkills: CurrentSkill[];
  detected: DetectedSuggestions | null;
  phase7: Phase7Readiness;
};

/** The full Career Profile for the caller. Scoped to `userId`. */
export async function getCareerProfile(userId: string): Promise<CareerProfileView> {
  const [[profile], [u]] = await Promise.all([
    db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1),
    db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1),
  ]);
  const { slugById } = await branchMaps();

  const [targetRoles, currentSkills, detected] = await Promise.all([
    targetRolesFor(userId),
    currentSkillsFor(userId),
    detectedSuggestionsFor(userId),
  ]);

  const branchSlug = profile?.branchId ? (slugById.get(profile.branchId) ?? null) : null;
  const industries = (profile?.preferredIndustries ?? [])
    .filter(isIndustrySlug)
    .map((slug) => ({ slug, name: industryName(slug) ?? slug }));
  const jobTypes = (profile?.preferredJobTypes ?? [])
    .filter(isJobTypeValue)
    .map((value) => ({ value, label: jobTypeLabel(value) ?? value }));

  const primaryRole = targetRoles.find((r) => r.isPrimary) ?? null;

  return {
    identity: {
      fullName: u?.name ?? "",
      branchSlug,
      branchName: branchSlug ? (BRANCH_NAME.get(branchSlug) ?? branchSlug) : null,
      specialization: profile?.specialization ?? null,
      degree: profile?.degree ?? null,
      collegeName: profile?.collegeName ?? null,
      graduationYear: profile?.graduationYear ?? null,
      experienceLevel: profile?.experienceLevel ?? null,
      experienceLabel: profile?.experienceLevel
        ? (EXPERIENCE_LABEL.get(profile.experienceLevel) ?? profile.experienceLevel)
        : null,
    },
    careerGoals: profile?.careerNotes ?? null,
    preferences: {
      industries,
      jobTypes,
      locations: profile?.preferredLocations ?? [],
      workMode: profile?.workMode ?? null,
      workModeLabel: profile?.workMode ? workModeLabel(profile.workMode) : null,
    },
    targetRoles,
    primaryRole,
    currentSkills,
    detected,
    phase7: await computePhase7Readiness(userId, primaryRole, currentSkills),
  };
}

/** One-shot save of the editable Career Profile fields. */
export async function updateCareerProfile(userId: string, raw: CareerProfileInput) {
  const data = careerProfileSchema.parse(raw);
  const { idBySlug: branchIdBySlug } = await branchMaps();
  const { idBySlug: careerIdBySlug } = await careerMaps();

  const canonicalBranch = data.branchSlug ? resolveBranchSlug(data.branchSlug) : null;
  const locations = data.preferredLocations.slice(0, MAX_PREFERRED_LOCATIONS);

  const fields: Partial<typeof studentProfiles.$inferInsert> = {
    branchId: canonicalBranch ? (branchIdBySlug.get(canonicalBranch) ?? null) : null,
    specialization: data.specialization ?? null,
    degree: data.degree ?? null,
    collegeName: data.collegeName ?? null,
    graduationYear: data.graduationYear ?? null,
    experienceLevel:
      (data.experienceLevel as typeof studentProfiles.$inferInsert.experienceLevel) ?? null,
    careerNotes: data.careerGoals ?? null,
    preferredIndustries: data.preferredIndustries,
    preferredJobTypes: data.preferredJobTypes,
    preferredLocations: locations,
    preferredWorkLocation: locations[0] ?? null, // back-compat mirror
    workMode: (data.workMode as typeof studentProfiles.$inferInsert.workMode) ?? null,
  };

  await db
    .insert(studentProfiles)
    .values({ userId, ...fields })
    .onConflictDoUpdate({
      target: studentProfiles.userId,
      set: { ...fields, updatedAt: new Date() },
    });

  // Target roles: replace the set, then apply the primary.
  if (data.targetRoleSlugs.length > 0 || data.primaryRoleSlug) {
    const want = new Set(data.targetRoleSlugs);
    if (data.primaryRoleSlug) want.add(data.primaryRoleSlug);
    const ids = [...want].map((s) => careerIdBySlug.get(s)).filter((v): v is string => Boolean(v));

    await db.delete(studentTargetCareers).where(eq(studentTargetCareers.userId, userId));
    if (ids.length > 0) {
      await db
        .insert(studentTargetCareers)
        .values(ids.map((careerId) => ({ userId, careerId })))
        .onConflictDoNothing();
    }
    const primaryId = data.primaryRoleSlug ? careerIdBySlug.get(data.primaryRoleSlug) : ids[0];
    if (primaryId) await makePrimary(userId, primaryId);
  }

  await recomputeCompletion(userId);
  return { ok: true as const };
}

// --- Phase 7 handoff -----------------------------------------------------

export type Phase7Readiness = {
  ready: boolean;
  hasPrimaryRole: boolean;
  hasBranch: boolean;
  hasResumeAnalysis: boolean;
  currentSkillCount: number;
  requiredSkillCount: number;
  coveredRequiredSkills: number;
  missing: string[];
};

async function computePhase7Readiness(
  userId: string,
  primaryRole: TargetRoleRow | null,
  currentSkills: CurrentSkill[],
): Promise<Phase7Readiness> {
  const { idBySlug } = await careerMaps();
  const [profile] = await db
    .select({ branchId: studentProfiles.branchId })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  const [analysisCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(resumeAnalyses)
    .where(eq(resumeAnalyses.userId, userId));

  let requiredSkillCount = 0;
  let coveredRequiredSkills = 0;
  if (primaryRole) {
    const careerId = idBySlug.get(primaryRole.slug);
    if (careerId) {
      const reqs = await db
        .select({ skillSlug: skills.slug })
        .from(careerSkillRequirements)
        .innerJoin(skills, eq(skills.id, careerSkillRequirements.skillId))
        .where(eq(careerSkillRequirements.careerId, careerId));
      requiredSkillCount = reqs.length;
      const held = new Set(currentSkills.filter((s) => s.level != null).map((s) => s.skillSlug));
      coveredRequiredSkills = reqs.filter((r) => held.has(r.skillSlug)).length;
    }
  }

  const hasPrimaryRole = Boolean(primaryRole);
  const hasBranch = Boolean(profile?.branchId);
  const hasResumeAnalysis = Number(analysisCount?.n ?? 0) > 0;
  const currentSkillCount = currentSkills.length;

  const missing: string[] = [];
  if (!hasPrimaryRole) missing.push("Choose a primary target role");
  if (currentSkillCount === 0) missing.push("Add skills (upload a résumé or take an assessment)");
  if (!hasBranch) missing.push("Set your engineering branch");

  return {
    ready: hasPrimaryRole && currentSkillCount > 0,
    hasPrimaryRole,
    hasBranch,
    hasResumeAnalysis,
    currentSkillCount,
    requiredSkillCount,
    coveredRequiredSkills,
    missing,
  };
}

export type Phase7Inputs = {
  profile: {
    branchSlug: string | null;
    specialization: string | null;
    experienceLevel: string | null;
    graduationYear: number | null;
  };
  primaryRole: { slug: string; name: string; careerId: string } | null;
  targetRoles: { slug: string; name: string; isPrimary: boolean }[];
  requiredSkills: RoleRequirement[];
  currentSkills: CurrentSkill[];
  readiness: Phase7Readiness;
};

/**
 * The clean, self-contained data set Phase 7's Skill Gap Engine consumes:
 * the student's declared identity, their current skills, their chosen primary
 * role, and that role's skill requirements. No gaps are computed here.
 */
export async function getPhase7Inputs(userId: string): Promise<Phase7Inputs> {
  const [[profile], targetRoles, currentSkills] = await Promise.all([
    db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1),
    targetRolesFor(userId),
    currentSkillsFor(userId),
  ]);
  const { slugById, idBySlug } = await branchAndCareerMaps();

  const primary = targetRoles.find((r) => r.isPrimary) ?? null;
  const primaryCareerId = primary ? (idBySlug.get(primary.slug) ?? null) : null;
  const requiredSkills =
    primary && primaryCareerId
      ? ((await getRoleRequirements(primary.slug))?.requirements ?? [])
      : [];

  return {
    profile: {
      branchSlug: profile?.branchId ? (slugById.get(profile.branchId) ?? null) : null,
      specialization: profile?.specialization ?? null,
      experienceLevel: profile?.experienceLevel ?? null,
      graduationYear: profile?.graduationYear ?? null,
    },
    primaryRole:
      primary && primaryCareerId
        ? { slug: primary.slug, name: primary.name, careerId: primaryCareerId }
        : null,
    targetRoles: targetRoles.map((r) => ({ slug: r.slug, name: r.name, isPrimary: r.isPrimary })),
    requiredSkills,
    currentSkills,
    readiness: await computePhase7Readiness(userId, primary, currentSkills),
  };
}

async function branchAndCareerMaps() {
  const [b, c] = await Promise.all([branchMaps(), careerMaps()]);
  return { slugById: b.slugById, idBySlug: c.idBySlug };
}
