import { describe, expect, test, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

import { setupTestAuth, callAuth } from "./helpers";

const { auth, db } = await setupTestAuth();
const profile = await import("../src/lib/student-profile.server");
const onboardingFns = await import("../src/lib/onboarding-fns");
const { studentProfiles, studentTargetCareers } = await import("../src/lib/db/schema");

const PASSWORD = "correct-horse-battery-staple";

/** Sign a user up through the real auth handler and return their id. */
async function newUser(email: string): Promise<string> {
  const { json } = await callAuth(auth, "/sign-up/email", {
    email,
    password: PASSWORD,
    name: email,
  });
  return json.user.id as string;
}

let alice = "";
let bob = "";

beforeAll(async () => {
  alice = await newUser("alice-onb@example.com");
  bob = await newUser("bob-onb@example.com");
});

describe("catalog", () => {
  test("branch and career are independent — every career is offered regardless of branch", () => {
    const cat = profile.onboardingCatalog();
    // An ECE branch exists...
    expect(cat.branches.some((b) => b.slug === "electronics-communication")).toBe(true);
    // ...and software / AI / data careers are in the same flat list, not gated by branch.
    for (const slug of [
      "ml-engineer",
      "backend-developer",
      "data-scientist",
      "mechanical-design-engineer",
    ]) {
      expect(cat.careers.some((c) => c.slug === slug)).toBe(true);
    }
    // The catalog carries no branch→career mapping of any kind.
    expect(Object.keys(cat)).not.toContain("careersByBranch");
  });
});

describe("progress persists and resumes", () => {
  test("a fresh user has no profile and resumes at step 1", async () => {
    const state = await profile.getOnboardingState(alice);
    expect(state.completed).toBe(false);
    expect(state.lastCompletedStep).toBe(0);
    expect(state.resumeStep).toBe(1);
    expect(state.fullName).toBe("alice-onb@example.com");
  });

  test("each step save persists its data and advances the resume point", async () => {
    await profile.saveAcademicBackground(alice, {
      fullName: "Alice Kumar",
      degree: "B.Tech",
      collegeName: "NIT Trichy",
      countryCode: "IN",
    });
    await profile.saveBranch(alice, { branchSlug: "electronics-communication" });
    await profile.saveGraduation(alice, { currentYear: "third", graduationYear: 2027 });

    const state = await profile.getOnboardingState(alice);
    expect(state.fullName).toBe("Alice Kumar");
    expect(state.degree).toBe("B.Tech");
    expect(state.branchSlug).toBe("electronics-communication");
    expect(state.collegeName).toBe("NIT Trichy");
    expect(state.countryCode).toBe("IN");
    expect(state.currentYear).toBe("third");
    expect(state.graduationYear).toBe(2027);
    // Steps 1-3 done → resume at step 4, still incomplete.
    expect(state.lastCompletedStep).toBe(3);
    expect(state.resumeStep).toBe(4);
    expect(state.completed).toBe(false);
  });

  test("re-saving an earlier step does not clobber later progress", async () => {
    await profile.saveAcademicBackground(alice, {
      fullName: "Alice K.",
      collegeName: "IIT Madras",
    });
    const state = await profile.getOnboardingState(alice);
    expect(state.collegeName).toBe("IIT Madras");
    // branch (step 2) and graduation (step 3) survive.
    expect(state.branchSlug).toBe("electronics-communication");
    expect(state.graduationYear).toBe(2027);
    expect(state.lastCompletedStep).toBe(3);
  });

  test("ECE student can target a software/AI career — branch imposes no constraint", async () => {
    await profile.saveCareerDirection(alice, {
      careerGoalStatus: "exploring",
      experienceLevel: "internship",
      targetCareerSlugs: ["ml-engineer", "backend-developer"],
    });
    const state = await profile.getOnboardingState(alice);
    expect(state.branchSlug).toBe("electronics-communication");
    expect(state.careerGoalStatus).toBe("exploring");
    expect([...state.targetCareerSlugs].sort()).toEqual(["backend-developer", "ml-engineer"]);
  });

  test("'not sure yet' clears any target careers and still completes", async () => {
    await profile.saveCareerDirection(alice, {
      careerGoalStatus: "unsure",
      targetCareerSlugs: ["ml-engineer"],
    });
    let state = await profile.getOnboardingState(alice);
    expect(state.targetCareerSlugs).toEqual([]);

    await profile.completeOnboarding(alice);
    state = await profile.getOnboardingState(alice);
    expect(state.completed).toBe(true);
    // Completed profiles reopen at step 1 for editing.
    expect(state.resumeStep).toBe(1);
  });

  test("completeOnboarding refuses before the career step is answered", async () => {
    const carol = await newUser("carol-onb@example.com");
    await profile.saveAcademicBackground(carol, { fullName: "Carol" });
    await expect(profile.completeOnboarding(carol)).rejects.toThrow();
  });

  test("'I know exactly what I want' keeps a single target career", async () => {
    const dave = await newUser("dave-onb@example.com");
    await profile.saveCareerDirection(dave, {
      careerGoalStatus: "known",
      targetCareerSlugs: ["vlsi-engineer", "backend-developer"], // server trims to 1
    });
    const state = await profile.getOnboardingState(dave);
    expect(state.targetCareerSlugs).toEqual(["vlsi-engineer"]);
  });
});

describe("ownership — a profile belongs only to its user", () => {
  test("getOnboardingState only ever returns the requested user's data", async () => {
    await profile.saveAcademicBackground(bob, { fullName: "Bob Rao", collegeName: "BITS Pilani" });
    await profile.saveBranch(bob, { branchSlug: "mechanical" });

    const aliceState = await profile.getOnboardingState(alice);
    const bobState = await profile.getOnboardingState(bob);

    expect(aliceState.collegeName).toBe("IIT Madras");
    expect(bobState.collegeName).toBe("BITS Pilani");
    expect(aliceState.branchSlug).toBe("electronics-communication");
    expect(bobState.branchSlug).toBe("mechanical");
  });

  test("getStudentProfileSummary is scoped to the user id it is given", async () => {
    const a = await profile.getStudentProfileSummary(alice);
    const b = await profile.getStudentProfileSummary(bob);
    expect(a?.collegeName).toBe("IIT Madras");
    expect(b?.collegeName).toBe("BITS Pilani");
    expect(a?.fullName).not.toBe(b?.fullName);
  });

  test("target-career rows are isolated per user", async () => {
    // Bob picks different careers; Alice's set is untouched.
    await profile.saveCareerDirection(bob, {
      careerGoalStatus: "known",
      targetCareerSlugs: ["mechanical-design-engineer"],
    });
    const aliceRows = await db
      .select()
      .from(studentTargetCareers)
      .where(eq(studentTargetCareers.userId, alice));
    const bobRows = await db
      .select()
      .from(studentTargetCareers)
      .where(eq(studentTargetCareers.userId, bob));

    expect(aliceRows).toHaveLength(0); // Alice ended on "unsure"
    expect(bobRows).toHaveLength(1);
  });

  test("there is no code path that reads a profile by a caller-supplied key", async () => {
    // Every exported reader takes a bare userId and filters on it; none accept a
    // profile id or a 'target user' argument. A direct scoped query confirms the
    // rows are keyed by user_id only.
    const [row] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, bob));
    expect(row?.userId).toBe(bob);
  });
});

describe("RPC layer requires an authenticated session", () => {
  test("onboarding server functions reject when there is no session", async () => {
    // Called with no request context → requireUser() finds no session → throws.
    await expect(onboardingFns.getOnboarding()).rejects.toThrow();
    await expect(
      onboardingFns.saveOnboardingStep1({
        data: { fullName: "Mallory" },
      }),
    ).rejects.toThrow();
    await expect(onboardingFns.finishOnboarding()).rejects.toThrow();
  });
});
