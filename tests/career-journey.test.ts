import { describe, expect, test, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";

import { setupTestAuth, callAuth } from "./helpers";

const { auth, db } = await setupTestAuth();
const career = await import("../src/lib/career.server");
const skillsSvc = await import("../src/lib/student-skills.server");
const gapEngine = await import("../src/lib/skill-gap-engine.server");
const { careerGoals, careerRoadmaps, roadmapPhases, roadmapTasks, taskProgress, activityEvents } =
  await import("../src/lib/db/career-schema");
const { skills } = await import("../src/lib/db/schema");

const PASSWORD = "correct-horse-battery-staple";

async function newUser(email: string): Promise<string> {
  const { json } = await callAuth(auth, "/sign-up/email", {
    email,
    password: PASSWORD,
    name: email,
  });
  return json.user.id as string;
}

let student = "";

beforeAll(async () => {
  student = await newUser("journey-student@example.com");
});

describe("Phase 6 — career journey persists in the database", () => {
  test("setting a career goal creates a goal + roadmap + phases + tasks", async () => {
    const res = await career.setPrimaryCareerGoal(student, "software-engineer");
    expect(res.goalId).toBeTruthy();
    expect(res.roadmapId).toBeTruthy();

    // Goal row is persisted, primary, active, scoped to the user.
    const goals = await db.select().from(careerGoals).where(eq(careerGoals.userId, student));
    expect(goals).toHaveLength(1);
    expect(goals[0]!.isPrimary).toBe(true);
    expect(goals[0]!.status).toBe("active");

    // Roadmap tree is persisted.
    const phases = await db
      .select()
      .from(roadmapPhases)
      .where(eq(roadmapPhases.roadmapId, res.roadmapId));
    const tasks = await db
      .select()
      .from(roadmapTasks)
      .where(eq(roadmapTasks.roadmapId, res.roadmapId));
    expect(phases.length).toBeGreaterThan(0);
    expect(tasks.length).toBeGreaterThan(0);
    // Every task is scoped to the student.
    expect(tasks.every((t) => t.userId === student)).toBe(true);
  });

  test("continue state points at the first unfinished task", async () => {
    const state = await career.getContinueState(student);
    expect(state.hasJourney).toBe(true);
    expect(state.career).toBe("Software Engineer");
    expect(state.roadmapProgress).toBe(0);
    expect(state.currentTask).not.toBeNull();
    expect(state.currentTask!.status).toBe("not_started");
    expect(state.lastCompletedTask).toBeNull();
    expect(state.recommendedNextAction).toContain("Start");
  });

  test("starting and completing tasks updates status, progress and task_progress", async () => {
    const roadmap = await career.getActiveRoadmap(student);
    const orderedTasks = roadmap!.phases.flatMap((p) => p.tasks);
    const first = orderedTasks[0]!;
    const second = orderedTasks[1]!;

    await career.startTask(student, first.id);
    let dbTask = (await db.select().from(roadmapTasks).where(eq(roadmapTasks.id, first.id)))[0]!;
    expect(dbTask.status).toBe("in_progress");
    expect(dbTask.startedAt).not.toBeNull();

    const done = await career.completeTask(student, first.id, { minutesSpent: 30 });
    expect(done.status).toBe("completed");
    expect(done.roadmapProgress).toBeGreaterThan(0);

    dbTask = (await db.select().from(roadmapTasks).where(eq(roadmapTasks.id, first.id)))[0]!;
    expect(dbTask.status).toBe("completed");
    expect(dbTask.completedAt).not.toBeNull();

    const tp = (await db.select().from(taskProgress).where(eq(taskProgress.taskId, first.id)))[0]!;
    expect(tp.completionPercent).toBe(100);
    expect(tp.timeSpentMinutes).toBe(30);

    await career.completeTask(student, second.id);
  });

  test("after 'leaving', a fresh continue call returns the exact next unfinished task", async () => {
    // Simulate the student closing the app and signing back in later: every bit
    // of state below is read straight from the database, nothing cached.
    const roadmap = await career.getActiveRoadmap(student);
    const orderedTasks = roadmap!.phases.flatMap((p) => p.tasks);
    const completedIds = new Set(
      orderedTasks.filter((t) => t.status === "completed").map((t) => t.id),
    );
    const expectedNext = orderedTasks.find((t) => t.status === "not_started")!;

    const state = await career.getContinueState(student);
    expect(completedIds.size).toBe(2);
    expect(state.completedTasks).toBe(2);
    expect(state.currentTask!.id).toBe(expectedNext.id);
    expect(state.lastCompletedTask).not.toBeNull();
    expect(state.roadmapProgress).toBeGreaterThan(0);
    expect(state.roadmapProgress).toBeLessThan(100);
    expect(state.lastActivityAt).toBeInstanceOf(Date);
  });

  test("an in-progress task is preferred as the current task over a later untouched one", async () => {
    const roadmap = await career.getActiveRoadmap(student);
    const nextTwo = roadmap!.phases
      .flatMap((p) => p.tasks)
      .filter((t) => t.status === "not_started");
    // start the SECOND pending task, not the first
    await career.startTask(student, nextTwo[1]!.id);

    const state = await career.getContinueState(student);
    expect(state.currentTask!.id).toBe(nextTwo[1]!.id);
    expect(state.currentTask!.status).toBe("in_progress");
    expect(state.recommendedNextAction).toContain("Finish");
  });

  test("switching career goal preserves history and rebuilds the roadmap", async () => {
    const res = await career.setPrimaryCareerGoal(student, "data-scientist");
    const goals = await career.getCareerGoals(student);
    expect(goals.length).toBe(2);
    const primary = goals.find((g) => g.isPrimary)!;
    expect(primary.careerName).toBe("Data Scientist");
    // The old goal is retained, just not primary.
    expect(goals.some((g) => g.careerName === "Software Engineer" && !g.isPrimary)).toBe(true);

    // The new primary goal has its own active roadmap; continue-state follows
    // the primary goal.
    const state = await career.getContinueState(student);
    expect(state.career).toBe("Data Scientist");
    expect(state.roadmapId).toBe(res.roadmapId);

    // Each goal has exactly one active roadmap (history preserved, not deleted).
    for (const g of goals) {
      const active = await db
        .select()
        .from(careerRoadmaps)
        .where(and(eq(careerRoadmaps.careerGoalId, g.id), eq(careerRoadmaps.status, "active")));
      expect(active.length).toBeLessThanOrEqual(1);
    }

    const activity = await db
      .select()
      .from(activityEvents)
      .where(
        and(eq(activityEvents.userId, student), eq(activityEvents.type, "career_goal_changed")),
      );
    expect(activity.length).toBeGreaterThan(0);
  });

  test("a verified assessment skill closes gaps and is written to skill history", async () => {
    await career.setPrimaryCareerGoal(student, "software-engineer");
    const goal = (await career.getPrimaryGoal(student))!;

    const before = await gapEngine.getSkillGapsForGoal(student, goal.id, goal.careerId);
    const target = before.find((g) => g.severity !== "none");
    expect(target).toBeTruthy();

    const [skillRow] = await db.select().from(skills).where(eq(skills.id, target!.skillId));
    const r = await skillsSvc.recordStudentSkill(student, {
      skillId: skillRow!.id,
      level: "expert",
      source: "assessment",
      score: 95,
      reason: "test assessment",
    });
    expect(r.changed).toBe(true);
    expect(r.newLevel).toBe("expert");

    await gapEngine.recomputeSkillGaps(student, goal.id, goal.careerId);
    const after = await gapEngine.getSkillGapsForGoal(student, goal.id, goal.careerId);
    const resolved = after.find((g) => g.skillId === target!.skillId)!;
    expect(resolved.severity).toBe("none");

    const history = await skillsSvc.getSkillHistory(student);
    expect(history.some((h) => h.skillId === target!.skillId && h.newLevel === "expert")).toBe(
      true,
    );
  });
});
