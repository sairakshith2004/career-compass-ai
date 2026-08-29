import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "./db/client";
import { user } from "./db/auth-schema";
import {
  careers,
  engineeringBranches,
  resumeAnalyses,
  resumeCareerSignals,
  resumeSkills,
  resumes,
  skills,
  studentProfiles,
  userSkills,
} from "./db/schema";
import { aiRuns, careerRecommendations } from "./db/career-schema";
import { recordStudentSkill } from "./student-skills.server";
import { levelFromScore, type Level } from "./career-levels";
import { recordActivity } from "./activity.server";
import { ensureSkillsSeeded } from "./db/seed";
import { ensureTaxonomySeeded } from "./db/seed";
import { extractResumeText } from "./text-extraction";
import {
  analyzeResumeText,
  fallbackAnalyzeResumeText,
  isAIConfigured,
  ResumeAIError,
  type ResumeAnalysis,
  type EducationEntryT,
  type ProjectEntryT,
  type ExperienceEntryT,
  type CertificationEntryT,
  type SkillCategoryT,
  type EvidenceStrengthT,
  type JobReadinessLevelT,
} from "./resume-ai.server";
import { validateResumeUpload, ResumeUploadError } from "./resume-upload.server";
import { matchBranchSlug, matchCareerSlug, matchSkillSlug } from "./resume-matching";
import { deleteResumeFile, readResumeFile, saveResumeFile } from "./storage";
import { countSkillMentions } from "./skill-matching";
import { EXPERIENCE_LEVELS } from "./onboarding-catalog";
import { ENGINEERING_BRANCHES } from "./taxonomy-catalog";

/**
 * Structured lifecycle logging for the resume pipeline. Emits a single JSON-ish
 * line per event with SAFE metadata only — never the résumé text, the analysis
 * content, a filename's full path, or any secret.
 */
function resumeLog(
  event:
    | "upload_started"
    | "upload_completed"
    | "extraction_started"
    | "extraction_failed"
    | "analysis_started"
    | "analysis_completed"
    | "analysis_failed"
    | "analysis_fallback"
    | "resume_deleted",
  meta: Record<string, string | number | boolean | null | undefined>,
) {
  const level = event.endsWith("_failed") ? "error" : "info";
  console[level](`[resume] ${event}`, meta);
}

/** Remove NUL and other C0 control chars that some PDF extractors emit. */
function stripNulls(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 9 || c === 10 || c === 13 || c >= 0x20) out += ch;
  }
  return out;
}

/**
 * Resume-intelligence orchestration. Every function takes an explicit `userId`
 * and scopes every read and write to it. The RPC wrappers (resume-fns.ts)
 * obtain `userId` only from the verified session.
 *
 * `.server.ts` — server-only.
 */

export type ResumeStatus =
  "uploaded" | "extracting_text" | "processing" | "analyzing" | "complete" | "failed";

// --- ingest --------------------------------------------------------------

const IMAGE_ONLY_PDF_MESSAGE =
  "We couldn't read any text from that file. It looks like a scanned or image-only PDF — " +
  "upload a text-based export instead.";

/**
 * Step 1: validate + malware-scan the upload, store the bytes, extract text,
 * and create a NEW `resumes` row as the next version for this user (status
 * `processing`, or `failed` if no text could be extracted). Previous versions,
 * their files and their analyses are left intact. Returns the new resume id +
 * version; call `runResumeAnalysis` next.
 */
export async function ingestResumeUpload(
  userId: string,
  file: File,
): Promise<{ resumeId: string; version: number }> {
  resumeLog("upload_started", { userId, declaredType: file.type || "unknown", size: file.size });
  const validated = await validateResumeUpload(file); // throws ResumeUploadError

  const storageKey = await saveResumeFile(userId, validated.kind, validated.bytes);

  resumeLog("extraction_started", { userId, kind: validated.kind });
  let text = "";
  let extractionFailed = false;
  try {
    text = await extractResumeText(validated.safeFileName, validated.mimeType, validated.bytes);
  } catch (err) {
    extractionFailed = true;
    resumeLog("extraction_failed", { userId, reason: (err as Error).message.slice(0, 200) });
  }
  text = stripNulls(text).trim();
  const hasText = text.length >= 40;
  if (!hasText && !extractionFailed) {
    resumeLog("extraction_failed", { userId, reason: "no_text_extracted" });
  }

  // Next version for this user. The `unique(user_id, version)` index makes a
  // concurrent double-upload race safe — the loser retries with a fresh number.
  let row: typeof resumes.$inferSelect | undefined;
  for (let attempt = 0; attempt < 5 && !row; attempt++) {
    const [{ max } = { max: 0 }] = await db
      .select({ max: sql<number>`coalesce(max(${resumes.version}), 0)` })
      .from(resumes)
      .where(eq(resumes.userId, userId));
    try {
      [row] = await db
        .insert(resumes)
        .values({
          userId,
          version: Number(max) + 1,
          fileName: validated.safeFileName,
          storageKey,
          mimeType: validated.mimeType,
          sizeBytes: validated.sizeBytes,
          status: hasText ? "processing" : "failed",
          extractedText: text.slice(0, 200_000) || null,
          textCharCount: text.length,
          errorMessage: hasText
            ? null
            : validated.kind === "pdf"
              ? IMAGE_ONLY_PDF_MESSAGE
              : "We couldn't read any text from that file.",
        })
        .returning();
    } catch (err) {
      if (attempt === 4) throw err; // give up after 5 tries
    }
  }

  resumeLog("upload_completed", {
    userId,
    resumeId: row!.id,
    version: row!.version,
    textChars: text.length,
    status: row!.status,
  });
  return { resumeId: row!.id, version: row!.version };
}

// --- analyze ----------------------------------------------------------------

type AnalyzeOverrides = Parameters<typeof analyzeResumeText>[1];

/**
 * Step 2: run the AI analysis for a resume the caller owns and persist the
 * structured result. Safe to call again to retry (clears the previous analysis
 * first). Throws `ResumeAIError` on failure — the row is left at status
 * `failed` with a user-safe `errorMessage`.
 */
export async function runResumeAnalysis(
  userId: string,
  resumeId: string,
  deps: AnalyzeOverrides = {},
): Promise<{ status: "complete" }> {
  const [resume] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    .limit(1);
  if (!resume) throw new Error("Resume not found");

  const text = (resume.extractedText ?? "").trim();
  if (text.length < 40) {
    await db
      .update(resumes)
      .set({
        status: "failed",
        errorMessage: "There's no readable text in this resume to analyze.",
      })
      .where(eq(resumes.id, resumeId));
    throw new ResumeAIError("empty_text", "There's no readable text in this resume to analyze.");
  }

  await Promise.all([ensureSkillsSeeded(), ensureTaxonomySeeded()]);

  const [claimed] = await db
    .update(resumes)
    .set({ status: "analyzing", errorMessage: null, updatedAt: new Date() })
    .where(
      and(eq(resumes.id, resumeId), eq(resumes.userId, userId), ne(resumes.status, "analyzing")),
    )
    .returning({ id: resumes.id });
  if (!claimed) {
    throw new ResumeAIError(
      "provider_error",
      "This résumé is already being analyzed. Please wait a moment and try again.",
    );
  }

  // Clear any prior analysis for THIS resume version only (retry path). Other
  // versions' analyses are untouched.
  await db.delete(resumeAnalyses).where(eq(resumeAnalyses.resumeId, resumeId));

  resumeLog("analysis_started", {
    userId,
    resumeId,
    version: resume.version,
    textChars: text.length,
  });
  const startedAt = Date.now();

  let result;
  try {
    // Use injected parse (tests) or AI if configured; fall back to keyword detection.
    if (deps.parse || isAIConfigured()) {
      result = await analyzeResumeText(text, deps);
    } else {
      resumeLog("analysis_fallback", {
        userId,
        resumeId,
        reason: "no_ai_key",
        textChars: text.length,
      });
      result = fallbackAnalyzeResumeText(text);
    }
  } catch (err) {
    const code = err instanceof ResumeAIError ? err.code : "unknown";
    const userMessage =
      err instanceof ResumeAIError ? err.userMessage : "The analysis failed. Please try again.";
    await db
      .update(resumes)
      .set({ status: "failed", errorMessage: userMessage })
      .where(eq(resumes.id, resumeId));
    // Best-effort baseline so the Skills page isn't empty after a failed analysis.
    await writeKeywordSkillBaseline(userId, text);
    resumeLog("analysis_failed", { userId, resumeId, code, durationMs: Date.now() - startedAt });
    throw err;
  }

  try {
    await persistAnalysis(userId, resume.id, result.analysis, result.model, result.promptVersion);
    await db
      .update(resumes)
      .set({
        status: "complete",
        analysisModel: result.model,
        analyzedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(resumes.id, resumeId));
  } catch (err) {
    await db
      .update(resumes)
      .set({
        status: "failed",
        errorMessage: "The analysis could not be saved. Please try again.",
      })
      .where(eq(resumes.id, resumeId));
    resumeLog("analysis_failed", {
      userId,
      resumeId,
      code: "persistence",
      durationMs: Date.now() - startedAt,
    });
    throw new ResumeAIError(
      "provider_error",
      "The analysis could not be saved. Please try again.",
      err,
    );
  }
  resumeLog("analysis_completed", {
    userId,
    resumeId,
    version: resume.version,
    model: result.model,
    durationMs: Date.now() - startedAt,
  });

  return { status: "complete" };
}

async function persistAnalysis(
  userId: string,
  resumeId: string,
  analysis: ResumeAnalysis,
  model: string,
  promptVersion: string,
) {
  const branchSlug = analysis.academic.detectedBranch
    ? matchBranchSlug(analysis.academic.detectedBranch)
    : null;

  const [analysisRow] = await db
    .insert(resumeAnalyses)
    .values({
      resumeId,
      userId,
      aiBranchSlug: branchSlug,
      aiBranchConfidence: clamp(analysis.academic.detectedBranchConfidence),
      aiBranchUncertain: analysis.academic.detectedBranchUncertain,
      aiSpecialization: analysis.academic.detectedSpecialization,
      aiSpecializationConfidence: clamp(analysis.academic.detectedSpecializationConfidence),
      aiExperienceLevel: analysis.experienceLevel,
      aiExperienceConfidence: clamp(analysis.experienceLevelConfidence),
      readinessLevel: analysis.jobReadiness.level,
      extractedName: analysis.candidateName,
      extractedCollege: analysis.academic.detectedCollege,
      extractedDegree: analysis.academic.detectedDegree,
      extractedGraduationYear: analysis.academic.detectedGraduationYear,
      summary: analysis.summary,
      projectDomains: analysis.projectDomains,
      payload: {
        branchEvidence: analysis.academic.branchEvidence,
        detectedBranchRaw: analysis.academic.detectedBranch,
        education: analysis.education,
        projects: analysis.projects,
        internships: analysis.internships,
        workExperience: analysis.workExperience,
        certifications: analysis.certifications,
        achievements: analysis.achievements,
        skillCategories: analysis.skillCategories,
        softSkills: analysis.softSkills,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
        missingSkills: analysis.missingSkills,
        careerInterests: analysis.careerInterests,
        jobReadiness: analysis.jobReadiness,
      } satisfies AnalysisPayload,
      model,
      promptVersion,
    })
    .returning();

  // Skills + evidence. A resume-derived skill is at most `supported_by_resume`
  // on the coarse "verified?" axis; the finer AI tier is kept in evidenceStrength.
  const seen = new Set<string>();
  const skillRows = analysis.skills
    .filter((s) => {
      const key = s.name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((s) => ({
      analysisId: analysisRow!.id,
      userId,
      skillId: null as string | null,
      skillNameRaw: s.name.trim().slice(0, 120),
      kind: s.category,
      evidenceStrength: s.evidenceStrength,
      evidenceType: coarseEvidence(s.evidenceStrength),
      confidence: clamp(s.confidence),
      evidence: s.evidence.map((e) => ({ kind: e.kind, label: e.label.slice(0, 160) })),
    }));

  // Resolve catalog skill ids.
  const slugByRaw = new Map<string, string>();
  for (const r of skillRows) {
    const slug = matchSkillSlug(r.skillNameRaw);
    if (slug) slugByRaw.set(r.skillNameRaw, slug);
  }
  if (slugByRaw.size > 0) {
    const catalog = await db
      .select({ id: skills.id, slug: skills.slug })
      .from(skills)
      .where(inArray(skills.slug, [...new Set(slugByRaw.values())]));
    const idBySlug = new Map(catalog.map((c) => [c.slug, c.id]));
    for (const r of skillRows) {
      const slug = slugByRaw.get(r.skillNameRaw);
      if (slug) r.skillId = idBySlug.get(slug) ?? null;
    }
  }

  if (skillRows.length > 0) {
    await db.insert(resumeSkills).values(skillRows).onConflictDoNothing();
  }

  // Career signals.
  const careerRows = analysis.recommendedJobRoles.slice(0, 12).map((c) => ({
    analysisId: analysisRow!.id,
    userId,
    careerId: null as string | null,
    careerTitleRaw: c.title.trim().slice(0, 120),
    score: clamp(c.score),
    rationale: c.rationale.slice(0, 600),
  }));
  const careerSlugByRaw = new Map<string, string>();
  for (const r of careerRows) {
    const slug = matchCareerSlug(r.careerTitleRaw);
    if (slug) careerSlugByRaw.set(r.careerTitleRaw, slug);
  }
  if (careerSlugByRaw.size > 0) {
    const catalog = await db
      .select({ id: careers.id, slug: careers.slug })
      .from(careers)
      .where(inArray(careers.slug, [...new Set(careerSlugByRaw.values())]));
    const idBySlug = new Map(catalog.map((c) => [c.slug, c.id]));
    for (const r of careerRows) {
      const slug = careerSlugByRaw.get(r.careerTitleRaw);
      if (slug) r.careerId = idBySlug.get(slug) ?? null;
    }
  }
  if (careerRows.length > 0) {
    await db.insert(resumeCareerSignals).values(careerRows);
  }

  // Feed matched skills into the shared per-user skill table via the
  // student-skills service (source = resume). These are AI-inferred from résumé
  // text — NEVER marked verified, only claimed / current. Level changes are
  // recorded to user_skill_history by the service.
  const matched = skillRows.filter((r) => r.skillId);
  const byId = new Map<string, (typeof matched)[number]>();
  for (const r of matched) if (!byId.has(r.skillId!)) byId.set(r.skillId!, r);
  for (const r of byId.values()) {
    await recordStudentSkill(userId, {
      skillId: r.skillId!,
      level: levelFromResumeSignal(r.confidence, r.evidenceStrength),
      source: "resume",
      score: r.confidence,
      reason: "Inferred from résumé analysis",
      evidence: r.evidence,
    });
  }

  // Persist AI career recommendations (distinct from the raw resumeCareerSignals
  // rows — these are the deduped, user-scoped recommendation records).
  for (const c of careerRows) {
    await db
      .insert(careerRecommendations)
      .values({
        userId,
        careerId: c.careerId,
        careerTitleRaw: c.careerTitleRaw,
        score: c.score,
        rationale: c.rationale,
        source: "resume_analysis",
        resumeAnalysisId: analysisRow!.id,
      })
      .onConflictDoUpdate({
        target: [
          careerRecommendations.userId,
          careerRecommendations.careerTitleRaw,
          careerRecommendations.source,
        ],
        set: {
          careerId: c.careerId,
          score: c.score,
          rationale: c.rationale,
          resumeAnalysisId: analysisRow!.id,
          dismissedAt: null,
          updatedAt: new Date(),
        },
      });
  }

  // Audit the AI run.
  await db.insert(aiRuns).values({
    userId,
    kind: "resume_analysis",
    model,
    promptVersion,
    status: "ok",
    entityType: "resume_analysis",
    entityId: analysisRow!.id,
  });

  await recordActivity(userId, "resume_analyzed", {
    entityType: "resume_analysis",
    entityId: analysisRow!.id,
    metadata: { skills: byId.size, recommendations: careerRows.length },
  });
}

/** Map a résumé skill's confidence + evidence strength to a skill level. */
function levelFromResumeSignal(
  confidence: number,
  strength: EvidenceStrengthT | null | undefined,
): Level {
  const bump =
    strength === "work_backed"
      ? 20
      : strength === "project_backed"
        ? 12
        : strength === "demonstrated"
          ? 6
          : 0;
  return levelFromScore(Math.min(100, confidence + bump));
}

async function writeKeywordSkillBaseline(userId: string, text: string) {
  try {
    await ensureSkillsSeeded();
    const mentions = countSkillMentions(text);
    if (mentions.size === 0) return;
    const catalog = await db
      .select({ id: skills.id, slug: skills.slug })
      .from(skills)
      .where(inArray(skills.slug, [...mentions.keys()]));
    if (catalog.length > 0) {
      await db
        .insert(userSkills)
        .values(
          catalog.map((s) => ({
            userId,
            skillId: s.id,
            confidence: 45,
            source: "resume" as const,
          })),
        )
        .onConflictDoNothing();
    }
  } catch {
    /* baseline is best-effort */
  }
}

const clamp = (n: number | null | undefined) =>
  n == null ? 0 : Math.max(0, Math.min(100, Math.round(n)));

/** Collapse the AI's 5-tier evidence strength onto the DB's "verified?" axis.
 * Résumé text can never produce `assessed` / `project_verified`. */
function coarseEvidence(s: EvidenceStrengthT): "claimed" | "supported_by_resume" {
  return s === "demonstrated" || s === "project_backed" || s === "work_backed"
    ? "supported_by_resume"
    : "claimed";
}

// --- reads (all scoped to userId) --------------------------------------

const EXPERIENCE_LABEL = new Map(EXPERIENCE_LEVELS.map((x) => [x.value, x.label]));
const BRANCH_NAME = new Map(ENGINEERING_BRANCHES.map((b) => [b.slug, b.name]));

export type ResumeCard = {
  id: string;
  version: number;
  isActive: boolean;
  fileName: string;
  status: ResumeStatus;
  errorMessage: string | null;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: Date;
  analyzedAt: Date | null;
  analysisModel: string | null;
};

export type ReadinessView = {
  level: JobReadinessLevelT | null;
  label: string | null;
  rationale: string | null;
  evidence: string[];
};

export type SkillCategoriesView = {
  programmingLanguages: string[];
  frameworks: string[];
  libraries: string[];
  databases: string[];
  cloudTechnologies: string[];
  devopsTools: string[];
  aiMlSkills: string[];
  cybersecuritySkills: string[];
  softwareEngineeringSkills: string[];
  tools: string[];
};

export type ResumeAnalysisView = {
  summary: string | null;
  detected: {
    name: string | null;
    degree: string | null;
    college: string | null;
    graduationYear: number | null;
    branchSlug: string | null;
    branchName: string | null;
    branchLabel: string | null;
    branchConfidence: number | null;
    branchUncertain: boolean;
    branchEvidence: string[];
    specialization: string | null;
    specializationConfidence: number | null;
    experienceLevel: "student" | "internship" | "junior" | "mid" | "senior" | null;
    experienceLabel: string | null;
    experienceConfidence: number | null;
  };
  readiness: ReadinessView;
  projectDomains: string[];
  skills: {
    name: string;
    inCatalog: boolean;
    kind: SkillCategoryT;
    evidenceType: "claimed" | "supported_by_resume" | "assessed" | "project_verified";
    evidenceStrength: EvidenceStrengthT | null;
    confidence: number;
    evidence: { kind: string; label: string }[];
  }[];
  skillCategories: SkillCategoriesView;
  softSkills: string[];
  strengths: string[];
  weaknesses: string[];
  missingSkills: string[];
  careerInterests: string[];
  recommendedRoles: {
    title: string;
    slug: string | null;
    score: number;
    rationale: string | null;
  }[];
  education: EducationEntryT[];
  projects: ProjectEntryT[];
  internships: ExperienceEntryT[];
  workExperience: ExperienceEntryT[];
  certifications: CertificationEntryT[];
  achievements: string[];
};

const READINESS_LABEL: Record<JobReadinessLevelT, string> = {
  early: "Early — building foundations",
  developing: "Developing — some project work",
  approaching: "Approaching — strong projects + experience",
  job_ready: "Job-ready — clear role fit",
};

const EMPTY_SKILL_CATEGORIES: SkillCategoriesView = {
  programmingLanguages: [],
  frameworks: [],
  libraries: [],
  databases: [],
  cloudTechnologies: [],
  devopsTools: [],
  aiMlSkills: [],
  cybersecuritySkills: [],
  softwareEngineeringSkills: [],
  tools: [],
};

export type ResumeView = {
  resume: ResumeCard | null;
  analysis: ResumeAnalysisView | null;
  discrepancies: Discrepancy[];
};

/** Highest version number for this user (0 if they have no résumé yet). */
async function activeVersion(userId: string): Promise<number> {
  const [{ max } = { max: 0 }] = await db
    .select({ max: sql<number>`coalesce(max(${resumes.version}), 0)` })
    .from(resumes)
    .where(eq(resumes.userId, userId));
  return Number(max);
}

/**
 * A résumé version + its analysis (if complete) + declared-vs-detected
 * discrepancies. With no `resumeId` this returns the ACTIVE version (highest
 * version number). `resumeId` is always owner-scoped — a foreign id yields the
 * empty view, never another user's data.
 */
export async function getResumeView(userId: string, resumeId?: string): Promise<ResumeView> {
  const [resume] = resumeId
    ? await db
        .select()
        .from(resumes)
        .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
        .limit(1)
    : await db
        .select()
        .from(resumes)
        .where(eq(resumes.userId, userId))
        .orderBy(desc(resumes.version))
        .limit(1);

  if (!resume) return { resume: null, analysis: null, discrepancies: [] };

  const maxVersion = await activeVersion(userId);
  const base: ResumeCard = {
    id: resume.id,
    version: resume.version,
    isActive: resume.version === maxVersion,
    fileName: resume.fileName,
    status: resume.status as ResumeStatus,
    errorMessage: resume.errorMessage,
    sizeBytes: resume.sizeBytes,
    mimeType: resume.mimeType,
    uploadedAt: resume.createdAt,
    analyzedAt: resume.analyzedAt,
    analysisModel: resume.analysisModel,
  };

  if (resume.status !== "complete") {
    return { resume: base, analysis: null, discrepancies: [] };
  }

  const [analysis] = await db
    .select()
    .from(resumeAnalyses)
    .where(eq(resumeAnalyses.resumeId, resume.id))
    .orderBy(desc(resumeAnalyses.createdAt))
    .limit(1);

  if (!analysis) {
    return { resume: base, analysis: null, discrepancies: [] };
  }

  const [skillRows, signalRows] = await Promise.all([
    db
      .select({
        skillNameRaw: resumeSkills.skillNameRaw,
        kind: resumeSkills.kind,
        evidenceType: resumeSkills.evidenceType,
        evidenceStrength: resumeSkills.evidenceStrength,
        confidence: resumeSkills.confidence,
        evidence: resumeSkills.evidence,
        catalogName: skills.name,
        catalogSlug: skills.slug,
      })
      .from(resumeSkills)
      .leftJoin(skills, eq(skills.id, resumeSkills.skillId))
      .where(eq(resumeSkills.analysisId, analysis.id)),
    db
      .select({
        careerTitleRaw: resumeCareerSignals.careerTitleRaw,
        score: resumeCareerSignals.score,
        rationale: resumeCareerSignals.rationale,
        catalogTitle: careers.name,
        catalogSlug: careers.slug,
      })
      .from(resumeCareerSignals)
      .leftJoin(careers, eq(careers.id, resumeCareerSignals.careerId))
      .where(eq(resumeCareerSignals.analysisId, analysis.id)),
  ]);

  const payload = (analysis.payload ?? {}) as AnalysisPayload;
  const readinessLevel = analysis.readinessLevel;

  return {
    resume: base,
    analysis: {
      summary: analysis.summary,
      detected: {
        name: analysis.extractedName,
        degree: analysis.extractedDegree,
        college: analysis.extractedCollege,
        graduationYear: analysis.extractedGraduationYear,
        branchSlug: analysis.aiBranchSlug,
        branchName: analysis.aiBranchSlug ? (BRANCH_NAME.get(analysis.aiBranchSlug) ?? null) : null,
        branchLabel: analysis.aiBranchSlug
          ? (BRANCH_NAME.get(analysis.aiBranchSlug) ?? analysis.aiBranchSlug)
          : (payload.detectedBranchRaw ?? null),
        branchConfidence: analysis.aiBranchConfidence,
        branchUncertain: Boolean(analysis.aiBranchUncertain),
        branchEvidence: payload.branchEvidence ?? [],
        specialization: analysis.aiSpecialization,
        specializationConfidence: analysis.aiSpecializationConfidence,
        experienceLevel: analysis.aiExperienceLevel,
        experienceLabel: analysis.aiExperienceLevel
          ? (EXPERIENCE_LABEL.get(analysis.aiExperienceLevel) ?? analysis.aiExperienceLevel)
          : null,
        experienceConfidence: analysis.aiExperienceConfidence,
      },
      readiness: {
        level: readinessLevel,
        label: readinessLevel ? READINESS_LABEL[readinessLevel] : null,
        rationale: payload.jobReadiness?.rationale ?? null,
        evidence: payload.jobReadiness?.evidence ?? [],
      },
      projectDomains: analysis.projectDomains ?? [],
      skills: skillRows
        .map((s) => ({
          name: s.catalogName ?? s.skillNameRaw,
          inCatalog: Boolean(s.catalogSlug),
          kind: s.kind,
          evidenceType: s.evidenceType,
          evidenceStrength: s.evidenceStrength,
          confidence: s.confidence,
          evidence: s.evidence ?? [],
        }))
        .sort((a, b) => b.confidence - a.confidence),
      skillCategories: { ...EMPTY_SKILL_CATEGORIES, ...(payload.skillCategories ?? {}) },
      softSkills: payload.softSkills ?? [],
      strengths: payload.strengths ?? [],
      weaknesses: payload.weaknesses ?? [],
      missingSkills: payload.missingSkills ?? [],
      careerInterests: payload.careerInterests ?? [],
      recommendedRoles: signalRows
        .map((c) => ({
          title: c.catalogTitle ?? c.careerTitleRaw,
          slug: c.catalogSlug,
          score: c.score,
          rationale: c.rationale,
        }))
        .sort((a, b) => b.score - a.score),
      education: payload.education ?? [],
      projects: payload.projects ?? [],
      internships: payload.internships ?? [],
      workExperience: payload.workExperience ?? [],
      certifications: payload.certifications ?? [],
      achievements: payload.achievements ?? [],
    },
    discrepancies: await computeDiscrepancies(userId, analysis),
  };
}

type AnalysisPayload = {
  branchEvidence?: string[];
  detectedBranchRaw?: string | null;
  education?: EducationEntryT[];
  projects?: ProjectEntryT[];
  internships?: ExperienceEntryT[];
  workExperience?: ExperienceEntryT[];
  certifications?: CertificationEntryT[];
  achievements?: string[];
  skillCategories?: Partial<SkillCategoriesView>;
  softSkills?: string[];
  strengths?: string[];
  weaknesses?: string[];
  missingSkills?: string[];
  careerInterests?: string[];
  jobReadiness?: { level: JobReadinessLevelT; rationale: string; evidence: string[] };
};

export type Discrepancy = {
  field: "branch" | "specialization" | "graduationYear" | "experienceLevel";
  label: string;
  declared: string | null;
  detected: string | null;
  detectedConfidence: number | null;
};

async function computeDiscrepancies(
  userId: string,
  analysis: typeof resumeAnalyses.$inferSelect,
): Promise<Discrepancy[]> {
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  if (!profile) return [];

  const out: Discrepancy[] = [];

  // Branch: compare declared branchId's slug against the AI's matched slug.
  let declaredBranchSlug: string | null = null;
  if (profile.branchId) {
    const [b] = await db
      .select({ slug: engineeringBranches.slug })
      .from(engineeringBranches)
      .where(eq(engineeringBranches.id, profile.branchId))
      .limit(1);
    declaredBranchSlug = b?.slug ?? null;
  }
  if (
    declaredBranchSlug &&
    analysis.aiBranchSlug &&
    declaredBranchSlug !== analysis.aiBranchSlug &&
    (analysis.aiBranchConfidence ?? 0) >= 55
  ) {
    out.push({
      field: "branch",
      label: "Engineering branch",
      declared: BRANCH_NAME.get(declaredBranchSlug) ?? declaredBranchSlug,
      detected: BRANCH_NAME.get(analysis.aiBranchSlug) ?? analysis.aiBranchSlug,
      detectedConfidence: analysis.aiBranchConfidence,
    });
  }

  if (
    profile.experienceLevel &&
    analysis.aiExperienceLevel &&
    profile.experienceLevel !== analysis.aiExperienceLevel &&
    (analysis.aiExperienceConfidence ?? 0) >= 55
  ) {
    out.push({
      field: "experienceLevel",
      label: "Experience level",
      declared: EXPERIENCE_LABEL.get(profile.experienceLevel) ?? profile.experienceLevel,
      detected: EXPERIENCE_LABEL.get(analysis.aiExperienceLevel) ?? analysis.aiExperienceLevel,
      detectedConfidence: analysis.aiExperienceConfidence,
    });
  }

  if (
    profile.graduationYear &&
    analysis.extractedGraduationYear &&
    profile.graduationYear !== analysis.extractedGraduationYear
  ) {
    out.push({
      field: "graduationYear",
      label: "Graduation year",
      declared: String(profile.graduationYear),
      detected: String(analysis.extractedGraduationYear),
      detectedConfidence: null,
    });
  }

  return out;
}

/** Owner-checked file read, for a download route. */
export async function getResumeFileForUser(
  userId: string,
  resumeId: string,
): Promise<{ bytes: Buffer; fileName: string; mimeType: string } | null> {
  const [resume] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    .limit(1);
  if (!resume) return null;
  const bytes = await readResumeFile(resume.storageKey, userId);
  return { bytes, fileName: resume.fileName, mimeType: resume.mimeType };
}

// --- versioning ------------------------------------------------------------

export type ResumeVersionCard = {
  id: string;
  version: number;
  isActive: boolean;
  fileName: string;
  status: ResumeStatus;
  errorMessage: string | null;
  sizeBytes: number;
  hasAnalysis: boolean;
  uploadedAt: Date;
  analyzedAt: Date | null;
};

/** All of a user's résumé versions, newest first. Scoped to `userId`. */
export async function listResumeVersions(userId: string): Promise<ResumeVersionCard[]> {
  const rows = await db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.version));
  if (rows.length === 0) return [];

  const analysed = new Set(
    (
      await db
        .selectDistinct({ resumeId: resumeAnalyses.resumeId })
        .from(resumeAnalyses)
        .where(eq(resumeAnalyses.userId, userId))
    ).map((r) => r.resumeId),
  );
  const maxVersion = rows[0]!.version;

  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    isActive: r.version === maxVersion,
    fileName: r.fileName,
    status: r.status as ResumeStatus,
    errorMessage: r.errorMessage,
    sizeBytes: r.sizeBytes,
    hasAnalysis: analysed.has(r.id),
    uploadedAt: r.createdAt,
    analyzedAt: r.analyzedAt,
  }));
}

/**
 * Delete one résumé version the caller owns: its stored file + the row (which
 * cascades to its analyses / skills / career signals). Other versions are
 * untouched; the next-highest version simply becomes active. Returns `false`
 * when the id isn't the caller's.
 */
export async function deleteResumeVersion(userId: string, resumeId: string): Promise<boolean> {
  const [resume] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    .limit(1);
  if (!resume) return false;

  await deleteResumeFile(resume.storageKey);
  await db.delete(resumes).where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)));
  resumeLog("resume_deleted", { userId, resumeId, version: resume.version });
  return true;
}

export { ResumeUploadError, ResumeAIError };
