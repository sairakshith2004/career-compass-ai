import { describe, expect, test, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

import { setupTestAuth, callAuth } from "./helpers";

const { auth, db } = await setupTestAuth();
const career = await import("../src/lib/career.server");
const { roadmapTasks } = await import("../src/lib/db/career-schema");

const PASSWORD = "correct-horse-battery-staple";

async function newUser(email: string): Promise<string> {
  const { json } = await callAuth(auth, "/sign-up/email", {
    email,
    password: PASSWORD,
    name: email,
  });
  return json.user.id as string;
}

let alice = "";
let mallory = "";
let aliceTaskId = "";

beforeAll(async () => {
  alice = await newUser("authz-alice@example.com");
  mallory = await newUser("authz-mallory@example.com");
  await career.setPrimaryCareerGoal(alice, "backend-developer");
  const [task] = await db
    .select()
    .from(roadmapTasks)
    .where(eq(roadmapTasks.userId, alice))
    .limit(1);
  aliceTaskId = task!.id;
});

describe("Phase 6 — career state is isolated per user", () => {
  test("a user with no journey gets an empty continue state, not someone else's", async () => {
    const state = await career.getContinueState(mallory);
    expect(state.hasJourney).toBe(false);
    expect(state.career).toBeNull();
    expect(state.currentTask).toBeNull();
    expect(await career.getActiveRoadmap(mallory)).toBeNull();
    expect(await career.getCareerGoals(mallory)).toHaveLength(0);
  });

  test("a user cannot start / complete / skip another user's task", async () => {
    await expect(career.startTask(mallory, aliceTaskId)).rejects.toThrow("Task not found");
    await expect(career.completeTask(mallory, aliceTaskId)).rejects.toThrow("Task not found");
    await expect(career.skipTask(mallory, aliceTaskId)).rejects.toThrow("Task not found");
    await expect(career.reopenTask(mallory, aliceTaskId)).rejects.toThrow("Task not found");

    // Alice's task is untouched.
    const [task] = await db.select().from(roadmapTasks).where(eq(roadmapTasks.id, aliceTaskId));
    expect(task!.status).toBe("not_started");
  });

  test("the task owner CAN act on their own task", async () => {
    const r = await career.startTask(alice, aliceTaskId);
    expect(r.status).toBe("in_progress");
  });

  test("skill gaps are scoped to the requesting user", async () => {
    const mine = await career.getSkillGaps(alice);
    expect(mine.goal).not.toBeNull();
    const theirs = await career.getSkillGaps(mallory);
    expect(theirs.goal).toBeNull();
    expect(theirs.gaps).toHaveLength(0);
  });
});
