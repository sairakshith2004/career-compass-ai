import { db } from "./client";
import { assessments, skills } from "./schema";
import { SKILLS_CATALOG } from "../skills-catalog";
import { ASSESSMENTS_CATALOG } from "../assessment-catalog";

let skillsSeeded = false;
let assessmentsSeeded = false;

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

  assessmentsSeeded = true;
}
