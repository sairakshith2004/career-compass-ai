import { and, desc, eq, ne, sql } from "drizzle-orm";

import { db } from "./db/client";
import { careers } from "./db/schema";
import {
  careerGoals,
  careerRoadmaps,
  roadmapPhases,
  roadmapTasks,
  taskProgress,
  type TaskStatus,
} from "./db/career-schema";
import { ensureTaxonomySeeded } from "./db/seed";
import { buildTemplateRoadmap } from "./roadmap-builder.server";
import {
  getSkillGapsForGoal,
  recomputeSkillGaps,
  type SkillGapRow,
} from "./skill-gap-engine.server";
import { getLastActivity, recordActivity } from "./activity.server";

/**
 * Career-journey service. The DATABASE is the source of truth for a student's
 * career state; this module is the only place that reads/writes it, and every
 * function is scoped to a `userId` from the verified session.
 *
 * `.server.ts` — server-only.
 */

// --- career goals -----------------------------------------------------

export type CareerGoalRow = {
  id: string;
  careerId: string;
  careerSlug: string;
  careerName: string;
  status: "active" | "achieved" | "abandoned" | "paused";
  isPrimary: boolean;
  priority: number;
  targetDate: Date | null;
  createdAt: Date;
};

async function resolveCareer(slugOrId: string): Promise<{ id: string; name: string } | null> {
  const [bySlug] = await db
    .select({ id: careers.id, name: careers.name })
    .from(careers)
    .where(eq(careers.slug, slugOrId))
    .limit(1);
  if (bySlug) return bySlug;
  const [byId] = await db
    .select({ id: careers.id, name: careers.name })
    .from(careers)
    .where(eq(careers.id, slugOrId))
    .limit(1);
  return byId ?? null;
}

/** All of the caller's career goals (history preserved), newest first. */
export async function getCareerGoals(userId: string): Promise<CareerGoalRow[]> {
  const rows = await db
    .select({
      id: careerGoals.id,
      careerId: careerGoals.careerId,
      careerSlug: careers.slug,
      careerName: careers.name,
      status: careerGoals.status,
      isPrimary: careerGoals.isPrimary,
      priority: careerGoals.priority,
      targetDate: careerGoals.targetDate,
      createdAt: careerGoals.createdAt,
    })
    .from(careerGoals)
    .innerJoin(careers, eq(careers.id, careerGoals.careerId))
    .where(eq(careerGoals.userId, userId))
    .orderBy(desc(careerGoals.isPrimary), desc(careerGoals.createdAt));
  return rows;
}

export async function getPrimaryGoal(userId: string): Promise<CareerGoalRow | null> {
  const [row] = await db
    .select({
      id: careerGoals.id,
      careerId: careerGoals.careerId,
      careerSlug: careers.slug,
      careerName: careers.name,
      status: careerGoals.status,
      isPrimary: careerGoals.isPrimary,
      priority: careerGoals.priority,
      targetDate: careerGoals.targetDate,
      createdAt: careerGoals.createdAt,
    })
    .from(careerGoals)
    .innerJoin(careers, eq(careers.id, careerGoals.careerId))
    .where(
      and(
        eq(careerGoals.userId, userId),
        eq(careerGoals.isPrimary, true),
        eq(careerGoals.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Set (or switch) the caller's primary career goal. Preserves history: a
 * previous goal for a different career is kept, just demoted from primary.
 * Recomputes skill gaps and, if the goal has no active roadmap, builds one.
 */
export async function setPrimaryCareerGoal(
  userId: string,
  careerSlugOrId: string,
  opts: { targetDate?: Date } = {},
): Promise<{ goalId: string; roadmapId: string; careerName: string }> {
  await ensureTaxonomySeeded();
  const career = await resolveCareer(careerSlugOrId);
  if (!career) throw new Error("Unknown career");

  const [existing] = await db
    .select()
    .from(careerGoals)
    .where(and(eq(careerGoals.userId, userId), eq(careerGoals.careerId, career.id)))
    .limit(1);
  const [priorPrimary] = await db
    .select({ id: careerGoals.id })
    .from(careerGoals)
    .where(and(eq(careerGoals.userId, userId), eq(careerGoals.isPrimary, true)))
    .limit(1);

  // Demote any other primary goal.
  await db
    .update(careerGoals)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(and(eq(careerGoals.userId, userId), eq(careerGoals.isPrimary, true)));

  let goalId: string;
  if (existing) {
    goalId = existing.id;
    await db
      .update(careerGoals)
      .set({
        isPrimary: true,
        status: "active",
        ...(opts.targetDate && { targetDate: opts.targetDate }),
        updatedAt: new Date(),
      })
      .where(eq(careerGoals.id, goalId));
  } else {
    const [inserted] = await db
      .insert(careerGoals)
      .values({
        userId,
        careerId: career.id,
        isPrimary: true,
        status: "active",
        targetDate: opts.targetDate ?? null,
      })
      .returning();
    goalId = inserted!.id;
  }

  const isSwitch = Boolean(priorPrimary && priorPrimary.id !== goalId);
  await recordActivity(userId, isSwitch ? "career_goal_changed" : "career_goal_set", {
    entityType: "career_goal",
    entityId: goalId,
    metadata: { career: career.name },
  });

  // Ensure gaps + a roadmap exist.
  await recomputeSkillGaps(userId, goalId, career.id);
  const [activeRoadmap] = await db
    .select({ id: careerRoadmaps.id })
    .from(careerRoadmaps)
    .where(
      and(
        eq(careerRoadmaps.userId, userId),
        eq(careerRoadmaps.careerGoalId, goalId),
        eq(careerRoadmaps.status, "active"),
      ),
    )
    .limit(1);

  const roadmapId =
    activeRoadmap?.id ?? (await buildTemplateRoadmap(userId, goalId, career.id)).roadmapId;

  return { goalId, roadmapId, careerName: career.name };
}

/** Rebuild the roadmap for the primary goal from the current skill picture. */
export async function regenerateRoadmap(userId: string): Promise<{ roadmapId: string }> {
  const goal = await getPrimaryGoal(userId);
  if (!goal) throw new Error("Set a career goal first");
  const { roadmapId } = await buildTemplateRoadmap(userId, goal.id, goal.careerId);
  return { roadmapId };
}

// --- skill gaps ------------------------------------------------------

export async function getSkillGaps(userId: string): Promise<{
  goal: CareerGoalRow | null;
  gaps: SkillGapRow[];
}> {
  const goal = await getPrimaryGoal(userId);
  if (!goal) return { goal: null, gaps: [] };
  const gaps = await getSkillGapsForGoal(userId, goal.id, goal.careerId);
  return { goal, gaps };
}

// --- roadmap read -----------------------------------------------------

export type RoadmapTaskView = {
  id: string;
  title: string;
  description: string | null;
  taskType: string;
  status: TaskStatus;
  orderIndex: number;
  estimatedMinutes: number | null;
  skillId: string | null;
  resourceUrl: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
};
export type RoadmapPhaseView = {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  status: "not_started" | "in_progress" | "completed";
  progressPercent: number;
  tasks: RoadmapTaskView[];
};
export type RoadmapView = {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "completed" | "archived";
  progressPercent: number;
  estimatedWeeks: number | null;
  phases: RoadmapPhaseView[];
} | null;

/** The caller's active roadmap for their primary goal, as a phase→task tree. */
export async function getActiveRoadmap(userId: string): Promise<RoadmapView> {
  const goal = await getPrimaryGoal(userId);
  if (!goal) return null;

  const [roadmap] = await db
    .select()
    .from(careerRoadmaps)
    .where(
      and(
        eq(careerRoadmaps.userId, userId),
        eq(careerRoadmaps.careerGoalId, goal.id),
        eq(careerRoadmaps.status, "active"),
      ),
    )
    .orderBy(desc(careerRoadmaps.createdAt))
    .limit(1);
  if (!roadmap) return null;

  const [phaseRows, taskRows] = await Promise.all([
    db
      .select()
      .from(roadmapPhases)
      .where(eq(roadmapPhases.roadmapId, roadmap.id))
      .orderBy(roadmapPhases.orderIndex),
    db
      .select()
      .from(roadmapTasks)
      .where(eq(roadmapTasks.roadmapId, roadmap.id))
      .orderBy(roadmapTasks.orderIndex),
  ]);

  const tasksByPhase = new Map<string, RoadmapTaskView[]>();
  for (const t of taskRows) {
    const view: RoadmapTaskView = {
      id: t.id,
      title: t.title,
      description: t.description,
      taskType: t.taskType,
      status: t.status,
      orderIndex: t.orderIndex,
      estimatedMinutes: t.estimatedMinutes,
      skillId: t.skillId,
      resourceUrl: t.resourceUrl,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
    };
    tasksByPhase.set(t.phaseId, [...(tasksByPhase.get(t.phaseId) ?? []), view]);
  }

  return {
    id: roadmap.id,
    title: roadmap.title,
    description: roadmap.description,
    status: roadmap.status,
    progressPercent: roadmap.progressPercent,
    estimatedWeeks: roadmap.estimatedWeeks,
    phases: phaseRows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      orderIndex: p.orderIndex,
      status: p.status,
      progressPercent: p.progressPercent,
      tasks: (tasksByPhase.get(p.id) ?? []).sort((a, b) => a.orderIndex - b.orderIndex),
    })),
  };
}

// --- task progress --------------------------------------------------

const TERMINAL: TaskStatus[] = ["completed", "skipped"];

/** Load a task and assert the caller owns it. */
async function ownedTask(userId: string, taskId: string) {
  const [task] = await db
    .select()
    .from(roadmapTasks)
    .where(and(eq(roadmapTasks.id, taskId), eq(roadmapTasks.userId, userId)))
    .limit(1);
  if (!task) throw new Error("Task not found");
  return task;
}

async function upsertTaskProgress(
  userId: string,
  task: typeof roadmapTasks.$inferSelect,
  patch: {
    addMinutes?: number;
    completionPercent?: number;
    started?: boolean;
    completed?: boolean;
  },
) {
  const now = new Date();
  await db
    .insert(taskProgress)
    .values({
      taskId: task.id,
      userId,
      roadmapId: task.roadmapId,
      phaseId: task.phaseId,
      timeSpentMinutes: patch.addMinutes ?? 0,
      completionPercent: patch.completionPercent ?? (patch.completed ? 100 : 0),
      attempts: 1,
      startedAt: patch.started || patch.completed ? now : null,
      completedAt: patch.completed ? now : null,
      lastAccessedAt: now,
    })
    .onConflictDoUpdate({
      target: taskProgress.taskId,
      set: {
        ...(patch.addMinutes && {
          timeSpentMinutes: sqlAdd(taskProgress.timeSpentMinutes, patch.addMinutes),
        }),
        ...(patch.completionPercent != null && { completionPercent: patch.completionPercent }),
        ...(patch.completed && { completionPercent: 100, completedAt: now }),
        attempts: sqlAdd(taskProgress.attempts, 1),
        lastAccessedAt: now,
        updatedAt: now,
      },
    });
}

function sqlAdd(col: unknown, n: number) {
  return sql`${col} + ${n}`;
}

async function recomputeProgress(userId: string, roadmapId: string) {
  const tasks = await db
    .select({ phaseId: roadmapTasks.phaseId, status: roadmapTasks.status })
    .from(roadmapTasks)
    .where(eq(roadmapTasks.roadmapId, roadmapId));

  const byPhase = new Map<string, { done: number; total: number; active: number }>();
  let done = 0;
  for (const t of tasks) {
    const p = byPhase.get(t.phaseId) ?? { done: 0, total: 0, active: 0 };
    p.total++;
    if (t.status === "completed" || t.status === "skipped") p.done++;
    if (t.status === "in_progress") p.active++;
    if (t.status === "completed") done++;
    byPhase.set(t.phaseId, p);
  }

  for (const [phaseId, p] of byPhase) {
    const pct = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);
    const status: "not_started" | "in_progress" | "completed" =
      p.done === p.total && p.total > 0
        ? "completed"
        : p.done > 0 || p.active > 0
          ? "in_progress"
          : "not_started";
    await db
      .update(roadmapPhases)
      .set({ progressPercent: pct, status, updatedAt: new Date() })
      .where(eq(roadmapPhases.id, phaseId));
  }

  const roadmapPct = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);
  await db
    .update(careerRoadmaps)
    .set({
      progressPercent: roadmapPct,
      ...(roadmapPct === 100 && { status: "completed" as const }),
      updatedAt: new Date(),
    })
    .where(and(eq(careerRoadmaps.id, roadmapId), eq(careerRoadmaps.userId, userId)));
}

export async function startTask(userId: string, taskId: string): Promise<{ status: TaskStatus }> {
  const task = await ownedTask(userId, taskId);
  if (task.status === "not_started") {
    await db
      .update(roadmapTasks)
      .set({ status: "in_progress", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(roadmapTasks.id, taskId));
  }
  await upsertTaskProgress(userId, task, { started: true, completionPercent: 25 });
  await recomputeProgress(userId, task.roadmapId);
  await recordActivity(userId, "task_started", {
    entityType: "roadmap_task",
    entityId: taskId,
    metadata: { title: task.title },
  });
  return { status: "in_progress" };
}

export async function completeTask(
  userId: string,
  taskId: string,
  opts: { minutesSpent?: number } = {},
): Promise<{ status: TaskStatus; roadmapProgress: number }> {
  const task = await ownedTask(userId, taskId);
  await db
    .update(roadmapTasks)
    .set({
      status: "completed",
      completedAt: new Date(),
      startedAt: task.startedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(roadmapTasks.id, taskId));
  await upsertTaskProgress(userId, task, {
    completed: true,
    addMinutes: opts.minutesSpent ?? 0,
  });
  await recomputeProgress(userId, task.roadmapId);
  await recordActivity(userId, "task_completed", {
    entityType: "roadmap_task",
    entityId: taskId,
    metadata: { title: task.title },
  });
  const [rm] = await db
    .select({ p: careerRoadmaps.progressPercent })
    .from(careerRoadmaps)
    .where(eq(careerRoadmaps.id, task.roadmapId))
    .limit(1);
  return { status: "completed", roadmapProgress: rm?.p ?? 0 };
}

export async function skipTask(userId: string, taskId: string): Promise<{ status: TaskStatus }> {
  const task = await ownedTask(userId, taskId);
  await db
    .update(roadmapTasks)
    .set({ status: "skipped", updatedAt: new Date() })
    .where(eq(roadmapTasks.id, taskId));
  await upsertTaskProgress(userId, task, { completionPercent: 0 });
  await recomputeProgress(userId, task.roadmapId);
  await recordActivity(userId, "task_skipped", {
    entityType: "roadmap_task",
    entityId: taskId,
    metadata: { title: task.title },
  });
  return { status: "skipped" };
}

export async function reopenTask(userId: string, taskId: string): Promise<{ status: TaskStatus }> {
  const task = await ownedTask(userId, taskId);
  if (TERMINAL.includes(task.status)) {
    await db
      .update(roadmapTasks)
      .set({ status: "in_progress", completedAt: null, updatedAt: new Date() })
      .where(eq(roadmapTasks.id, taskId));
    await recomputeProgress(userId, task.roadmapId);
  }
  return { status: "in_progress" };
}

// --- continue where you left off --------------------------------------

export type ContinueState = {
  hasJourney: boolean;
  career: string | null;
  careerGoalId: string | null;
  roadmapId: string | null;
  roadmapProgress: number;
  currentPhase: { id: string; title: string } | null;
  currentTask: {
    id: string;
    title: string;
    status: TaskStatus;
    phaseTitle: string;
    estimatedMinutes: number | null;
  } | null;
  lastCompletedTask: { id: string; title: string; completedAt: Date | null } | null;
  totalTasks: number;
  completedTasks: number;
  lastActivityAt: Date | null;
  lastActivityType: string | null;
  recommendedNextAction: string;
};

/**
 * "Continue where you left off". Computed entirely from the database — the
 * frontend never remembers this. Determines: the caller's active career goal
 * and roadmap, the current phase and task, the last completed task, overall
 * progress, last activity, and the recommended next action.
 */
export async function getContinueState(userId: string): Promise<ContinueState> {
  const empty: ContinueState = {
    hasJourney: false,
    career: null,
    careerGoalId: null,
    roadmapId: null,
    roadmapProgress: 0,
    currentPhase: null,
    currentTask: null,
    lastCompletedTask: null,
    totalTasks: 0,
    completedTasks: 0,
    lastActivityAt: null,
    lastActivityType: null,
    recommendedNextAction: "Set a career goal to generate your roadmap.",
  };

  const goal = await getPrimaryGoal(userId);
  if (!goal) return empty;

  const [roadmap] = await db
    .select()
    .from(careerRoadmaps)
    .where(
      and(
        eq(careerRoadmaps.userId, userId),
        eq(careerRoadmaps.careerGoalId, goal.id),
        ne(careerRoadmaps.status, "archived"),
      ),
    )
    .orderBy(desc(careerRoadmaps.createdAt))
    .limit(1);

  const lastActivity = await getLastActivity(userId);

  if (!roadmap) {
    return {
      ...empty,
      hasJourney: true,
      career: goal.careerName,
      careerGoalId: goal.id,
      lastActivityAt: lastActivity?.createdAt ?? null,
      lastActivityType: lastActivity?.type ?? null,
      recommendedNextAction: "Generate your roadmap.",
    };
  }

  const [phases, tasks] = await Promise.all([
    db
      .select()
      .from(roadmapPhases)
      .where(eq(roadmapPhases.roadmapId, roadmap.id))
      .orderBy(roadmapPhases.orderIndex),
    db
      .select()
      .from(roadmapTasks)
      .where(eq(roadmapTasks.roadmapId, roadmap.id))
      .orderBy(roadmapTasks.orderIndex),
  ]);
  const phaseById = new Map(phases.map((p) => [p.id, p]));
  const phaseOrder = new Map(phases.map((p, i) => [p.id, i]));

  // Ordered by phase, then task order.
  const ordered = [...tasks].sort((a, b) => {
    const pd = (phaseOrder.get(a.phaseId) ?? 0) - (phaseOrder.get(b.phaseId) ?? 0);
    return pd !== 0 ? pd : a.orderIndex - b.orderIndex;
  });

  const inProgress = ordered.find((t) => t.status === "in_progress");
  const nextTodo = ordered.find((t) => t.status === "not_started");
  const currentTaskRow = inProgress ?? nextTodo ?? null;

  const completed = ordered.filter((t) => t.status === "completed");
  const lastCompleted =
    completed.length > 0
      ? [...completed].sort(
          (a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
        )[0]!
      : null;

  const currentPhaseRow = currentTaskRow ? phaseById.get(currentTaskRow.phaseId) : null;

  let recommendedNextAction: string;
  if (!currentTaskRow) {
    recommendedNextAction =
      roadmap.progressPercent === 100
        ? `Roadmap complete — you're ready to apply for ${goal.careerName} roles.`
        : "Review your roadmap.";
  } else if (currentTaskRow.status === "in_progress") {
    recommendedNextAction = `Finish "${currentTaskRow.title}"`;
  } else {
    recommendedNextAction = `Start "${currentTaskRow.title}"`;
  }

  return {
    hasJourney: true,
    career: goal.careerName,
    careerGoalId: goal.id,
    roadmapId: roadmap.id,
    roadmapProgress: roadmap.progressPercent,
    currentPhase: currentPhaseRow ? { id: currentPhaseRow.id, title: currentPhaseRow.title } : null,
    currentTask: currentTaskRow
      ? {
          id: currentTaskRow.id,
          title: currentTaskRow.title,
          status: currentTaskRow.status,
          phaseTitle: phaseById.get(currentTaskRow.phaseId)?.title ?? "",
          estimatedMinutes: currentTaskRow.estimatedMinutes,
        }
      : null,
    lastCompletedTask: lastCompleted
      ? { id: lastCompleted.id, title: lastCompleted.title, completedAt: lastCompleted.completedAt }
      : null,
    totalTasks: ordered.length,
    completedTasks: completed.length,
    lastActivityAt: lastActivity?.createdAt ?? null,
    lastActivityType: lastActivity?.type ?? null,
    recommendedNextAction,
  };
}
