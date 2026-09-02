import { describe, expect, test, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";

import { setupTestAuth, callAuth } from "./helpers";

const { auth, db } = await setupTestAuth();
const { analyzeAndPersistJob, getJobMatchView } = await import("../src/lib/job-analysis.server");
const skillsSvc = await import("../src/lib/student-skills.server");
const { ensureSkillsSeeded } = await import("../src/lib/db/seed");
const { skills, jobs, jobSkills } = await import("../src/lib/db/schema");
const { jobMatches, aiRuns, activityEvents } = await import("../src/lib/db/career-schema");
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

async function giveResumeSkill(userId: string, slug: string) {
  const [row] = await db.select().from(skills).where(eq(skills.slug, slug)).limit(1);
  await skillsSvc.recordStudentSkill(userId, {
    skillId: row!.id,
    level: "intermediate",
    source: "resume",
    reason: "test",
  });
}

const EXTRACTION: JDExtraction = {
  extractedTitle: "Platform Engineer",
  extractedCompany: "Globex",
  seniority: "mid",
  employmentType: "full_time",
  location: "Remote",
  remote: true,
  requiredSkills: [
    { name: "Python", category: "programming_language", severity: "mandatory" },
    { name: "Docker", category: "devops", severity: "mandatory" },
    { name: "Kubernetes", category: "devops", severity: "preferred" },
  ],
  educationRequirements: ["BS in CS or equivalent"],
  experienceRequirements: ["3+ years"],
  responsibilities: ["Run the platform"],
  softSkills: ["communication"],
  certifications: [],
  domainKnowledge: ["infra"],
  summary: "Platform role.",
};

const fakeJdParse = async (_text: string) => ({
  extraction: EXTRACTION,
  stopReason: "end_turn" as const,
  model: "fake-opus",
  usage: { input: 100, output: 200 },
});

const JD_TEXT =
  "We need a Platform Engineer. Must have Python and Docker in production. " +
  "Kubernetes is a plus. 3+ years experience. BS in CS or equivalent.";

let alice = "";
let bob = "";

beforeAll(async () => {
  await ensureSkillsSeeded();
  alice = await newUser("job-alice@example.com");
  bob = await newUser("job-bob@example.com");
  await giveResumeSkill(alice, "python");
  await giveResumeSkill(alice, "docker");
});

describe("analyzeAndPersistJob — AI path (injected parser)", () => {
  test("persists the job, its skills, a job_matches row and an ai_runs audit row", async () => {
    const res = await analyzeAndPersistJob(
      alice,
      { rawDescription: JD_TEXT, title: "Platform Eng" },
      { jdParse: fakeJdParse },
    );
    expect(res.aiPowered).toBe(true);
    expect(res.matchScore).toBeGreaterThan(0);
    expect(res.skillsFound).toBe(3);

    const [job] = await db.select().from(jobs).where(eq(jobs.id, res.id));
    expect(job!.userId).toBe(alice);
    expect(job!.status).toBe("analyzed");
    expect(job!.scoringVersion).toMatch(/^\d{4}-\d{2}-\d{2}/); // SCORING_VERSION, not a model id
    expect(job!.structuredData?.requiredSkills).toHaveLength(3);
    expect(job!.matchSkillsScore).toBe(100); // alice has both mandatory skills
    expect(job!.remote).toBe(true);

    const js = await db.select().from(jobSkills).where(eq(jobSkills.jobId, res.id));
    // "Node.js"-style resolution: names resolve to catalog slugs (python, docker, kubernetes)
    expect(js.length).toBe(3);

    const [jm] = await db.select().from(jobMatches).where(eq(jobMatches.jobId, res.id));
    expect(jm!.userId).toBe(alice);
    expect(jm!.matchingSkills).toEqual(expect.arrayContaining(["Python", "Docker"]));
    expect(jm!.missingSkills).toEqual(expect.arrayContaining(["Kubernetes"]));

    const runs = await db
      .select()
      .from(aiRuns)
      .where(and(eq(aiRuns.userId, alice), eq(aiRuns.kind, "jd_analysis")));
    expect(runs.some((r) => r.status === "ok" && r.entityId === res.id)).toBe(true);

    const acts = await db
      .select()
      .from(activityEvents)
      .where(and(eq(activityEvents.userId, alice), eq(activityEvents.type, "job_analyzed")));
    expect(acts.length).toBeGreaterThan(0);
  });

  test("a failing parser is audited as a failed run and falls back to the keyword path", async () => {
    const res = await analyzeAndPersistJob(
      alice,
      { rawDescription: JD_TEXT },
      {
        jdParse: async () => {
          throw new Error("provider exploded");
        },
      },
    );
    expect(res.aiPowered).toBe(false); // fell back
    const runs = await db
      .select()
      .from(aiRuns)
      .where(and(eq(aiRuns.userId, alice), eq(aiRuns.kind, "jd_analysis")));
    expect(runs.some((r) => r.status === "failed")).toBe(true);
  });
});

describe("analyzeAndPersistJob — keyword fallback (no key, no injected parser)", () => {
  test("still produces a job + match from catalog keyword hits", async () => {
    const res = await analyzeAndPersistJob(alice, { rawDescription: JD_TEXT });
    expect(res.aiPowered).toBe(false);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, res.id));
    expect(job!.scoringVersion).toMatch(/^keyword\./);
    if (res.matchScore !== null) {
      const [jm] = await db.select().from(jobMatches).where(eq(jobMatches.jobId, res.id));
      expect(jm).toBeTruthy();
    }
  });
});

describe("getJobMatchView", () => {
  test("re-derives per-skill status from the member's CURRENT skills", async () => {
    const { id } = await analyzeAndPersistJob(
      bob,
      { rawDescription: JD_TEXT },
      { jdParse: fakeJdParse },
    );

    let view = await getJobMatchView(bob, id);
    expect(view).not.toBeNull();
    expect(view!.skillDetails.find((d) => d.name === "Python")!.status).toBe("gap");

    // bob learns Python (verified) — the view must flip without re-analysis
    const [py] = await db.select().from(skills).where(eq(skills.slug, "python"));
    await skillsSvc.recordStudentSkill(bob, {
      skillId: py!.id,
      level: "advanced",
      source: "assessment",
      score: 88,
      reason: "test",
    });

    view = await getJobMatchView(bob, id);
    expect(view!.skillDetails.find((d) => d.name === "Python")!.status).toBe("match");
    expect(view!.skillDetails.find((d) => d.name === "Python")!.studentLevel).toBe("advanced");
  });

  test("IDOR — a user cannot read another user's job match", async () => {
    const { id } = await analyzeAndPersistJob(
      alice,
      { rawDescription: JD_TEXT },
      { jdParse: fakeJdParse },
    );
    expect(await getJobMatchView(bob, id)).toBeNull();
    expect(await getJobMatchView(alice, id)).not.toBeNull();
  });
});
