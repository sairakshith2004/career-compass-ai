import { describe, expect, test } from "bun:test";

import { setupTestAuth } from "./helpers";

// Taxonomy is read-only reference data — no auth — but it still needs a
// migrated database, so reuse the test harness for its DB setup.
await setupTestAuth();
const taxonomy = await import("../src/lib/taxonomy.server");
const catalog = await import("../src/lib/taxonomy-catalog");

describe("catalog integrity (compile-time source of truth)", () => {
  test("every career's skill slugs exist in the skills catalog", () => {
    expect(catalog.unknownCareerSkillSlugs()).toEqual([]);
  });

  test("every branch referenced by a career exists as a branch", () => {
    const branchSlugs = new Set(catalog.ENGINEERING_BRANCHES.map((b) => b.slug));
    for (const c of catalog.CAREER_PATHS) {
      for (const rel of ["primary", "common", "possible"] as const) {
        for (const b of c.branches?.[rel] ?? []) {
          expect(branchSlugs.has(b)).toBe(true);
        }
      }
    }
  });

  test("every branch points at a real category", () => {
    const catSlugs = new Set(catalog.ENGINEERING_CATEGORIES.map((c) => c.slug));
    for (const b of catalog.ENGINEERING_BRANCHES) {
      expect(catSlugs.has(b.categorySlug)).toBe(true);
    }
  });

  test("covers the categories and CS specializations the spec calls for", () => {
    const catSlugs = catalog.ENGINEERING_CATEGORIES.map((c) => c.slug);
    for (const s of [
      "computer-science-it",
      "electronics-communication",
      "electrical",
      "mechanical",
      "civil",
      "chemical",
      "biotechnology",
      "aerospace",
      "automobile",
      "mechatronics",
      "instrumentation",
      "industrial-production",
      "environmental",
      "petroleum",
      "biomedical",
    ]) {
      expect(catSlugs).toContain(s);
    }

    const branchSlugs = catalog.ENGINEERING_BRANCHES.map((b) => b.slug);
    for (const s of [
      "computer-science",
      "information-technology",
      "information-science",
      "software-engineering",
      "artificial-intelligence",
      "machine-learning",
      "ai-data-science",
      "data-science",
      "cybersecurity",
      "cloud-computing",
      "iot-branch",
      "blockchain-branch",
      "computer-networks",
    ]) {
      expect(branchSlugs).toContain(s);
    }
  });
});

describe("engineering categories & branches", () => {
  test("getEngineeringCategories returns ordered categories with branch counts", async () => {
    const cats = await taxonomy.getEngineeringCategories();
    expect(cats.length).toBeGreaterThanOrEqual(15);
    // Sorted by sortOrder — Computer Science / IT is first.
    expect(cats[0]!.slug).toBe("computer-science-it");
    const csIt = cats.find((c) => c.slug === "computer-science-it")!;
    expect(csIt.branchCount).toBeGreaterThanOrEqual(10);
  });

  test("getSpecializations scopes branches to a category", async () => {
    const csSpecs = await taxonomy.getSpecializations("computer-science-it");
    const csSlugs = csSpecs.map((b) => b.slug);
    expect(csSlugs).toContain("artificial-intelligence");
    expect(csSlugs).toContain("cybersecurity");
    // A mechanical branch must NOT appear under CS/IT.
    expect(csSlugs).not.toContain("mechanical");
    for (const b of csSpecs) expect(b.categorySlug).toBe("computer-science-it");
  });

  test("getTaxonomyTree nests branches under their category", async () => {
    const tree = await taxonomy.getTaxonomyTree();
    const csIt = tree.find((c) => c.slug === "computer-science-it")!;
    expect(csIt.branches.some((b) => b.slug === "data-science")).toBe(true);
    const totalBranches = tree.reduce((n, c) => n + c.branches.length, 0);
    expect(totalBranches).toBe(catalog.ENGINEERING_BRANCHES.length);
  });
});

describe("career paths are independent of branches", () => {
  test("getCareerPaths returns the whole catalog", async () => {
    const careers = await taxonomy.getCareerPaths();
    expect(careers.length).toBe(catalog.CAREER_PATHS.length);
    expect(careers.map((c) => c.slug)).toContain("software-engineer");
  });

  test("the SAME career is reachable from multiple, unrelated branches", async () => {
    const fromEce = await taxonomy.getCareersForBranch("electronics-communication");
    const fromMech = await taxonomy.getCareersForBranch("mechanical");
    const fromCse = await taxonomy.getCareersForBranch("computer-science");

    for (const list of [fromEce, fromMech, fromCse]) {
      expect(list.some((c) => c.slug === "software-engineer")).toBe(true);
    }
    // Data Scientist reaches Mechanical too — branch does not gate career.
    expect(fromMech.some((c) => c.slug === "data-scientist")).toBe(true);
  });

  test("spec example: ECE exit paths include embedded / VLSI / FPGA / electronics / software", async () => {
    const slugs = (await taxonomy.getCareersForBranch("electronics-communication")).map(
      (c) => c.slug,
    );
    for (const s of [
      "embedded-engineer",
      "vlsi-engineer",
      "fpga-engineer",
      "electronics-engineer",
      "software-engineer",
    ]) {
      expect(slugs).toContain(s);
    }
  });

  test("spec example: Mechanical exit paths include design / automotive / manufacturing / robotics / software", async () => {
    const slugs = (await taxonomy.getCareersForBranch("mechanical")).map((c) => c.slug);
    for (const s of [
      "mechanical-design-engineer",
      "automotive-engineer",
      "manufacturing-engineer",
      "robotics-engineer",
      "software-engineer",
    ]) {
      expect(slugs).toContain(s);
    }
  });

  test("spec example: CSE exit paths include the full software / data / security / cloud set", async () => {
    const slugs = (await taxonomy.getCareersForBranch("computer-science")).map((c) => c.slug);
    for (const s of [
      "software-engineer",
      "backend-developer",
      "frontend-developer",
      "fullstack-developer",
      "ai-engineer",
      "ml-engineer",
      "data-engineer",
      "security-engineer",
      "devops-engineer",
    ]) {
      expect(slugs).toContain(s);
    }
  });

  test("getCareersForBranch is ordered primary → common → possible", async () => {
    const list = await taxonomy.getCareersForBranch("computer-science");
    const rank = { primary: 0, common: 1, possible: 2 };
    for (let i = 1; i < list.length; i++) {
      expect(rank[list[i]!.relevance]).toBeGreaterThanOrEqual(rank[list[i - 1]!.relevance]);
    }
  });

  test("unknown branch → empty career list (no crash)", async () => {
    expect(await taxonomy.getCareersForBranch("no-such-branch")).toEqual([]);
  });
});

describe("career ↔ skill requirements", () => {
  test("getCareerPath returns skills grouped by importance + reachable branches", async () => {
    const ml = await taxonomy.getCareerPath("ml-engineer");
    expect(ml).not.toBeNull();
    expect(ml!.skills.core.map((s) => s.slug)).toContain("machine-learning");
    expect(ml!.skills.core.length).toBeGreaterThan(0);
    expect(ml!.reachableFromBranches.length).toBeGreaterThan(1);
    // A career reachable from AI *and* from CSE and ECE.
    const branchSlugs = ml!.reachableFromBranches.map((b) => b.slug);
    expect(branchSlugs).toContain("artificial-intelligence");
    expect(branchSlugs).toContain("computer-science");
  });

  test("getCareersForSkill lists every career that needs a skill", async () => {
    const careers = await taxonomy.getCareersForSkill("python");
    const slugs = careers.map((c) => c.slug);
    expect(slugs).toContain("ml-engineer");
    expect(slugs).toContain("data-engineer");
    expect(careers.every((c) => ["core", "important", "helpful"].includes(c.importance))).toBe(
      true,
    );
  });

  test("getSkillsForCareers unions requirements and counts how many careers share each", async () => {
    const merged = await taxonomy.getSkillsForCareers(["backend-developer", "data-engineer"]);
    const git = merged.find((s) => s.slug === "git");
    expect(git).toBeDefined();
    expect(git!.careerCount).toBe(2);
  });

  test("unknown career slug → null", async () => {
    expect(await taxonomy.getCareerPath("no-such-career")).toBeNull();
  });
});

describe("extensibility", () => {
  test("re-running the seed is idempotent (no duplicate rows)", async () => {
    const { ensureTaxonomySeeded } = await import("../src/lib/db/seed");
    const before = (await taxonomy.getCareerPaths()).length;
    await ensureTaxonomySeeded();
    await ensureTaxonomySeeded();
    const after = (await taxonomy.getCareerPaths()).length;
    expect(after).toBe(before);
  });
});
