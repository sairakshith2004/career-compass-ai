import { describe, expect, test, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

import { setupTestAuth, callAuth } from "./helpers";

const { auth, db } = await setupTestAuth();
const profile = await import("../src/lib/student-profile.server");
const onboardingFns = await import("../src/lib/onboarding-fns");
const { studentInterestAreas, studentProfiles } = await import("../src/lib/db/schema");
const { computeProfileCompletion } = await import("../src/lib/profile-completion");
const { CAREER_GROUPS, isCareerGroupSlug } = await import("../src/lib/taxonomy-catalog");

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
let bob = "";

beforeAll(async () => {
  alice = await newUser("alice-sp@example.com");
  bob = await newUser("bob-sp@example.com");
});

describe("catalog — career interest areas", () => {
  test("interest areas are exposed and derived from taxonomy career groups", () => {
    const cat = profile.onboardingCatalog();
    expect(cat.interestAreas.length).toBe(CAREER_GROUPS.length);
    expect(cat.interestAreas.every((a) => isCareerGroupSlug(a.slug))).toBe(true);
    // Distinct from the concrete career list.
    expect(cat.interestAreas.some((a) => a.name === "Data & AI")).toBe(true);
    expect(cat.maxSemester).toBe(12);
  });
});

describe("new profile fields persist through the wizard steps", () => {
  test("specialization + current semester + interests + location + notes round-trip", async () => {
    await profile.saveAcademicBackground(alice, {
      fullName: "Alice SP",
      collegeName: "NIT Trichy",
    });
    await profile.saveBranch(alice, {
      branchSlug: "electronics-communication",
      specialization: "VLSI Design",
    });
    await profile.saveGraduation(alice, {
      currentYear: "third",
      currentSemester: 6,
      graduationYear: 2027,
    });
    await profile.saveCareerDirection(alice, {
      careerGoalStatus: "exploring",
      targetCareerSlugs: ["ml-engineer", "backend-developer"],
      interestAreaSlugs: ["data-and-ai", "embedded-and-electronics"],
      preferredWorkLocation: "Bengaluru / Remote",
      careerNotes: "Interested in edge ML.",
    });

    const state = await profile.getOnboardingState(alice);
    expect(state.specialization).toBe("VLSI Design");
    expect(state.currentSemester).toBe(6);
    expect([...state.interestAreaSlugs].sort()).toEqual([
      "data-and-ai",
      "embedded-and-electronics",
    ]);
    expect(state.preferredWorkLocation).toBe("Bengaluru / Remote");
    expect(state.careerNotes).toBe("Interested in edge ML.");
    expect(state.profileCompletion).toBeGreaterThan(0);
  });

  test("current semester is dropped when the student has graduated", async () => {
    await profile.saveGraduation(alice, { currentYear: "graduated", currentSemester: 8 });
    const state = await profile.getOnboardingState(alice);
    expect(state.currentYear).toBe("graduated");
    expect(state.currentSemester).toBeNull();
  });

  test("an unknown interest-area slug is rejected by validation", async () => {
    await expect(
      profile.saveCareerDirection(alice, {
        careerGoalStatus: "exploring",
        interestAreaSlugs: ["not-a-real-area"],
      }),
    ).rejects.toThrow();
  });
});

describe("updateStudentProfile — one-shot full update", () => {
  test("writes every field and replaces the target/interest sets", async () => {
    await profile.updateStudentProfile(bob, {
      fullName: "Bob Rao",
      degree: "B.Tech",
      branchSlug: "mechanical",
      specialization: "Thermal",
      collegeName: "BITS Pilani",
      countryCode: "IN",
      currentYear: "fourth",
      currentSemester: 7,
      graduationYear: 2026,
      experienceLevel: "internship",
      careerGoalStatus: "known",
      targetCareerSlugs: ["mechanical-design-engineer", "automotive-engineer"], // trimmed to 1
      interestAreaSlugs: ["mechanical-and-manufacturing"],
      preferredWorkLocation: "Pune",
      careerNotes: "FSAE team lead.",
    });

    const state = await profile.getOnboardingState(bob);
    expect(state.fullName).toBe("Bob Rao");
    expect(state.branchSlug).toBe("mechanical");
    expect(state.specialization).toBe("Thermal");
    expect(state.currentSemester).toBe(7);
    expect(state.careerGoalStatus).toBe("known");
    expect(state.targetCareerSlugs).toEqual(["mechanical-design-engineer"]);
    expect(state.interestAreaSlugs).toEqual(["mechanical-and-manufacturing"]);

    // A second update clears a field by omitting it.
    await profile.updateStudentProfile(bob, {
      fullName: "Bob Rao",
      careerGoalStatus: "unsure",
    });
    const cleared = await profile.getOnboardingState(bob);
    expect(cleared.specialization).toBeNull();
    expect(cleared.targetCareerSlugs).toEqual([]);
    expect(cleared.interestAreaSlugs).toEqual([]);
  });

  test("updateStudentProfile does not flip onboarding completion state", async () => {
    const before = await profile.getOnboardingState(bob);
    await profile.updateStudentProfile(bob, { fullName: "Bob R", careerGoalStatus: "exploring" });
    const after = await profile.getOnboardingState(bob);
    expect(after.completed).toBe(before.completed);
  });
});

describe("profile completion scoring", () => {
  test("computeProfileCompletion rises monotonically as fields fill", () => {
    const empty = computeProfileCompletion({});
    const some = computeProfileCompletion({
      fullName: "A",
      branchId: "x",
      careerGoalStatus: "known",
    });
    const more = computeProfileCompletion({
      fullName: "A",
      branchId: "x",
      careerGoalStatus: "known",
      degree: "B.Tech",
      collegeName: "C",
      targetCareerCount: 1,
      interestAreaCount: 2,
      preferredWorkLocation: "Remote",
    });
    expect(empty).toBe(0);
    expect(some).toBeGreaterThan(empty);
    expect(more).toBeGreaterThan(some);
    expect(more).toBeLessThanOrEqual(100);
  });

  test("the persisted profile_completion column is kept in sync", async () => {
    const [row] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, alice))
      .limit(1);
    const state = await profile.getOnboardingState(alice);
    expect(row?.profileCompletion).toBe(state.profileCompletion);
  });
});

describe("ownership — interest areas and updates are scoped to the user", () => {
  test("one user's interest areas never leak into another's", async () => {
    await profile.saveCareerDirection(alice, {
      careerGoalStatus: "exploring",
      interestAreaSlugs: ["data-and-ai"],
    });
    await profile.saveCareerDirection(bob, {
      careerGoalStatus: "exploring",
      interestAreaSlugs: ["civil-and-infrastructure"],
    });

    const aliceRows = await db
      .select()
      .from(studentInterestAreas)
      .where(eq(studentInterestAreas.userId, alice));
    const bobRows = await db
      .select()
      .from(studentInterestAreas)
      .where(eq(studentInterestAreas.userId, bob));

    expect(aliceRows.map((r) => r.groupSlug)).toEqual(["data-and-ai"]);
    expect(bobRows.map((r) => r.groupSlug)).toEqual(["civil-and-infrastructure"]);
  });

  test("summary reads are scoped to the user id they are given", async () => {
    const a = await profile.getStudentProfileSummary(alice);
    const b = await profile.getStudentProfileSummary(bob);
    expect(a?.interestAreas).toEqual(["Data & AI"]);
    expect(b?.interestAreas).toEqual(["Civil & Infrastructure"]);
  });
});

describe("RPC layer requires an authenticated session", () => {
  test("updateProfile rejects when there is no session", async () => {
    await expect(onboardingFns.updateProfile({ data: { fullName: "Mallory" } })).rejects.toThrow();
  });
});
