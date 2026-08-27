/**
 * Phase 5 real end-to-end test. Runs the FULL pipeline against the REAL
 * Anthropic API — no stubbed AI. Requires ANTHROPIC_API_KEY in .env.
 *
 *   bun scripts/resume-live-e2e.ts
 *
 * Prints only SAFE diagnostics (never the résumé text, the analysis body, or
 * any secret). Exits non-zero on failure.
 */
import { eq } from "drizzle-orm";

import { db } from "../src/lib/db/client";
import { user } from "../src/lib/db/auth-schema";
import { resumes, resumeAnalyses, resumeSkills, resumeCareerSignals } from "../src/lib/db/schema";
import { ingestResumeUpload, runResumeAnalysis, getResumeView } from "../src/lib/resume.server";
import { makePdf } from "../tests/resume-fixtures";

const SAMPLE_RESUME = `ANANYA SHARMA
B.Tech, Computer Science & Engineering — PES University, Bengaluru — Expected 2026 — CGPA 8.7
Relevant coursework: Data Structures, Operating Systems, DBMS, Computer Networks, Machine Learning, Distributed Systems

SKILLS
Languages: Python, JavaScript, TypeScript, Java, SQL, C++
Frameworks/Libraries: React, Next.js, Node.js, Express, FastAPI, pandas, scikit-learn, PyTorch
Databases: PostgreSQL, MongoDB, Redis
Cloud/DevOps: AWS (EC2, S3, Lambda), Docker, GitHub Actions, Terraform, Kubernetes (basics)
Tools: Git, Linux, Postman, Grafana

EXPERIENCE
Software Engineering Intern — Zomato (Jun 2025 – Aug 2025)
- Built a rate-limiting service in Go and Redis handling ~12k req/s; cut p99 latency 34%.
- Added CI checks with GitHub Actions; wrote integration tests (coverage 68% -> 85%).

Open Source Contributor — Apache Airflow (2024 – present)
- Merged 4 PRs fixing scheduler race conditions; wrote unit tests for each.

PROJECTS
DriftDetect — ML model-monitoring dashboard (Python, FastAPI, PyTorch, React, PostgreSQL, Docker)
- Detects feature drift with KS-test + population stability index; deployed on AWS ECS.
StudyGraph — collaborative notes app (Next.js, tRPC, PostgreSQL, WebSockets) used by 300+ students.
PacketPeek — TCP/IP packet analyzer in C++ with a Qt UI (course project).

CERTIFICATIONS
AWS Certified Cloud Practitioner (2024)

ACHIEVEMENTS
- Winner, Smart India Hackathon 2024 (team of 6).
- 2nd place, university ACM-ICPC regional.

LEADERSHIP
- Coordinator, PESU Open-Source Club (organised 3 workshops, 120+ attendees).`;

function safe(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 80) : JSON.stringify(v);
}

async function main() {
  if (!process.env["ANTHROPIC_API_KEY"] && !process.env["ANTHROPIC_AUTH_TOKEN"]) {
    console.error("FAIL: no ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN in the environment");
    process.exit(2);
  }

  // 1. a real test user
  const email = `live-e2e-${Date.now()}@example.com`;
  const userId = crypto.randomUUID();
  await db.insert(user).values({ id: userId, name: "Ananya Sharma", email, emailVerified: false });
  console.log("1. user created");

  // 2. PDF upload → validate + scan + store + extract text
  const file = new File([makePdf(SAMPLE_RESUME)], "ananya_sharma_resume.pdf", {
    type: "application/pdf",
  });
  const { resumeId } = await ingestResumeUpload(userId, file);
  const [afterIngest] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
  console.log(
    `2. upload + extraction: status=${afterIngest!.status} textChars=${afterIngest!.textCharCount}`,
  );
  if (afterIngest!.status !== "processing")
    throw new Error("expected status 'processing' after ingest");

  // 3. REAL Anthropic analysis (no deps → realParse)
  const t0 = Date.now();
  await runResumeAnalysis(userId, resumeId);
  console.log(`3. AI analysis completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // 4. schema validation + persistence
  const [row] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
  const [analysis] = await db
    .select()
    .from(resumeAnalyses)
    .where(eq(resumeAnalyses.resumeId, resumeId));
  const skillRows = await db
    .select()
    .from(resumeSkills)
    .where(eq(resumeSkills.analysisId, analysis!.id));
  const signalRows = await db
    .select()
    .from(resumeCareerSignals)
    .where(eq(resumeCareerSignals.analysisId, analysis!.id));

  if (row!.status !== "complete")
    throw new Error(`expected status 'complete', got '${row!.status}'`);
  if (!analysis) throw new Error("no resume_analyses row persisted");
  if (analysis.userId !== userId) throw new Error("analysis not scoped to the uploading user");

  console.log("4. persisted:");
  console.log(`   model                = ${row!.analysisModel}`);
  console.log(`   prompt version       = ${analysis.promptVersion}`);
  console.log(
    `   detected branch      = ${safe(analysis.aiBranchSlug)} (${analysis.aiBranchConfidence}% conf, uncertain=${analysis.aiBranchUncertain})`,
  );
  console.log(
    `   experience level     = ${analysis.aiExperienceLevel} (${analysis.aiExperienceConfidence}%)`,
  );
  console.log(`   readiness level      = ${analysis.readinessLevel}`);
  console.log(`   skills persisted     = ${skillRows.length}`);
  console.log(`   career signals       = ${signalRows.length}`);
  const payload = analysis.payload as {
    strengths?: string[];
    weaknesses?: string[];
    missingSkills?: string[];
    jobReadiness?: { rationale?: string };
  };
  const strengths = (payload.strengths ?? []).length;
  const weaknesses = (payload.weaknesses ?? []).length;
  const missing = (payload.missingSkills ?? []).length;
  console.log(`   strengths/weak/missing = ${strengths}/${weaknesses}/${missing}`);

  // Was the real API actually used? (a stub would have model "fake-model")
  const realModelUsed = (row!.analysisModel ?? "").startsWith("claude");
  const readinessRationale = (payload.jobReadiness?.rationale ?? "").length;
  console.log(
    `   -> real Claude model = ${realModelUsed}; readiness rationale chars = ${readinessRationale}`,
  );
  if (!realModelUsed)
    throw new Error("analysisModel is not a real Claude model — API was not called");

  // Sanity on the actual content (safe excerpts only)
  const evidenceMix = new Set(skillRows.map((s) => s.evidenceStrength));
  console.log(`   evidence strengths seen = ${[...evidenceMix].join(", ")}`);
  const topRoles = signalRows
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => `${safe(r.careerTitleRaw)} ${r.score}%`);
  console.log(`   top recommended roles = ${topRoles.join(" | ")}`);

  // 5. API-shape response (what the frontend loader gets)
  const view = await getResumeView(userId);
  if (!view.analysis) throw new Error("getResumeView returned no analysis");
  console.log("5. getResumeView OK:");
  console.log(
    `   branchLabel=${safe(view.analysis.detected.branchLabel)} readiness=${view.analysis.readiness.label}`,
  );
  console.log(
    `   skillCategories.programmingLanguages = ${view.analysis.skillCategories.programmingLanguages.join(", ")}`,
  );
  console.log(`   strengths[0] = ${safe(view.analysis.strengths[0])}`);
  console.log(
    `   recommendedRoles[0] = ${safe(view.analysis.recommendedRoles[0]?.title)} ${view.analysis.recommendedRoles[0]?.score}%`,
  );

  // 6. cross-user isolation (defense-in-depth check)
  const otherId = crypto.randomUUID();
  await db.insert(user).values({
    id: otherId,
    name: "Other",
    email: `other-${Date.now()}@example.com`,
    emailVerified: false,
  });
  const otherView = await getResumeView(otherId);
  if (otherView.resume !== null) throw new Error("SECURITY: another user can see this résumé");
  let crossBlocked = false;
  try {
    await runResumeAnalysis(otherId, resumeId);
  } catch {
    crossBlocked = true;
  }
  if (!crossBlocked) throw new Error("SECURITY: another user could analyze this résumé");
  console.log("6. cross-user access blocked");

  // cleanup
  await db.delete(user).where(eq(user.id, userId));
  await db.delete(user).where(eq(user.id, otherId));

  console.log("\nPASS — full pipeline works with the real Anthropic API.");
}

main().catch((err) => {
  // Never print the raw error object (could contain request detail). Message only.
  console.error("\nFAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
