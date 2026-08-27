import { eq } from "drizzle-orm";

import { db } from "./client";
import {
  assessments,
  branchCareerPaths,
  careers,
  careerSkillRequirements,
  engineeringBranches,
  engineeringCategories,
  skills,
} from "./schema";
import { assessmentQuestions, projectCareerRoles, projects, projectSkills } from "./career-schema";
import { SKILLS_CATALOG } from "../skills-catalog";
import { ASSESSMENTS_CATALOG } from "../assessment-catalog";
import { PROJECTS_CATALOG } from "../projects-catalog";
import {
  ENGINEERING_CATEGORIES,
  ENGINEERING_BRANCHES,
  CAREER_PATHS,
  branchCareerLinks,
  careerSkillLinks,
} from "../taxonomy-catalog";

let skillsSeeded = false;
let assessmentsSeeded = false;
let taxonomySeeded = false;
let careerFoundationSeeded = false;

/**
 * Idempotently seeds the canonical skills catalog into the `skills` table.
 * Called lazily from the resume/job server functions instead of a separate
 * migration step, so a fresh `dev.db` self-heals on first use.
 */
export async function ensureSkillsSeeded() {
  if (skillsSeeded) return;

  await db
    .insert(skills)
    .values(SKILLS_CATALOG.map((s) => ({ slug: s.slug, name: s.name, category: s.category })))
    .onConflictDoNothing({ target: skills.slug });

  skillsSeeded = true;
}

/**
 * Idempotently seeds assessment metadata (not question content — that stays in
 * assessment-catalog.ts, server-side only) into the `assessments` table, linked to
 * the skill each one verifies.
 */
export async function ensureAssessmentsSeeded() {
  if (assessmentsSeeded) return;
  await ensureSkillsSeeded();

  const skillRows = await db.select({ id: skills.id, slug: skills.slug }).from(skills);
  const skillIdBySlug = new Map(skillRows.map((s) => [s.slug, s.id]));

  await db
    .insert(assessments)
    .values(
      ASSESSMENTS_CATALOG.map((a) => ({
        slug: a.slug,
        name: a.name,
        type: a.type,
        skillId: skillIdBySlug.get(a.skillSlug) ?? null,
        durationMinutes: a.durationMinutes,
        description: a.description,
      })),
    )
    .onConflictDoNothing({ target: assessments.slug });

  // Mirror the static question bank into `assessment_questions` (server-only —
  // `correct_index` is never selected into a client payload). The app still
  // grades against assessment-catalog.ts; this keeps the DB the source of truth
  // for the question set.
  const assessmentRows = await db
    .select({ id: assessments.id, slug: assessments.slug })
    .from(assessments);
  const assessmentIdBySlug = new Map(assessmentRows.map((a) => [a.slug, a.id]));
  const skillRows2 = await db.select({ id: skills.id, slug: skills.slug }).from(skills);
  const skillIdBySlug2 = new Map(skillRows2.map((s) => [s.slug, s.id]));

  const questionRows = ASSESSMENTS_CATALOG.flatMap((a) => {
    const assessmentId = assessmentIdBySlug.get(a.slug);
    if (!assessmentId) return [];
    return a.questions.map((q, i) => ({
      assessmentId,
      orderIndex: i,
      prompt: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
      skillId: skillIdBySlug2.get(a.skillSlug) ?? null,
      points: 1,
    }));
  });
  if (questionRows.length > 0) {
    await db
      .insert(assessmentQuestions)
      .values(questionRows)
      .onConflictDoNothing({
        target: [assessmentQuestions.assessmentId, assessmentQuestions.orderIndex],
      });
  }

  assessmentsSeeded = true;
}

/**
 * Idempotently seeds the portfolio-project catalog (projects-catalog.ts) into
 * `projects` and its link tables. Deterministic seed data — no users, no
 * personal information. Called lazily from the roadmap builder.
 */
export async function ensureCareerFoundationSeeded() {
  if (careerFoundationSeeded) return;
  await ensureTaxonomySeeded();

  await db
    .insert(projects)
    .values(
      PROJECTS_CATALOG.map((p) => ({
        slug: p.slug,
        title: p.title,
        description: p.description,
        difficulty: p.difficulty,
        technologies: p.technologies,
        estimatedHours: p.estimatedHours,
      })),
    )
    .onConflictDoNothing({ target: projects.slug });

  const [projectRows, skillRows, careerRows] = await Promise.all([
    db.select({ id: projects.id, slug: projects.slug }).from(projects),
    db.select({ id: skills.id, slug: skills.slug }).from(skills),
    db.select({ id: careers.id, slug: careers.slug }).from(careers),
  ]);
  const projectIdBySlug = new Map(projectRows.map((p) => [p.slug, p.id]));
  const skillIdBySlug = new Map(skillRows.map((s) => [s.slug, s.id]));
  const careerIdBySlug = new Map(careerRows.map((c) => [c.slug, c.id]));

  const skillLinks = PROJECTS_CATALOG.flatMap((p) => {
    const projectId = projectIdBySlug.get(p.slug);
    if (!projectId) return [];
    return p.skillSlugs
      .map((s) => ({ projectId, skillId: skillIdBySlug.get(s) }))
      .filter((r): r is { projectId: string; skillId: string } => Boolean(r.skillId));
  });
  if (skillLinks.length > 0) {
    await db
      .insert(projectSkills)
      .values(skillLinks)
      .onConflictDoNothing({ target: [projectSkills.projectId, projectSkills.skillId] });
  }

  const careerLinks = PROJECTS_CATALOG.flatMap((p) => {
    const projectId = projectIdBySlug.get(p.slug);
    if (!projectId) return [];
    return p.careerSlugs
      .map((c) => ({ projectId, careerId: careerIdBySlug.get(c) }))
      .filter((r): r is { projectId: string; careerId: string } => Boolean(r.careerId));
  });
  if (careerLinks.length > 0) {
    await db
      .insert(projectCareerRoles)
      .values(careerLinks)
      .onConflictDoNothing({
        target: [projectCareerRoles.projectId, projectCareerRoles.careerId],
      });
  }

  careerFoundationSeeded = true;
}

/**
 * Idempotently seeds the full engineering + career taxonomy from
 * taxonomy-catalog.ts: categories → branches, career paths, and the
 * branch↔career and career↔skill link tables. Additive (`onConflictDoNothing`),
 * so adding entries to the catalog file just tops the tables up on next boot.
 *
 * Called lazily from the taxonomy + onboarding server functions so a fresh
 * database self-heals on first use.
 */
export async function ensureTaxonomySeeded() {
  if (taxonomySeeded) return;
  await ensureSkillsSeeded();

  await db
    .insert(engineeringCategories)
    .values(
      ENGINEERING_CATEGORIES.map((c) => ({
        slug: c.slug,
        name: c.name,
        description: c.description,
        sortOrder: c.sortOrder,
      })),
    )
    .onConflictDoNothing({ target: engineeringCategories.slug });

  const categoryRows = await db
    .select({ id: engineeringCategories.id, slug: engineeringCategories.slug })
    .from(engineeringCategories);
  const categoryIdBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));

  await db
    .insert(engineeringBranches)
    .values(
      ENGINEERING_BRANCHES.map((b) => ({
        slug: b.slug,
        name: b.name,
        categoryId: categoryIdBySlug.get(b.categorySlug) ?? null,
        aliases: b.aliases ?? null,
        description: b.description ?? null,
      })),
    )
    .onConflictDoNothing({ target: engineeringBranches.slug });

  // Backfill category_id for branch rows seeded before Phase 3.
  for (const b of ENGINEERING_BRANCHES) {
    const categoryId = categoryIdBySlug.get(b.categorySlug);
    if (categoryId) {
      await db
        .update(engineeringBranches)
        .set({ categoryId })
        .where(eq(engineeringBranches.slug, b.slug));
    }
  }

  await db
    .insert(careers)
    .values(
      CAREER_PATHS.map((c) => ({
        slug: c.slug,
        name: c.title,
        category: c.group,
        description: c.description,
      })),
    )
    .onConflictDoNothing({ target: careers.slug });

  const [branchRows, careerRows, skillRows] = await Promise.all([
    db
      .select({ id: engineeringBranches.id, slug: engineeringBranches.slug })
      .from(engineeringBranches),
    db.select({ id: careers.id, slug: careers.slug }).from(careers),
    db.select({ id: skills.id, slug: skills.slug }).from(skills),
  ]);
  const branchIdBySlug = new Map(branchRows.map((b) => [b.slug, b.id]));
  const careerIdBySlug = new Map(careerRows.map((c) => [c.slug, c.id]));
  const skillIdBySlug = new Map(skillRows.map((s) => [s.slug, s.id]));

  const branchCareerRows = branchCareerLinks()
    .map((l) => ({
      branchId: branchIdBySlug.get(l.branchSlug),
      careerId: careerIdBySlug.get(l.careerSlug),
      relevance: l.relevance,
    }))
    .filter((r): r is { branchId: string; careerId: string; relevance: typeof r.relevance } =>
      Boolean(r.branchId && r.careerId),
    );
  if (branchCareerRows.length > 0) {
    await db
      .insert(branchCareerPaths)
      .values(branchCareerRows)
      .onConflictDoNothing({
        target: [branchCareerPaths.branchId, branchCareerPaths.careerId],
      });
  }

  // `requiredLevel` (Phase 6 Skill Gap Engine) is derived from importance.
  const requiredLevelFor = (imp: "core" | "important" | "helpful") =>
    imp === "core" ? "advanced" : imp === "important" ? "intermediate" : "beginner";

  const careerSkillRows = careerSkillLinks()
    .map((l) => ({
      careerId: careerIdBySlug.get(l.careerSlug),
      skillId: skillIdBySlug.get(l.skillSlug),
      importance: l.importance,
      requiredLevel: requiredLevelFor(l.importance) as
        "beginner" | "intermediate" | "advanced" | "expert",
    }))
    .filter(
      (
        r,
      ): r is {
        careerId: string;
        skillId: string;
        importance: typeof r.importance;
        requiredLevel: "beginner" | "intermediate" | "advanced" | "expert";
      } => Boolean(r.careerId && r.skillId),
    );
  if (careerSkillRows.length > 0) {
    await db
      .insert(careerSkillRequirements)
      .values(careerSkillRows)
      .onConflictDoNothing({
        target: [careerSkillRequirements.careerId, careerSkillRequirements.skillId],
      });
  }

  taxonomySeeded = true;
}

/** @deprecated Phase 2 name — kept so existing imports keep working. */
export const ensureOnboardingCatalogSeeded = ensureTaxonomySeeded;
