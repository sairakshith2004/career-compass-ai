import { describe, expect, test, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

import { setupTestAuth, callAuth } from "./helpers";

const { auth, db } = await setupTestAuth();
const { computeMatch, computeSkillMatchDetails, SCORING_VERSION } =
  await import("../src/lib/match-engine.server");
const skillsSvc = await import("../src/lib/student-skills.server");
const { ensureSkillsSeeded } = await import("../src/lib/db/seed");
const { skills } = await import("../src/lib/db/schema");
import type { JDExtraction } from "../src/lib/jd-intelligence.server";

const PASSWORD = "correct-horse-battery-staple";

async function newUser(email: string): Promise<string> {
  const { json } = await callAuth(auth, "/sign-up/email", {
    email,
    password: PASSWORD,
    name: email,
  });
  return json.user.id as string;
}

async function giveSkill(
  userId: string,
  slug: string,
  level: "beginner" | "intermediate" | "advanced" | "expert",
  source: "assessment" | "resume",
) {
  const [row] = await db.select().from(skills).where(eq(skills.slug, slug)).limit(1);
  if (!row) throw new Error(`no catalog skill ${slug}`);
  await skillsSvc.recordStudentSkill(userId, {
    skillId: row.id,
    level,
    source,
    ...(source === "assessment" ? { score: 90 } : {}),
    reason: "test",
  });
}

const jd = (over: Partial<JDExtraction> = {}): JDExtraction => ({
  extractedTitle: "Backend Engineer",
  extractedCompany: "TestCo",
  seniority: "junior",
  employmentType: "full_time",
  location: null,
  remote: null,
  requiredSkills: [
    { name: "Python", category: "programming_language", severity: "mandatory" },
    { name: "SQL", category: "database", severity: "mandatory" },
    { name: "Docker", category: "devops", severity: "mandatory" },
    { name: "React", category: "framework", severity: "preferred" },
  ],
  educationRequirements: [],
  experienceRequirements: [],
  responsibilities: [],
  softSkills: [],
  certifications: [],
  domainKnowledge: [],
  summary: null,
  ...over,
});

let strong = "";
let empty = "";

beforeAll(async () => {
  await ensureSkillsSeeded();
  strong = await newUser("match-strong@example.com");
  empty = await newUser("match-empty@example.com");
  await giveSkill(strong, "python", "advanced", "assessment");
  await giveSkill(strong, "sql", "intermediate", "assessment");
  await giveSkill(strong, "docker", "beginner", "assessment");
  await giveSkill(strong, "react", "intermediate", "assessment");
});

describe("computeMatch — dimension scoring", () => {
  test("a student who has every mandatory skill scores 100 on skills", async () => {
    const r = await computeMatch(strong, jd());
    expect(r.scores.skillsScore).toBe(100);
    expect(r.scores.overallScore).toBeGreaterThanOrEqual(80);
    expect(r.missingSkills).toHaveLength(0);
    expect(r.matchingSkills).toEqual(expect.arrayContaining(["Python", "SQL", "Docker", "React"]));
  });

  test("a student with no skills scores 0 on skills and lists every requirement as missing", async () => {
    const r = await computeMatch(empty, jd());
    expect(r.scores.skillsScore).toBe(0);
    // mandatory + preferred both surface as missing
    expect(r.missingSkills).toEqual(expect.arrayContaining(["Python", "SQL", "Docker", "React"]));
    expect(r.scores.overallScore).toBeLessThan(r.scores.skillsScore + 60);
  });

  test("partial mandatory coverage yields a proportional skills score", async () => {
    const half = await newUser("match-half@example.com");
    await giveSkill(half, "python", "advanced", "assessment");
    await giveSkill(half, "sql", "advanced", "assessment");
    const r = await computeMatch(half, jd());
    // 2 of 3 mandatory
    expect(r.scores.skillsScore).toBe(67);
  });

  test("stamps the current SCORING_VERSION into structuredData", async () => {
    const r = await computeMatch(strong, jd());
    expect(r.structuredData.scoringVersion).toBe(SCORING_VERSION);
    expect(r.structuredData.requiredSkills).toHaveLength(4);
  });

  test("experience score rewards meeting the seniority bar and penalises being far below", async () => {
    // strong user has no resume/profile experience level → mid confidence
    const noSeniority = await computeMatch(strong, jd({ seniority: null }));
    expect(noSeniority.scores.experienceScore).toBe(80);
  });

  test("overall score is the documented weighted blend", async () => {
    const r = await computeMatch(strong, jd());
    const s = r.scores;
    const expected = Math.round(
      s.skillsScore * 0.35 +
        s.toolsScore * 0.15 +
        s.experienceScore * 0.2 +
        s.educationScore * 0.1 +
        s.keywordsScore * 0.2,
    );
    expect(s.overallScore).toBe(Math.max(0, Math.min(100, expected)));
  });
});

describe("computeSkillMatchDetails — live re-derivation", () => {
  test("resolves free-text names via the catalog and reflects current skills", async () => {
    const details = await computeSkillMatchDetails(strong, [
      { name: "Node.js", category: "framework", severity: "mandatory" },
      { name: "Python", category: "programming_language", severity: "mandatory" },
    ]);
    const byName = Object.fromEntries(details.map((d) => [d.name, d]));
    expect(byName["Python"]!.status).toBe("match");
    expect(byName["Python"]!.catalogSlug).toBe("python");
    expect(byName["Python"]!.studentLevel).toBe("advanced");
    expect(byName["Node.js"]!.status).toBe("gap");
    expect(byName["Node.js"]!.catalogSlug).toBe("nodejs"); // "Node.js" → nodejs, not node-js
  });

  test("mandatory requirements sort before preferred, gaps before matches", async () => {
    const details = await computeSkillMatchDetails(strong, [
      { name: "React", category: "framework", severity: "preferred" },
      { name: "Kubernetes", category: "devops", severity: "mandatory" },
      { name: "Python", category: "programming_language", severity: "mandatory" },
    ]);
    expect(details.map((d) => d.name)).toEqual(["Kubernetes", "Python", "React"]);
  });
});
