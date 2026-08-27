import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "./db/client";
import {
  branchCareerPaths,
  careerSkillRequirements,
  careers,
  engineeringBranches,
  engineeringCategories,
  skills,
} from "./db/schema";
import { ensureTaxonomySeeded } from "./db/seed";

/**
 * Read-only services over the engineering + career taxonomy. Everything is
 * derived from the database (seeded from taxonomy-catalog.ts), so adding a
 * branch/career/skill link is a data change with no code impact here.
 *
 * This is public reference data — no per-user scoping, no auth. `.server.ts`
 * only because it touches the DB.
 */

const RELEVANCE_ORDER = { primary: 0, common: 1, possible: 2 } as const;
const IMPORTANCE_ORDER = { core: 0, important: 1, helpful: 2 } as const;

export type CategoryWithCount = {
  slug: string;
  name: string;
  description: string | null;
  branchCount: number;
};

export type BranchSummary = {
  slug: string;
  name: string;
  aliases: string[];
  description: string | null;
  categorySlug: string | null;
  categoryName: string | null;
};

export type CategoryWithBranches = {
  slug: string;
  name: string;
  description: string | null;
  branches: { slug: string; name: string; aliases: string[]; description: string | null }[];
};

export type CareerSummary = {
  slug: string;
  title: string;
  group: string;
  description: string | null;
};

export type CareerForBranch = CareerSummary & {
  relevance: "primary" | "common" | "possible";
};

export type CareerDetail = CareerSummary & {
  skills: {
    core: { slug: string; name: string }[];
    important: { slug: string; name: string }[];
    helpful: { slug: string; name: string }[];
  };
  reachableFromBranches: {
    slug: string;
    name: string;
    relevance: "primary" | "common" | "possible";
  }[];
};

// --- categories ------------------------------------------------------------

/** All engineering categories, ordered, with how many branches each holds. */
export async function getEngineeringCategories(): Promise<CategoryWithCount[]> {
  await ensureTaxonomySeeded();
  const rows = await db
    .select({
      slug: engineeringCategories.slug,
      name: engineeringCategories.name,
      description: engineeringCategories.description,
      branchCount: sql<number>`count(${engineeringBranches.id})`,
    })
    .from(engineeringCategories)
    .leftJoin(engineeringBranches, eq(engineeringBranches.categoryId, engineeringCategories.id))
    .groupBy(engineeringCategories.id)
    .orderBy(asc(engineeringCategories.sortOrder), asc(engineeringCategories.name));
  return rows.map((r) => ({ ...r, branchCount: Number(r.branchCount) }));
}

// --- branches / specializations ------------------------------------------

/**
 * Engineering branches / specializations. Pass `categorySlug` to scope to one
 * category (e.g. "computer-science-it" for the CSE specialization list).
 */
export async function getBranches(
  opts: { categorySlug?: string | undefined } = {},
): Promise<BranchSummary[]> {
  await ensureTaxonomySeeded();
  const rows = await db
    .select({
      slug: engineeringBranches.slug,
      name: engineeringBranches.name,
      aliases: engineeringBranches.aliases,
      description: engineeringBranches.description,
      categorySlug: engineeringCategories.slug,
      categoryName: engineeringCategories.name,
    })
    .from(engineeringBranches)
    .leftJoin(engineeringCategories, eq(engineeringBranches.categoryId, engineeringCategories.id))
    .orderBy(asc(engineeringBranches.name));

  return rows
    .filter((r) => !opts.categorySlug || r.categorySlug === opts.categorySlug)
    .map((r) => ({ ...r, aliases: r.aliases ?? [] }));
}

/** Alias — the taxonomy spec calls branch-scoped lookups "specializations". */
export const getSpecializations = (categorySlug: string) => getBranches({ categorySlug });

/** Categories with their branches nested — one call for a grouped picker. */
export async function getTaxonomyTree(): Promise<CategoryWithBranches[]> {
  await ensureTaxonomySeeded();
  const [categories, branches] = await Promise.all([
    db
      .select()
      .from(engineeringCategories)
      .orderBy(asc(engineeringCategories.sortOrder), asc(engineeringCategories.name)),
    db
      .select({
        slug: engineeringBranches.slug,
        name: engineeringBranches.name,
        aliases: engineeringBranches.aliases,
        description: engineeringBranches.description,
        categoryId: engineeringBranches.categoryId,
      })
      .from(engineeringBranches)
      .orderBy(asc(engineeringBranches.name)),
  ]);

  return categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    description: c.description,
    branches: branches
      .filter((b) => b.categoryId === c.id)
      .map((b) => ({
        slug: b.slug,
        name: b.name,
        aliases: b.aliases ?? [],
        description: b.description,
      })),
  }));
}

export async function getBranch(
  slug: string,
): Promise<(BranchSummary & { topCareers: CareerForBranch[] }) | null> {
  await ensureTaxonomySeeded();
  const [branch] = await getBranches().then((all) => all.filter((b) => b.slug === slug));
  if (!branch) return null;
  const topCareers = (await getCareersForBranch(slug)).slice(0, 8);
  return { ...branch, topCareers };
}

// --- career paths -------------------------------------------------------

/** All career paths, ordered by display group then title. Optional group filter. */
export async function getCareerPaths(
  opts: { group?: string | undefined } = {},
): Promise<CareerSummary[]> {
  await ensureTaxonomySeeded();
  const rows = await db
    .select({
      slug: careers.slug,
      title: careers.name,
      group: careers.category,
      description: careers.description,
    })
    .from(careers)
    .orderBy(asc(careers.category), asc(careers.name));
  return rows.filter((r) => !opts.group || r.group === opts.group);
}

/**
 * Careers reachable from a branch — the "careers compatible with a branch"
 * query. Ordered primary → common → possible, then by title.
 */
export async function getCareersForBranch(branchSlug: string): Promise<CareerForBranch[]> {
  await ensureTaxonomySeeded();
  const rows = await db
    .select({
      slug: careers.slug,
      title: careers.name,
      group: careers.category,
      description: careers.description,
      relevance: branchCareerPaths.relevance,
    })
    .from(branchCareerPaths)
    .innerJoin(engineeringBranches, eq(engineeringBranches.id, branchCareerPaths.branchId))
    .innerJoin(careers, eq(careers.id, branchCareerPaths.careerId))
    .where(eq(engineeringBranches.slug, branchSlug));

  return rows.sort(
    (a, b) =>
      RELEVANCE_ORDER[a.relevance] - RELEVANCE_ORDER[b.relevance] || a.title.localeCompare(b.title),
  );
}

/** One career with its skill requirements and the branches it's reachable from. */
export async function getCareerPath(slug: string): Promise<CareerDetail | null> {
  await ensureTaxonomySeeded();
  const [career] = await db
    .select({
      id: careers.id,
      slug: careers.slug,
      title: careers.name,
      group: careers.category,
      description: careers.description,
    })
    .from(careers)
    .where(eq(careers.slug, slug))
    .limit(1);
  if (!career) return null;

  const skillRows = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      importance: careerSkillRequirements.importance,
    })
    .from(careerSkillRequirements)
    .innerJoin(skills, eq(skills.id, careerSkillRequirements.skillId))
    .where(eq(careerSkillRequirements.careerId, career.id));

  skillRows.sort(
    (a, b) =>
      IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance] ||
      a.name.localeCompare(b.name),
  );

  const branchRows = await db
    .select({
      slug: engineeringBranches.slug,
      name: engineeringBranches.name,
      relevance: branchCareerPaths.relevance,
    })
    .from(branchCareerPaths)
    .innerJoin(engineeringBranches, eq(engineeringBranches.id, branchCareerPaths.branchId))
    .where(eq(branchCareerPaths.careerId, career.id));

  branchRows.sort(
    (a, b) =>
      RELEVANCE_ORDER[a.relevance] - RELEVANCE_ORDER[b.relevance] || a.name.localeCompare(b.name),
  );

  return {
    slug: career.slug,
    title: career.title,
    group: career.group,
    description: career.description,
    skills: {
      core: skillRows
        .filter((s) => s.importance === "core")
        .map((s) => ({ slug: s.slug, name: s.name })),
      important: skillRows
        .filter((s) => s.importance === "important")
        .map((s) => ({ slug: s.slug, name: s.name })),
      helpful: skillRows
        .filter((s) => s.importance === "helpful")
        .map((s) => ({ slug: s.slug, name: s.name })),
    },
    reachableFromBranches: branchRows,
  };
}

// --- skills ------------------------------------------------------------

export type SkillSummary = { slug: string; name: string; category: string | null };

/** The skill catalog (optionally scoped to a category). */
export async function getSkills(
  opts: { category?: string | undefined } = {},
): Promise<SkillSummary[]> {
  await ensureTaxonomySeeded();
  const rows = await db
    .select({ slug: skills.slug, name: skills.name, category: skills.category })
    .from(skills)
    .orderBy(asc(skills.category), asc(skills.name));
  return rows.filter((r) => !opts.category || r.category === opts.category);
}

/** Careers that require a given skill, with how central the skill is to each. */
export async function getCareersForSkill(
  skillSlug: string,
): Promise<(CareerSummary & { importance: "core" | "important" | "helpful" })[]> {
  await ensureTaxonomySeeded();
  const rows = await db
    .select({
      slug: careers.slug,
      title: careers.name,
      group: careers.category,
      description: careers.description,
      importance: careerSkillRequirements.importance,
    })
    .from(careerSkillRequirements)
    .innerJoin(skills, eq(skills.id, careerSkillRequirements.skillId))
    .innerJoin(careers, eq(careers.id, careerSkillRequirements.careerId))
    .where(eq(skills.slug, skillSlug));

  return rows.sort(
    (a, b) =>
      IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance] ||
      a.title.localeCompare(b.title),
  );
}

/** Union of skill requirements across a set of careers — for the "if you target
 * these careers, here's the combined skill set" view used later phases. */
export async function getSkillsForCareers(careerSlugs: string[]): Promise<
  {
    slug: string;
    name: string;
    importance: "core" | "important" | "helpful";
    careerCount: number;
  }[]
> {
  if (careerSlugs.length === 0) return [];
  await ensureTaxonomySeeded();
  const rows = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      importance: careerSkillRequirements.importance,
    })
    .from(careerSkillRequirements)
    .innerJoin(skills, eq(skills.id, careerSkillRequirements.skillId))
    .innerJoin(careers, eq(careers.id, careerSkillRequirements.careerId))
    .where(inArray(careers.slug, careerSlugs));

  const merged = new Map<
    string,
    {
      slug: string;
      name: string;
      importance: "core" | "important" | "helpful";
      careerCount: number;
    }
  >();
  for (const r of rows) {
    const existing = merged.get(r.slug);
    if (!existing) {
      merged.set(r.slug, { slug: r.slug, name: r.name, importance: r.importance, careerCount: 1 });
    } else {
      existing.careerCount += 1;
      if (IMPORTANCE_ORDER[r.importance] < IMPORTANCE_ORDER[existing.importance]) {
        existing.importance = r.importance;
      }
    }
  }
  return [...merged.values()].sort(
    (a, b) =>
      IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance] ||
      b.careerCount - a.careerCount ||
      a.name.localeCompare(b.name),
  );
}
