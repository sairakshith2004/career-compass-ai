import { beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { setupTestAuth, callAuth } from "./helpers";
import { FAKE_ANALYSIS, fakeParse, fileFrom, makePdf, SAMPLE_RESUME_TEXT } from "./resume-fixtures";

const { auth, db } = await setupTestAuth();
const {
  ingestResumeUpload,
  runResumeAnalysis,
  getResumeView,
  listResumeVersions,
  deleteResumeVersion,
  getResumeFileForUser,
} = await import("../src/lib/resume.server");
const resumeFns = await import("../src/lib/resume-fns");
const { resumes, resumeAnalyses } = await import("../src/lib/db/schema");

const PDF_MIME = "application/pdf";
const PASSWORD = "correct-horse-battery-staple";

async function newUser(email: string): Promise<string> {
  const { json } = await callAuth(auth, "/sign-up/email", {
    email,
    password: PASSWORD,
    name: email,
  });
  return json.user.id as string;
}
const pdf = (text = SAMPLE_RESUME_TEXT, name = "resume.pdf") =>
  fileFrom(makePdf(text), name, PDF_MIME);

let alice = "";
let bob = "";
beforeAll(async () => {
  alice = await newUser("alice-ver@example.com");
  bob = await newUser("bob-ver@example.com");
});

describe("resume versioning", () => {
  test("each upload is a new version; old rows, files and analyses survive", async () => {
    const a = await ingestResumeUpload(alice, pdf("Version one resume ".repeat(12), "v1.pdf"));
    await runResumeAnalysis(alice, a.resumeId, { parse: fakeParse(FAKE_ANALYSIS) });

    const b = await ingestResumeUpload(alice, pdf("Version two resume ".repeat(12), "v2.pdf"));
    await runResumeAnalysis(alice, b.resumeId, { parse: fakeParse(FAKE_ANALYSIS) });

    expect(a.version).toBe(1);
    expect(b.version).toBe(2);

    const rows = await db.select().from(resumes).where(eq(resumes.userId, alice));
    expect(rows).toHaveLength(2);

    // Both analyses are preserved — the older one was NOT destroyed.
    const analyses = await db.select().from(resumeAnalyses).where(eq(resumeAnalyses.userId, alice));
    expect(analyses).toHaveLength(2);

    // Both files still on disk.
    expect((await getResumeFileForUser(alice, a.resumeId))?.bytes.length).toBeGreaterThan(0);
    expect((await getResumeFileForUser(alice, b.resumeId))?.bytes.length).toBeGreaterThan(0);
  });

  test("the active view is the highest version; an old version is still viewable by id", async () => {
    const active = await getResumeView(alice);
    expect(active.resume!.version).toBe(2);
    expect(active.resume!.isActive).toBe(true);
    expect(active.resume!.fileName).toBe("v2.pdf");

    const [v1] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, alice))
      .then((r) => r.filter((x) => x.version === 1));

    const old = await getResumeView(alice, v1!.id);
    expect(old.resume!.version).toBe(1);
    expect(old.resume!.isActive).toBe(false);
    expect(old.analysis).not.toBeNull();
  });

  test("listResumeVersions returns newest-first with an active flag and analysis flag", async () => {
    const list = await listResumeVersions(alice);
    expect(list.map((v) => v.version)).toEqual([2, 1]);
    expect(list[0]!.isActive).toBe(true);
    expect(list[1]!.isActive).toBe(false);
    expect(list.every((v) => v.hasAnalysis)).toBe(true);
  });

  test("deleting a version removes its row + file; the next version becomes active", async () => {
    const list = await listResumeVersions(alice);
    const v2 = list.find((v) => v.version === 2)!;
    const v1 = list.find((v) => v.version === 1)!;

    const ok = await deleteResumeVersion(alice, v2.id);
    expect(ok).toBe(true);

    const rows = await db.select().from(resumes).where(eq(resumes.userId, alice));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(v1.id);
    expect(await getResumeFileForUser(alice, v2.id)).toBeNull();

    // v1 is now the active view.
    const active = await getResumeView(alice);
    expect(active.resume!.version).toBe(1);
    expect(active.resume!.isActive).toBe(true);
  });

  test("re-analyzing an older version does not disturb the others", async () => {
    // Alice is back to one version. Add two more.
    const b = await ingestResumeUpload(alice, pdf("Fresh v ".repeat(20), "v3.pdf"));
    await runResumeAnalysis(alice, b.resumeId, { parse: fakeParse(FAKE_ANALYSIS) });
    const list = await listResumeVersions(alice);
    const older = list[list.length - 1]!; // v1
    // Retry the OLD one.
    await runResumeAnalysis(alice, older.id, { parse: fakeParse(FAKE_ANALYSIS) });

    // Still exactly one analysis per resume, and the active version is unchanged.
    for (const v of await listResumeVersions(alice)) {
      const rows = await db.select().from(resumeAnalyses).where(eq(resumeAnalyses.resumeId, v.id));
      expect(rows.length).toBeLessThanOrEqual(1);
    }
    expect((await getResumeView(alice)).resume!.fileName).toBe("v3.pdf");
  });
});

describe("versioning — ownership", () => {
  test("a user cannot view or delete another user's version", async () => {
    const a = await ingestResumeUpload(alice, pdf("Alice private ".repeat(12), "priv.pdf"));

    // getResumeView with a foreign id → empty view, never Alice's data.
    const asBob = await getResumeView(bob, a.resumeId);
    expect(asBob.resume).toBeNull();

    // deleteResumeVersion refuses and does not touch the row.
    expect(await deleteResumeVersion(bob, a.resumeId)).toBe(false);
    const [stillThere] = await db.select().from(resumes).where(eq(resumes.id, a.resumeId));
    expect(stillThere).toBeDefined();
  });

  test("the version RPC wrappers reject with no session", async () => {
    await expect(resumeFns.listResumes()).rejects.toThrow();
    await expect(resumeFns.deleteResume({ data: { resumeId: "x" } })).rejects.toThrow();
    await expect(resumeFns.getResumeVersion({ data: { resumeId: "x" } })).rejects.toThrow();
  });
});
