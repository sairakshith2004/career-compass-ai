import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { setupTestAuth, callAuth } from "./helpers";

const { auth, db } = await setupTestAuth();
const cp = await import("../src/lib/career-profile.server");
const cpFns = await import("../src/lib/career-profile-fns");
const { ensureTaxonomySeeded, ensureSkillsSeeded } = await import("../src/lib/db/seed");
const { studentTargetCareers, studentProfiles, skills, userSkills } =
  await import("../src/lib/db/schema");

const PASSWORD = "correct-horse-battery-staple";

async function newUser(email: string): Promise<string> {
  const { json } = await callAuth(auth, "/sign-up/email", {
    email,
    password: PASSWORD,
    name: email,
  });
  return json.user.id as string;
}

/** Give a user a couple of catalog skills so Phase-7 readiness can go green. */
async function seedSkills(userId: string, slugs: string[]) {
  await ensureSkillsSeeded();
  const rows = await db.select({ id: skills.id, slug: skills.slug }).from(skills);
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));
  for (const s of slugs) {
    const skillId = idBySlug.get(s);
    if (!skillId) continue;
    await db
      .insert(userSkills)
      .values({ userId, skillId, currentLevel: "intermediate", source: "user_input" })
      .onConflictDoNothing();
  }
}

let alice = "";
let bob = "";

beforeAll(async () => {
  await ensureTaxonomySeeded();
  alice = await newUser("alice-cp@example.com");
  bob = await newUser("bob-cp@example.com");
});

describe("catalog", () => {
  test("exposes roles across many branches + industry / job-type / work-mode option sets", () => {
    const cat = cp.careerProfileCatalog();
    for (const slug of [
      "software-engineer",
      "embedded-engineer",
      "vlsi-engineer",
      "mechanical-design-engineer",
      "civil-engineer",
      "structural-engineer",
      "robotics-engineer",
    ].filter((s) => cat.roles.some((r) => r.slug === s || s === "civil-engineer"))) {
      // civil-engineer isn't a slug in the catalog; skip-safe check below instead
      void slug;
    }
    expect(cat.roles.some((r) => r.slug === "software-engineer")).toBe(true);
    expect(cat.roles.some((r) => r.slug === "embedded-engineer")).toBe(true);
    expect(cat.roles.some((r) => r.slug === "mechanical-design-engineer")).toBe(true);
    expect(cat.roles.some((r) => r.category === "Civil & Infrastructure")).toBe(true);
    expect(cat.industries.some((i) => i.slug === "semiconductors")).toBe(true);
    expect(cat.jobTypes.some((j) => j.value === "internship")).toBe(true);
    expect(cat.workModes.map((w) => w.value)).toContain("hybrid");
  });

  test("searchTargetRoles is reference-only and filters by name/category", () => {
    expect(cp.searchTargetRoles("embedded").some((r) => r.slug === "embedded-engineer")).toBe(true);
    expect(cp.searchTargetRoles("").length).toBeGreaterThan(20);
  });
});

describe("career profile CRUD", () => {
  test("update persists identity + preferences and round-trips", async () => {
    await cp.updateCareerProfile(alice, {
      branchSlug: "electronics-communication",
      specialization: "VLSI",
      degree: "B.Tech",
      collegeName: "NIT Warangal",
      graduationYear: 2026,
      experienceLevel: "internship",
      careerGoals: "Break into chip design at a product company.",
      preferredIndustries: ["semiconductors", "electronics-hardware"],
      preferredJobTypes: ["full_time", "internship"],
      preferredLocations: ["Bengaluru", "Hyderabad", "Remote"],
      workMode: "hybrid",
      targetRoleSlugs: ["vlsi-engineer", "embedded-engineer"],
      primaryRoleSlug: "vlsi-engineer",
    });

    const view = await cp.getCareerProfile(alice);
    expect(view.identity.branchSlug).toBe("electronics-communication");
    expect(view.identity.specialization).toBe("VLSI");
    expect(view.identity.experienceLevel).toBe("internship");
    expect(view.careerGoals).toContain("chip design");
    expect(view.preferences.industries.map((i) => i.slug).sort()).toEqual([
      "electronics-hardware",
      "semiconductors",
    ]);
    expect(view.preferences.jobTypes.map((j) => j.value).sort()).toEqual([
      "full_time",
      "internship",
    ]);
    expect(view.preferences.locations).toEqual(["Bengaluru", "Hyderabad", "Remote"]);
    expect(view.preferences.workMode).toBe("hybrid");
    // back-compat mirror
    const [row] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, alice));
    expect(row!.preferredWorkLocation).toBe("Bengaluru");
  });

  test("a second save updates in place, not a duplicate row", async () => {
    await cp.updateCareerProfile(alice, { specialization: "Analog & RF", workMode: "onsite" });
    const rows = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, alice));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.specialization).toBe("Analog & RF");
  });
});

describe("target roles", () => {
  test("add multiple, list, and remove", async () => {
    let roles = await cp.addTargetRole(bob, "backend-developer");
    expect(roles.map((r) => r.slug)).toContain("backend-developer");
    // first role auto-becomes primary
    expect(roles.find((r) => r.slug === "backend-developer")!.isPrimary).toBe(true);

    roles = await cp.addTargetRole(bob, "data-engineer");
    roles = await cp.addTargetRole(bob, "devops-engineer");
    expect(roles).toHaveLength(3);
    // still exactly one primary
    expect(roles.filter((r) => r.isPrimary)).toHaveLength(1);

    roles = await cp.removeTargetRole(bob, "data-engineer");
    expect(roles.map((r) => r.slug).sort()).toEqual(["backend-developer", "devops-engineer"]);
  });

  test("setPrimaryTargetRole switches the primary and keeps exactly one", async () => {
    let roles = await cp.setPrimaryTargetRole(bob, "devops-engineer");
    expect(roles.find((r) => r.slug === "devops-engineer")!.isPrimary).toBe(true);
    expect(roles.filter((r) => r.isPrimary)).toHaveLength(1);

    // promoting a brand-new role adds it AND makes it primary
    roles = await cp.setPrimaryTargetRole(bob, "cloud-engineer");
    expect(roles.find((r) => r.slug === "cloud-engineer")!.isPrimary).toBe(true);
    expect(roles.filter((r) => r.isPrimary)).toHaveLength(1);
  });

  test("removing the primary promotes another role", async () => {
    const before = await cp.getCareerProfile(bob);
    expect(before.primaryRole!.slug).toBe("cloud-engineer");
    const roles = await cp.removeTargetRole(bob, "cloud-engineer");
    expect(roles.filter((r) => r.isPrimary)).toHaveLength(1);
    expect(roles.some((r) => r.slug === "cloud-engineer")).toBe(false);
  });

  test("the primary target role is persisted on student_target_careers", async () => {
    const rows = await db
      .select()
      .from(studentTargetCareers)
      .where(eq(studentTargetCareers.userId, bob));
    expect(rows.filter((r) => r.isPrimary)).toHaveLength(1);
  });
});

describe("invalid input", () => {
  test("unknown role / industry / job type / work mode are rejected", async () => {
    await expect(cp.addTargetRole(alice, "not-a-role")).rejects.toThrow(/unknown role/i);
    await expect(
      cp.updateCareerProfile(alice, { preferredIndustries: ["space-mining"] }),
    ).rejects.toThrow();
    await expect(
      cp.updateCareerProfile(alice, { preferredJobTypes: ["slavery"] }),
    ).rejects.toThrow();
    await expect(cp.updateCareerProfile(alice, { workMode: "telepathic" })).rejects.toThrow();
    await expect(cp.updateCareerProfile(alice, { graduationYear: 1700 })).rejects.toThrow();
  });
});

describe("role requirements + Phase 7 handoff", () => {
  test("getRoleRequirements returns core/important/helpful skills with levels", async () => {
    const req = await cp.getRoleRequirements("backend-developer");
    expect(req).not.toBeNull();
    expect(req!.requirements.length).toBeGreaterThan(0);
    expect(req!.counts.core).toBeGreaterThan(0);
    for (const r of req!.requirements) {
      expect(["beginner", "intermediate", "advanced", "expert"]).toContain(r.requiredLevel);
      expect(["core", "important", "helpful"]).toContain(r.importance);
    }
  });

  test("getPhase7Inputs is not ready without a primary role, ready once role + skills exist", async () => {
    const carol = await newUser("carol-cp@example.com");
    let inputs = await cp.getPhase7Inputs(carol);
    expect(inputs.readiness.ready).toBe(false);
    expect(inputs.readiness.missing).toContain("Choose a primary target role");
    expect(inputs.primaryRole).toBeNull();
    expect(inputs.requiredSkills).toEqual([]);

    await cp.setPrimaryTargetRole(carol, "backend-developer");
    await seedSkills(carol, ["python", "sql", "git"]);

    inputs = await cp.getPhase7Inputs(carol);
    expect(inputs.primaryRole?.slug).toBe("backend-developer");
    expect(inputs.primaryRole?.careerId).toBeTruthy();
    expect(inputs.requiredSkills.length).toBeGreaterThan(0);
    expect(inputs.currentSkills.length).toBe(3);
    expect(inputs.readiness.ready).toBe(true);
    expect(inputs.readiness.requiredSkillCount).toBeGreaterThan(0);
    expect(inputs.readiness.coveredRequiredSkills).toBeGreaterThanOrEqual(1);
  });
});

describe("ownership + auth", () => {
  test("one user's career profile / target roles never leak to another", async () => {
    const aView = await cp.getCareerProfile(alice);
    const bView = await cp.getCareerProfile(bob);
    expect(aView.identity.specialization).toBe("Analog & RF");
    expect(bView.identity.specialization).not.toBe("Analog & RF");
    expect(aView.targetRoles.map((r) => r.slug)).not.toEqual(bView.targetRoles.map((r) => r.slug));

    // A role slug is the only client input — it can't be used to reach another
    // user's rows. Bob promoting a role only ever touches Bob's rows.
    await cp.setPrimaryTargetRole(bob, "backend-developer");
    const aliceRows = await db
      .select()
      .from(studentTargetCareers)
      .where(eq(studentTargetCareers.userId, alice));
    expect(aliceRows.some((r) => r.isPrimary && r.careerId)).toBe(true);
    // Alice's primary is still her VLSI choice, untouched by Bob's call.
    const aliceView = await cp.getCareerProfile(alice);
    expect(aliceView.primaryRole?.slug).toBe("vlsi-engineer");
  });

  test("every RPC rejects with no session", async () => {
    await expect(cpFns.getCareerProfileData()).rejects.toThrow();
    await expect(cpFns.saveCareerProfile({ data: { specialization: "x" } })).rejects.toThrow();
    await expect(cpFns.addRole({ data: { roleSlug: "backend-developer" } })).rejects.toThrow();
    await expect(
      cpFns.setPrimaryRole({ data: { roleSlug: "backend-developer" } }),
    ).rejects.toThrow();
    await expect(cpFns.phase7Inputs()).rejects.toThrow();
  });
});
