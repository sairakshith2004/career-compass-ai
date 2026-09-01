import { beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { setupTestAuth, callAuth } from "./helpers";
import { FAKE_ANALYSIS, fakeParse, fileFrom, makePdf, SAMPLE_RESUME_TEXT } from "./resume-fixtures";

const { auth, db } = await setupTestAuth();
const { ingestResumeUpload, runResumeAnalysis, getResumeView, getResumeFileForUser } =
  await import("../src/lib/resume.server");
const resumeFns = await import("../src/lib/resume-fns");
const { resumes, resumeAnalyses, resumeSkills, resumeCareerSignals, userSkills } =
  await import("../src/lib/db/schema");

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
const pdfFile = (text = SAMPLE_RESUME_TEXT, name = "resume.pdf") =>
  fileFrom(makePdf(text), name, PDF_MIME);

let alice = "";
let bob = "";
beforeAll(async () => {
  alice = await newUser("alice-resume@example.com");
  bob = await newUser("bob-resume@example.com");
});

describe("ingest", () => {
  test("valid PDF: stores the row, extracts text, status → processing", async () => {
    const { resumeId } = await ingestResumeUpload(alice, pdfFile());
    const [row] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
    expect(row!.userId).toBe(alice);
    expect(row!.status).toBe("processing");
    expect(row!.textCharCount).toBeGreaterThan(40);
    expect(row!.extractedText).toContain("Electronics");
    // storageKey is server-generated and namespaced by user.
    expect(row!.storageKey.startsWith(`${alice}/`)).toBe(true);
    expect(row!.fileName).toBe("resume.pdf");
  });

  test("re-uploading creates a new version and preserves the previous one", async () => {
    const { resumeId: first, version: v1 } = await ingestResumeUpload(
      alice,
      pdfFile("First resume text ".repeat(10), "first.pdf"),
    );
    const { resumeId: second, version: v2 } = await ingestResumeUpload(
      alice,
      pdfFile("Second resume text ".repeat(10), "second.pdf"),
    );
    expect(v2).toBe(v1 + 1);

    const rows = await db.select().from(resumes).where(eq(resumes.userId, alice));
    // Both versions survive (plus any from earlier tests in this file).
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(first);
    expect(ids).toContain(second);
    expect(rows.find((r) => r.id === first)!.fileName).toBe("first.pdf");

    // getResumeView returns the highest version (the active one).
    const view = await getResumeView(alice);
    expect(view.resume!.id).toBe(second);
    expect(view.resume!.isActive).toBe(true);
  });

  test("invalid file is rejected before anything is stored", async () => {
    const before = await db.select().from(resumes).where(eq(resumes.userId, bob));
    await expect(
      ingestResumeUpload(bob, fileFrom(new Uint8Array(300), "x.pdf", PDF_MIME)),
    ).rejects.toMatchObject({ code: "bad_signature" });
    const after = await db.select().from(resumes).where(eq(resumes.userId, bob));
    expect(after.length).toBe(before.length);
  });
});

describe("analyze", () => {
  test("valid PDF → complete, with analysis / skills / career-signal / userSkills rows", async () => {
    const { resumeId } = await ingestResumeUpload(alice, pdfFile());
    const out = await runResumeAnalysis(alice, resumeId, { parse: fakeParse(FAKE_ANALYSIS) });
    expect(out.status).toBe("complete");

    const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
    expect(resume!.status).toBe("complete");
    expect(resume!.analyzedAt).toBeInstanceOf(Date);

    const [analysis] = await db
      .select()
      .from(resumeAnalyses)
      .where(eq(resumeAnalyses.resumeId, resumeId));
    expect(analysis!.userId).toBe(alice);
    expect(analysis!.aiBranchSlug).toBe("electronics-communication"); // matched from free text
    expect(analysis!.aiBranchConfidence).toBe(95);

    const skillRows = await db
      .select()
      .from(resumeSkills)
      .where(eq(resumeSkills.analysisId, analysis!.id));
    expect(skillRows.length).toBe(3);
    // A resume-derived skill is never marked verified.
    for (const s of skillRows) {
      expect(["claimed", "supported_by_resume"]).toContain(s.evidenceType);
    }
    const verilog = skillRows.find((s) => s.skillNameRaw === "Verilog")!;
    expect(verilog.evidenceType).toBe("supported_by_resume");
    expect(verilog.evidence?.[0]?.label).toContain("FPGA");

    const signals = await db
      .select()
      .from(resumeCareerSignals)
      .where(eq(resumeCareerSignals.analysisId, analysis!.id));
    expect(signals.length).toBe(3);
    const embedded = signals.find((s) => s.careerTitleRaw === "Embedded Engineer")!;
    expect(embedded.score).toBe(92);
    expect(embedded.careerId).not.toBeNull(); // matched to the catalog career

    // Matched skills feed the shared per-user skill table as source=resume.
    const us = await db.select().from(userSkills).where(eq(userSkills.userId, alice));
    expect(us.length).toBeGreaterThan(0);
    for (const r of us) {
      expect(r.source).toBe("resume");
      expect(r.verifiedLevel).toBeNull();
    }
  });

  test("getResumeView returns the resolved analysis + no declared/detected discrepancy yet", async () => {
    const { resumeId } = await ingestResumeUpload(alice, pdfFile());
    await runResumeAnalysis(alice, resumeId, { parse: fakeParse(FAKE_ANALYSIS) });
    const view = await getResumeView(alice);
    expect(view.resume?.status).toBe("complete");
    expect(view.analysis?.detected.branchLabel).toContain("Electronics");
    expect(view.analysis?.skills[0]?.confidence).toBeGreaterThanOrEqual(
      view.analysis!.skills[view.analysis!.skills.length - 1]!.confidence,
    );
    expect(view.discrepancies).toEqual([]); // no student_profiles row for alice
  });

  test("declared ≠ detected surfaces a discrepancy (branch is NOT silently changed)", async () => {
    const { studentProfiles, engineeringBranches } = await import("../src/lib/db/schema");
    const { ensureTaxonomySeeded } = await import("../src/lib/db/seed");
    await ensureTaxonomySeeded();
    const [mech] = await db
      .select()
      .from(engineeringBranches)
      .where(eq(engineeringBranches.slug, "mechanical"));
    // Alice DECLARES Mechanical; her résumé screams ECE.
    await db
      .insert(studentProfiles)
      .values({
        userId: alice,
        branchId: mech!.id,
        careerGoalStatus: "exploring",
        lastCompletedStep: 4,
      })
      .onConflictDoUpdate({ target: studentProfiles.userId, set: { branchId: mech!.id } });

    const { resumeId } = await ingestResumeUpload(alice, pdfFile());
    await runResumeAnalysis(alice, resumeId, { parse: fakeParse(FAKE_ANALYSIS) });

    const view = await getResumeView(alice);
    const branchDisc = view.discrepancies.find((d) => d.field === "branch");
    expect(branchDisc).toBeDefined();
    expect(branchDisc!.declared).toBe("Mechanical Engineering");
    expect(branchDisc!.detected).toContain("Electronics");

    // The declared profile row is untouched.
    const [profile] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, alice));
    expect(profile!.branchId).toBe(mech!.id);

    await db.delete(studentProfiles).where(eq(studentProfiles.userId, alice));
  });

  test("AI failure → status failed + user-safe errorMessage + keyword skill baseline", async () => {
    const { resumeId } = await ingestResumeUpload(alice, pdfFile());
    await expect(
      runResumeAnalysis(alice, resumeId, { parse: fakeParse(null) }),
    ).rejects.toMatchObject({ code: "malformed" });

    const [row] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
    expect(row!.status).toBe("failed");
    expect(row!.errorMessage).toBeTruthy();
    expect(row!.errorMessage).not.toContain("Error:");
    // Baseline keyword skills still populated so the app isn't broken.
    const us = await db.select().from(userSkills).where(eq(userSkills.userId, alice));
    expect(us.length).toBeGreaterThan(0);
  });

  test("retry after a failure succeeds and clears the stale analysis", async () => {
    const { resumeId } = await ingestResumeUpload(alice, pdfFile());
    await runResumeAnalysis(alice, resumeId, { parse: fakeParse(null) }).catch(() => {});
    const out = await runResumeAnalysis(alice, resumeId, { parse: fakeParse(FAKE_ANALYSIS) });
    expect(out.status).toBe("complete");
    const analyses = await db
      .select()
      .from(resumeAnalyses)
      .where(eq(resumeAnalyses.resumeId, resumeId));
    expect(analyses).toHaveLength(1); // no duplicate
  });
});

describe("ownership & access control", () => {
  test("a user cannot analyze another user's resume", async () => {
    const { resumeId } = await ingestResumeUpload(alice, pdfFile());
    await expect(
      runResumeAnalysis(bob, resumeId, { parse: fakeParse(FAKE_ANALYSIS) }),
    ).rejects.toThrow(/not found/i);
  });

  test("getResumeView only ever returns the caller's own resume", async () => {
    const { resumeId } = await ingestResumeUpload(alice, pdfFile());
    await runResumeAnalysis(alice, resumeId, { parse: fakeParse(FAKE_ANALYSIS) });
    await ingestResumeUpload(bob, pdfFile("Bob unrelated resume ".repeat(10), "bob.pdf"));

    const bobView = await getResumeView(bob);
    expect(bobView.resume?.fileName).toBe("bob.pdf");
    expect(bobView.analysis).toBeNull(); // bob's isn't analyzed
  });

  test("a user cannot download another user's resume file", async () => {
    const { resumeId } = await ingestResumeUpload(alice, pdfFile());
    expect(await getResumeFileForUser(bob, resumeId)).toBeNull();
    const own = await getResumeFileForUser(alice, resumeId);
    expect(own?.fileName).toBe("resume.pdf");
    expect(own?.bytes.length).toBeGreaterThan(0);
  });

  test("RPC wrappers reject when there is no session", async () => {
    await expect(resumeFns.getResume()).rejects.toThrow();
    await expect(resumeFns.analyzeResume({ data: { resumeId: "whatever" } })).rejects.toThrow();
    const fd = new FormData();
    fd.append("file", fileFrom(makePdf("x".repeat(200)), "r.pdf", PDF_MIME));
    await expect(resumeFns.uploadResume({ data: fd })).rejects.toThrow();
  });
});
