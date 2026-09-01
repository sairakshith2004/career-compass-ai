import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "./db/client";
import { userSkills, skills } from "./db/schema";
import { projects, projectSkills, projectCareerRoles, studentProjects } from "./db/career-schema";
import { readSessionUser } from "./session.server";
import { ensureCareerFoundationSeeded } from "./db/seed";

/**
 * List all catalog projects with optional career/skill filtering.
 */
export const listProjects = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        careerSlug: z.string().optional(),
        skillSlug: z.string().optional(),
        difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    await ensureCareerFoundationSeeded();

    let rows = await db
      .select({
        id: projects.id,
        slug: projects.slug,
        title: projects.title,
        description: projects.description,
        difficulty: projects.difficulty,
        technologies: projects.technologies,
        estimatedHours: projects.estimatedHours,
      })
      .from(projects)
      .orderBy(projects.difficulty);

    // Filter by difficulty if specified
    if (data?.difficulty) {
      rows = rows.filter((r) => r.difficulty === data.difficulty);
    }

    return rows;
  });

/**
 * Get project recommendations based on the user's skill gaps.
 * Recommends projects that develop skills the user is missing.
 */
export const getProjectRecommendations = createServerFn({ method: "GET" }).handler(async () => {
  const session = await readSessionUser(getRequestHeaders());
  if (!session) return [];

  await ensureCareerFoundationSeeded();

  // Get user's current skill slugs
  const userSkillRows = await db
    .select({ skillId: userSkills.skillId })
    .from(userSkills)
    .where(eq(userSkills.userId, session.id));

  const userSkillIds = new Set(userSkillRows.map((r) => r.skillId));

  // Get all projects with their skill requirements
  const allProjects = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      title: projects.title,
      description: projects.description,
      difficulty: projects.difficulty,
      technologies: projects.technologies,
      estimatedHours: projects.estimatedHours,
    })
    .from(projects);

  const projectSkillRows = await db
    .select({
      projectId: projectSkills.projectId,
      skillId: projectSkills.skillId,
    })
    .from(projectSkills);

  // Score each project: how many skills does the user already have vs need
  const scored = allProjects.map((p) => {
    const requiredSkills = projectSkillRows.filter((s) => s.projectId === p.id);
    const userHas = requiredSkills.filter((s) => userSkillIds.has(s.skillId)).length;
    const userNeeds = requiredSkills.length - userHas;
    const coverage = requiredSkills.length > 0 ? userHas / requiredSkills.length : 0;

    // Recommend projects where user has 30-70% coverage (challenging but feasible)
    const score =
      requiredSkills.length === 0
        ? 50
        : userNeeds > 0 && coverage >= 0.2 && coverage <= 0.8
          ? 70 + Math.round(coverage * 30)
          : coverage > 0.8
            ? 40 // Too easy
            : 20; // Too hard

    return {
      ...p,
      totalSkills: requiredSkills.length,
      userHas,
      userNeeds,
      coverage: Math.round(coverage * 100),
      matchScore: score,
    };
  });

  return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, 12);
});

/**
 * Get the user's tracked projects (started/completed).
 */
export const getUserProjects = createServerFn({ method: "GET" }).handler(async () => {
  const session = await readSessionUser(getRequestHeaders());
  if (!session) return [];

  return db
    .select({
      id: studentProjects.id,
      title: studentProjects.title,
      source: studentProjects.source,
      status: studentProjects.status,
      repoUrl: studentProjects.repoUrl,
      notes: studentProjects.notes,
      startedAt: studentProjects.startedAt,
      completedAt: studentProjects.completedAt,
    })
    .from(studentProjects)
    .where(eq(studentProjects.userId, session.id))
    .orderBy(desc(studentProjects.createdAt));
});

/**
 * Start tracking a project.
 */
export const startProject = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectSlug: z.string().optional(),
      title: z.string().min(1).max(200),
      source: z.enum(["ai_recommended", "user_created", "roadmap_assigned"]),
    }),
  )
  .handler(async ({ data }) => {
    const session = await readSessionUser(getRequestHeaders());
    if (!session) throw new Error("Not signed in");

    let projectId: string | null = null;
    if (data.projectSlug) {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.slug, data.projectSlug))
        .limit(1);
      projectId = project?.id ?? null;
    }

    const [row] = await db
      .insert(studentProjects)
      .values({
        userId: session.id,
        projectId,
        title: data.title,
        source: data.source,
        status: "in_progress",
        startedAt: new Date(),
      })
      .returning();

    return { id: row!.id };
  });

/**
 * Update a tracked project's status.
 */
export const updateProject = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().min(1),
      status: z.enum(["not_started", "in_progress", "completed"]).optional(),
      repoUrl: z.string().url().optional().or(z.literal("")),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await readSessionUser(getRequestHeaders());
    if (!session) throw new Error("Not signed in");

    const updates: Partial<typeof studentProjects.$inferInsert> = { updatedAt: new Date() };
    if (data.status) {
      updates.status = data.status;
      if (data.status === "completed") updates.completedAt = new Date();
      if (data.status === "in_progress" && !updates.startedAt) updates.startedAt = new Date();
    }
    if (data.repoUrl !== undefined) updates.repoUrl = data.repoUrl || null;
    if (data.notes !== undefined) updates.notes = data.notes;

    await db
      .update(studentProjects)
      .set(updates)
      .where(and(eq(studentProjects.id, data.projectId), eq(studentProjects.userId, session.id)));
  });

/**
 * Delete a tracked project.
 */
export const deleteProject = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await readSessionUser(getRequestHeaders());
    if (!session) throw new Error("Not signed in");

    await db
      .delete(studentProjects)
      .where(and(eq(studentProjects.id, data.projectId), eq(studentProjects.userId, session.id)));
  });
