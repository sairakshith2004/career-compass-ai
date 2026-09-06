import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { setupTestAuth, callAuth } from "./helpers";

const { auth, db } = await setupTestAuth();
const { tutorialsForSkill, tutorialSearchUrl, youtubeSearchUrl, allTutorials, TUTORIAL_LEVELS } =
  await import("../src/lib/tutorials-catalog");
const { getTutorialRecommendations } = await import("../src/lib/tutorials.server");
const skillsSvc = await import("../src/lib/student-skills.server");
const { ensureSkillsSeeded } = await import("../src/lib/db/seed");
const { skills, jobs, jobSkills, resumes } = await import("../src/lib/db/schema");
const { SKILLS_CATALOG } = await import("../src/lib/skills-catalog");

const PASSWORD = "correct-horse-battery-staple";

async function newUser(email: string): Promise<string> {
  const { json } = await callAuth(auth, "/sign-up/email", {
    email,
    password: PASSWORD,
    name: email,
  });
  return json.user.id as string;
}

async function skillId(slug: string): Promise<string> {
  const [row] = await db.select().from(skills).where(eq(skills.slug, slug)).limit(1);
  if (!row) throw new Error(`no catalog skill ${slug}`);
  return row.id;
}

async function giveResumeSkill(
  userId: string,
  slug: string,
  level: "beginner" | "intermediate" | "advanced" | "expert",
) {
  await skillsSvc.recordStudentSkill(userId, {
    skillId: await skillId(slug),
    level,
    source: "resume",
    reason: "test",
  });
}

/** Insert an analyzed job requiring the given skill slugs. */
async function analyzedJob(userId: string, requiredSlugs: string[]) {
  const [job] = await db
    .insert(jobs)
    .values({ userId, rawDescription: "test jd", status: "analyzed", analyzedAt: new Date() })
    .returning();
  for (const slug of requiredSlugs) {
    await db.insert(jobSkills).values({
      jobId: job!.id,
      skillId: await skillId(slug),
      requirement: "required",
    });
  }
  return job!.id;
}

describe("tutorials-catalog", () => {
  test("every catalog skill yields 4 valid YouTube search tutorials", () => {
    for (const s of SKILLS_CATALOG) {
      const tuts = tutorialsForSkill(s.slug);
      expect(tuts).toHaveLength(TUTORIAL_LEVELS.length);
      for (const t of tuts) {
        expect(t.skillSlug).toBe(s.slug);
        expect(t.url.startsWith("https://www.youtube.com/results?search_query=")).toBe(true);
        // URL is properly encoded — no raw spaces.
        expect(t.url).not.toContain(" ");
        expect(decodeURIComponent(t.url.split("search_query=")[1]!)).toBe(t.query);
      }
      expect(tuts.map((t) => t.level)).toEqual(TUTORIAL_LEVELS);
    }
  });

  test("allTutorials covers the whole catalog", () => {
    expect(allTutorials()).toHaveLength(SKILLS_CATALOG.length * TUTORIAL_LEVELS.length);
  });

  test("unknown slug returns no tutorials", () => {
    expect(tutorialsForSkill("not-a-real-skill")).toEqual([]);
  });

  test("tutorialSearchUrl / youtubeSearchUrl encode the query", () => {
    expect(youtubeSearchUrl("C++ advanced")).toBe(
      "https://www.youtube.com/results?search_query=C%2B%2B%20advanced",
    );
    expect(tutorialSearchUrl("React", "beginner")).toContain(
      "React%20full%20course%20for%20beginners",
    );
  });
});

describe("getTutorialRecommendations", () => {
  test("job-description gaps are ranked by how many analyzed jobs require them", async () => {
    await ensureSkillsSeeded();
    const userId = await newUser("tut-gaps@example.com");
    await db.insert(resumes).values({
      userId,
      version: 1,
      fileName: "cv.pdf",
      storageKey: `${userId}/x.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1,
      status: "complete",
    });

    // Resume shows python only.
    await giveResumeSkill(userId, "python", "advanced");
    // Two jobs want docker, one wants kubernetes, both want python.
    await analyzedJob(userId, ["python", "docker", "kubernetes"]);
    await analyzedJob(userId, ["python", "docker"]);

    const recs = await getTutorialRecommendations(userId);

    expect(recs.hasResume).toBe(true);
    expect(recs.analyzedJobCount).toBe(2);

    const gapSlugs = recs.jobGaps.map((g) => g.skillSlug);
    // python is covered (advanced) → not a gap.
    expect(gapSlugs).not.toContain("python");
    // docker (2 jobs) ranked above kubernetes (1 job).
    expect(gapSlugs.indexOf("docker")).toBeLessThan(gapSlugs.indexOf("kubernetes"));
    expect(recs.jobGaps.find((g) => g.skillSlug === "docker")!.demandCount).toBe(2);
    expect(recs.jobGaps[0]!.tutorials).toHaveLength(4);
  });

  test("resume skills at a weak level are surfaced for strengthening", async () => {
    await ensureSkillsSeeded();
    const userId = await newUser("tut-resume@example.com");
    await giveResumeSkill(userId, "sql", "beginner");

    const recs = await getTutorialRecommendations(userId);
    const strengthen = recs.resumeSkills.map((r) => r.skillSlug);
    expect(strengthen).toContain("sql");
    expect(recs.resumeSkills.find((r) => r.skillSlug === "sql")!.reason).toBe("resume_weak");
  });

  test("a skill that is both on the resume and a job gap only appears once (as a gap)", async () => {
    await ensureSkillsSeeded();
    const userId = await newUser("tut-dedupe@example.com");
    await giveResumeSkill(userId, "react", "beginner");
    await analyzedJob(userId, ["react"]);

    const recs = await getTutorialRecommendations(userId);
    expect(recs.jobGaps.map((g) => g.skillSlug)).toContain("react");
    expect(recs.resumeSkills.map((r) => r.skillSlug)).not.toContain("react");
  });
});
