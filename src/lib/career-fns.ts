import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "./session.server";
import { getActivity, type ActivityEntry } from "./activity.server";
import {
  completeTask,
  getActiveRoadmap,
  getCareerGoals,
  getContinueState,
  getSkillGaps,
  regenerateRoadmap,
  reopenTask,
  setPrimaryCareerGoal,
  skipTask,
  startTask,
  type CareerGoalRow,
  type ContinueState,
  type RoadmapView,
} from "./career.server";
import type { SkillGapRow } from "./skill-gap-engine.server";

export type { CareerGoalRow, ContinueState, RoadmapView, SkillGapRow, ActivityEntry };

/**
 * RPC layer for the career journey. Every wrapper resolves the caller from the
 * verified session (`requireUser`) and delegates to the scoped service with
 * that user id. The client never supplies a user id, goal id owner, or any
 * authorization input — ownership is checked in `career.server.ts`.
 */

const taskIdSchema = (input: unknown) => z.object({ taskId: z.string().min(1) }).parse(input);

export const setCareerGoal = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        career: z.string().min(1),
        targetDate: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { id } = await requireUser();
    return setPrimaryCareerGoal(id, data.career, {
      ...(data.targetDate ? { targetDate: new Date(data.targetDate) } : {}),
    });
  });

export const listCareerGoals = createServerFn({ method: "GET" }).handler(
  async (): Promise<CareerGoalRow[]> => {
    const { id } = await requireUser();
    return getCareerGoals(id);
  },
);

export const getRoadmap = createServerFn({ method: "GET" }).handler(
  async (): Promise<RoadmapView> => {
    const { id } = await requireUser();
    return getActiveRoadmap(id);
  },
);

export const rebuildRoadmap = createServerFn({ method: "POST" }).handler(async () => {
  const { id } = await requireUser();
  return regenerateRoadmap(id);
});

export const getContinue = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContinueState> => {
    const { id } = await requireUser();
    return getContinueState(id);
  },
);

export const getCareerSkillGaps = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ goal: CareerGoalRow | null; gaps: SkillGapRow[] }> => {
    const { id } = await requireUser();
    return getSkillGaps(id);
  },
);

export const getCareerActivity = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<ActivityEntry[]> => {
    const { id } = await requireUser();
    return getActivity(id, data.limit ?? 50);
  });

export const beginTask = createServerFn({ method: "POST" })
  .validator(taskIdSchema)
  .handler(async ({ data }) => {
    const { id } = await requireUser();
    return startTask(id, data.taskId);
  });

export const finishTask = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        taskId: z.string().min(1),
        minutesSpent: z.number().int().min(0).max(100000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { id } = await requireUser();
    return completeTask(id, data.taskId, {
      ...(data.minutesSpent != null ? { minutesSpent: data.minutesSpent } : {}),
    });
  });

export const passTask = createServerFn({ method: "POST" })
  .validator(taskIdSchema)
  .handler(async ({ data }) => {
    const { id } = await requireUser();
    return skipTask(id, data.taskId);
  });

export const undoTask = createServerFn({ method: "POST" })
  .validator(taskIdSchema)
  .handler(async ({ data }) => {
    const { id } = await requireUser();
    return reopenTask(id, data.taskId);
  });
