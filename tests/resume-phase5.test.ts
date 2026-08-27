import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { setupTestAuth, callAuth } from "./helpers";
import { FAKE_ANALYSIS, fakeParse, fileFrom, makePdf, SAMPLE_RESUME_TEXT } from "./resume-fixtures";

const { auth, db } = await setupTestAuth();
const { ingestResumeUpload, runResumeAnalysis, getResumeView } =
  await import("../src/lib/resume.server");
const { resumeAnalyses, resumeSkills } = await import("../src/lib/db/schema");
const { mapAnthropicError, ResumeAIError, ResumeAnalysisSchema } =
  await import("../src/lib/resume-ai.server");
const Anthropic = (await import("@anthropic-ai/sdk")).default;

const PDF_MIME = "application/pdf";
const PASSWORD = "correct-horse-battery-staple";
async function newUser(email: string) {
  const { json } = await callAuth(auth, "/sign-up/email", {
    email,
    password: PASSWORD,
    name: email,
  });
  return json.user.id as string;
}
const pdf = () => fileFrom(makePdf(SAMPLE_RESUME_TEXT), "resume.pdf", PDF_MIME);

let alice = "";
beforeAll(async () => {
  alice = await newUser("p5-alice@example.com");
});

describe("Phase 5 — richer analysis surface", () => {
  test("branch confidence, uncertainty flag and evidence round-trip to the view", async () => {
    const { resumeId } = await ingestResumeUpload(alice, pdf());
    await runResumeAnalysis(alice, resumeId, { parse: fakeParse(FAKE_ANALYSIS) });
    const v = await getResumeView(alice);

    expect(v.analysis?.detected.branchLabel).toContain("Electronics");
    expect(v.analysis?.detected.branchConfidence).toBe(95);
    expect(v.analysis?.detected.branchUncertain).toBe(false);
    expect(v.analysis?.detected.branchEvidence.length).toBeGreaterThan(0);
  });

  test("low-confidence branch is stored and shown as uncertain, not a confident label", async () => {
    const uncertain = {
      ...FAKE_ANALYSIS,
      academic: {
        ...FAKE_ANALYSIS.academic,
        detectedBranch: "Electronics and Communication Engineering",
        detectedBranchConfidence: 30,
        detectedBranchUncertain: true,
        branchEvidence: ["ECE degree title only; résumé is all web development"],
      },
    };
    const { resumeId } = await ingestResumeUpload(alice, pdf());
    await runResumeAnalysis(alice, resumeId, { parse: fakeParse(uncertain) });

    const [row] = await db
      .select()
      .from(resumeAnalyses)
      .where(eq(resumeAnalyses.resumeId, resumeId));
    expect(row!.aiBranchUncertain).toBe(true);
    expect(row!.aiBranchConfidence).toBe(30);

    const v = await getResumeView(alice);
    expect(v.analysis?.detected.branchUncertain).toBe(true);
  });

  test("job-readiness level + evidence persist and surface", async () => {
    const { resumeId } = await ingestResumeUpload(alice, pdf());
    await runResumeAnalysis(alice, resumeId, { parse: fakeParse(FAKE_ANALYSIS) });

    const [row] = await db
      .select()
      .from(resumeAnalyses)
      .where(eq(resumeAnalyses.resumeId, resumeId));
    expect(row!.readinessLevel).toBe("approaching");

    const v = await getResumeView(alice);
    expect(v.analysis?.readiness.level).toBe("approaching");
    expect(v.analysis?.readiness.evidence.length).toBeGreaterThan(0);
    expect(v.analysis?.readiness.rationale).toBeTruthy();
  });

  test("skill categories, strengths, weaknesses, missing skills, interests all surface", async () => {
    const { resumeId } = await ingestResumeUpload(alice, pdf());
    await runResumeAnalysis(alice, resumeId, { parse: fakeParse(FAKE_ANALYSIS) });
    const a = (await getResumeView(alice)).analysis!;

    expect(a.skillCategories.programmingLanguages).toContain("Verilog");
    expect(a.skillCategories.devopsTools).toContain("Git");
    expect(a.strengths.length).toBeGreaterThan(0);
    expect(a.weaknesses.length).toBeGreaterThan(0);
    expect(a.missingSkills.length).toBeGreaterThan(0);
    expect(a.careerInterests.length).toBeGreaterThan(0);
    expect(a.softSkills).toContain("Teamwork");
    expect(a.recommendedRoles[0]?.title).toBe("Embedded Systems Engineer"); // catalog title
  });

  test("evidenceStrength stored per skill; résumé skills stay off the verified axis", async () => {
    const { resumeId } = await ingestResumeUpload(alice, pdf());
    await runResumeAnalysis(alice, resumeId, { parse: fakeParse(FAKE_ANALYSIS) });
    const [analysis] = await db
      .select()
      .from(resumeAnalyses)
      .where(eq(resumeAnalyses.resumeId, resumeId));
    const rows = await db
      .select()
      .from(resumeSkills)
      .where(eq(resumeSkills.analysisId, analysis!.id));

    for (const s of rows) {
      expect(["claimed", "supported_by_resume"]).toContain(s.evidenceType);
      expect(["demonstrated", "project_backed", "work_backed", "mentioned", "inferred"]).toContain(
        s.evidenceStrength,
      );
    }
    const verilog = rows.find((s) => s.skillNameRaw === "Verilog")!;
    expect(verilog.evidenceStrength).toBe("demonstrated");
    expect(verilog.evidenceType).toBe("supported_by_resume");
    const python = rows.find((s) => s.skillNameRaw === "Python")!;
    expect(python.evidenceStrength).toBe("mentioned");
    expect(python.evidenceType).toBe("claimed");
  });
});

describe("Phase 5 — Anthropic error mapping (no real API call)", () => {
  test("timeout / rate-limit / auth / generic map to typed, user-safe errors", () => {
    const timeout = new Anthropic.APIConnectionTimeoutError({ message: "timed out" });
    expect(mapAnthropicError(timeout).code).toBe("timeout");

    const rate = new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers());
    expect(mapAnthropicError(rate).code).toBe("rate_limited");

    const auth401 = new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers());
    const mappedAuth = mapAnthropicError(auth401);
    expect(mappedAuth.code).toBe("not_configured");
    // The mapped message must never echo provider detail.
    expect(mappedAuth.userMessage).not.toMatch(/key|401|auth/i);

    const conn = new Anthropic.APIConnectionError({ message: "socket hang up" });
    expect(mapAnthropicError(conn).code).toBe("provider_error");

    expect(mapAnthropicError(new Error("boom")).code).toBe("provider_error");
    const passthrough = new ResumeAIError("empty_text", "no text");
    expect(mapAnthropicError(passthrough)).toBe(passthrough);
  });

  test("a fabricated / partial AI object never passes the Zod re-check", () => {
    // Missing jobReadiness, skillCategories, etc.
    const partial = { candidateName: "x", summary: "y" };
    expect(ResumeAnalysisSchema.safeParse(partial).success).toBe(false);
  });
});
