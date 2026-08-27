import { and, desc, eq, inArray } from "drizzle-orm";

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
import { ensureSkillsSeeded } from "./db/seed";
import { ensureTaxonomySeeded } from "./db/seed";
import { extractResumeText } from "./text-extraction";
import {
  analyzeResumeText,
  ResumeAIError,
  type ResumeAnalysis,
  type EducationEntryT,
  type ProjectEntryT,
  type ExperienceEntryT,
  type CertificationEntryT,
  type SkillKindT,
} from "./resume-ai.server";
import { validateResumeUpload, ResumeUploadError } from "./resume-upload.server";
import { matchBranchSlug, matchCareerSlug, matchSkillSlug } from "./resume-matching";
import { deleteResumeFile, readResumeFile, saveResumeFile } from "./storage";
import { countSkillMentions } from "./skill-matching";
import { EXPERIENCE_LEVELS } from "./onboarding-catalog";
import { ENGINEERING_BRANCHES } from "./taxonomy-catalog";

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

export type ResumeStatus = "uploaded" | "processing" | "analyzing" | "complete" | "failed";

// --- ingest --------------------------------------------------------------

/**
 * Step 1: validate + malware-scan the upload, store the bytes, extract text,
 * and create the `resumes` row (status `processing`). Replaces any previous
 * resume for this user. Returns the new resume id; call `runResumeAnalysis`
 * next.
 */
export async function ingestResumeUpload(
  userId: string,
  file: File,
): Promise<{ resumeId: string }> {
  const validated = await validateResumeUpload(file); // throws ResumeUploadError

  // Replace the previous resume (cascades to analyses/skills/signals).
  const prior = await db.select().from(resumes).where(eq(resumes.userId, userId));
  for (const p of prior) await deleteResumeFile(p.storageKey);
  await db.delete(resumes).where(eq(resumes.userId, userId));

  const storageKey = await saveResumeFile(userId, validated.kind, validated.bytes);

  let text = "";
  try {
    text = await extractResumeText(validated.safeFileName, validated.mimeType, validated.bytes);
  } catch (err) {
    console.error("[resume] text extraction failed:", (err as Error).message);
  }
  text = stripNulls(text).trim();

  const [row] = await db
    .insert(resumes)
    .values({
      userId,
      fileName: validated.safeFileName,
      storageKey,
      mimeType: validated.mimeType,
      sizeBytes: validated.sizeBytes,
      status: text.length >= 40 ? "processing" : "failed",
      extractedText: text.slice(0, 200_000) || null,
      textCharCount: text.length,
      errorMessage:
        text.length >= 40
          ? null
          : "We couldn't read any text from that file. If it's a scanned PDF, upload a text-based one.",
    })
    .returning();

  return { resumeId: row!.id };
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
  // Clear any prior analysis for this resume (retry path).
  await db.delete(resumeAnalyses).where(eq(resumeAnalyses.resumeId, resumeId));
  await db
    .update(resumes)
    .set({ status: "analyzing", errorMessage: null })
    .where(eq(resumes.id, resumeId));

  let result;
  try {
    result = await analyzeResumeText(text, deps);
  } catch (err) {
    const userMessage =
      err instanceof ResumeAIError ? err.userMessage : "The analysis failed. Please try again.";
    await db
      .update(resumes)
      .set({ status: "failed", errorMessage: userMessage })
      .where(eq(resumes.id, resumeId));
    // Best-effort baseline so the Skills page isn't empty after a failed analysis.
    await writeKeywordSkillBaseline(userId, text);
    throw err;
  }

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
      aiSpecialization: analysis.academic.detectedSpecialization,
      aiSpecializationConfidence: clamp(analysis.academic.detectedSpecializationConfidence),
      aiExperienceLevel: analysis.experienceLevel,
      aiExperienceConfidence: clamp(analysis.experienceLevelConfidence),
      extractedName: analysis.candidateName,
      extractedCollege: analysis.academic.detectedCollege,
      extractedDegree: analysis.academic.detectedDegree,
      extractedGraduationYear: analysis.academic.detectedGraduationYear,
      summary: analysis.summary,
      projectDomains: analysis.projectDomains,
      payload: {
        education: analysis.education,
        projects: analysis.projects,
        internships: analysis.internships,
        workExperience: analysis.workExperience,
        certifications: analysis.certifications,
        achievements: analysis.achievements,
        buckets: {
          programmingLanguages: analysis.programmingLanguages,
          frameworks: analysis.frameworks,
          tools: analysis.tools,
          databases: analysis.databases,
          cloudTechnologies: analysis.cloudTechnologies,
        },
      },
      model,
      promptVersion,
    })
    .returning();

  // Skills + evidence. A resume-derived skill is at most `supported_by_resume`.
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
      kind: s.kind,
      evidenceType:
        s.evidenceType === "supported_by_resume"
          ? ("supported_by_resume" as const)
          : ("claimed" as const),
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
  const careerRows = analysis.potentialCareers.slice(0, 12).map((c) => ({
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

  // Feed matched skills into the shared per-user skill table (source = resume).
  // These are NOT marked verified — only claimed/supported.
  await db
    .delete(userSkills)
    .where(and(eq(userSkills.userId, userId), eq(userSkills.source, "resume")));
  const matched = skillRows.filter((r) => r.skillId);
  if (matched.length > 0) {
    const byId = new Map<string, (typeof matched)[number]>();
    for (const r of matched) if (!byId.has(r.skillId!)) byId.set(r.skillId!, r);
    await db.insert(userSkills).values(
      [...byId.values()].map((r) => ({
        userId,
        skillId: r.skillId!,
        confidence: r.confidence,
        source: "resume" as const,
      })),
    );
  }
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
    await db
      .delete(userSkills)
      .where(and(eq(userSkills.userId, userId), eq(userSkills.source, "resume")));
    if (catalog.length > 0) {
      await db.insert(userSkills).values(
        catalog.map((s) => ({
          userId,
          skillId: s.id,
          confidence: 45,
          source: "resume" as const,
        })),
      );
    }
  } catch {
    /* baseline is best-effort */
  }
}

const clamp = (n: number | null | undefined) =>
  n == null ? 0 : Math.max(0, Math.min(100, Math.round(n)));

// --- reads (all scoped to userId) --------------------------------------

const EXPERIENCE_LABEL = new Map(EXPERIENCE_LEVELS.map((x) => [x.value, x.label]));
const BRANCH_NAME = new Map(ENGINEERING_BRANCHES.map((b) => [b.slug, b.name]));

export type ResumeCard = {
  id: string;
  fileName: string;
  status: ResumeStatus;
  errorMessage: string | null;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: Date;
  analyzedAt: Date | null;
  analysisModel: string | null;
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
    specialization: string | null;
    specializationConfidence: number | null;
    experienceLevel: "student" | "internship" | "junior" | "mid" | "senior" | null;
    experienceLabel: string | null;
    experienceConfidence: number | null;
  };
  projectDomains: string[];
  skills: {
    name: string;
    inCatalog: boolean;
    kind: SkillKindT;
    evidenceType: "claimed" | "supported_by_resume" | "assessed" | "project_verified";
    confidence: number;
    evidence: { kind: string; label: string }[];
  }[];
  careerSignals: {
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

export type ResumeView = {
  resume: ResumeCard | null;
  analysis: ResumeAnalysisView | null;
  discrepancies: Discrepancy[];
};

/** Latest resume + its analysis (if complete) + declared-vs-detected discrepancies. */
export async function getResumeView(userId: string): Promise<ResumeView> {
  const [resume] = await db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.createdAt))
    .limit(1);

  if (!resume) return { resume: null, analysis: null, discrepancies: [] };

  const base: ResumeCard = {
    id: resume.id,
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

  const payload = analysis.payload as AnalysisPayload;

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
          : null,
        branchConfidence: analysis.aiBranchConfidence,
        specialization: analysis.aiSpecialization,
        specializationConfidence: analysis.aiSpecializationConfidence,
        experienceLevel: analysis.aiExperienceLevel,
        experienceLabel: analysis.aiExperienceLevel
          ? (EXPERIENCE_LABEL.get(analysis.aiExperienceLevel) ?? analysis.aiExperienceLevel)
          : null,
        experienceConfidence: analysis.aiExperienceConfidence,
      },
      projectDomains: analysis.projectDomains ?? [],
      skills: skillRows
        .map((s) => ({
          name: s.catalogName ?? s.skillNameRaw,
          inCatalog: Boolean(s.catalogSlug),
          kind: s.kind,
          evidenceType: s.evidenceType,
          confidence: s.confidence,
          evidence: s.evidence ?? [],
        }))
        .sort((a, b) => b.confidence - a.confidence),
      careerSignals: signalRows
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
  education?: EducationEntryT[];
  projects?: ProjectEntryT[];
  internships?: ExperienceEntryT[];
  workExperience?: ExperienceEntryT[];
  certifications?: CertificationEntryT[];
  achievements?: string[];
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

export { ResumeUploadError, ResumeAIError };
