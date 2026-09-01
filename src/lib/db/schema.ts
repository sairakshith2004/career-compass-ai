import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";

import { user } from "./auth-schema";

// --- Phase 7: JD Intelligence types ---------------------------------------

export type JDRequirementCategory =
  | "programming_language"
  | "framework"
  | "library"
  | "database"
  | "cloud"
  | "devops"
  | "tool"
  | "concept"
  | "soft_skill"
  | "other";

export type JDRequirementSeverity = "mandatory" | "preferred" | "optional";

export type JDStructuredData = {
  /** AI-extracted job title (may differ from what the user typed). */
  extractedTitle: string | null;
  /** AI-extracted company name. */
  extractedCompany: string | null;
  /** Seniority level inferred from the description. */
  seniority: "entry" | "junior" | "mid" | "senior" | "lead" | null;
  /** Employment type if mentioned. */
  employmentType: "full_time" | "part_time" | "internship" | "contract" | null;
  /** Location if mentioned. */
  location: string | null;
  /** Whether remote work is mentioned. */
  remote: boolean | null;
  /** Required skills categorized by type, each with severity. */
  requiredSkills: { name: string; category: JDRequirementCategory; severity: JDRequirementSeverity }[];
  /** Education requirements (e.g. "BS in CS or equivalent"). */
  educationRequirements: string[];
  /** Experience requirements (e.g. "3+ years of experience"). */
  experienceRequirements: string[];
  /** Key responsibilities extracted from the description. */
  responsibilities: string[];
  /** Soft skills mentioned in the posting. */
  softSkills: string[];
  /** Certifications mentioned (if any). */
  certifications: string[];
  /** Domain knowledge areas (e.g. "fintech", "distributed systems"). */
  domainKnowledge: string[];
  /** Brief AI summary of what the role requires. */
  summary: string | null;
  /** Scoring version for traceability. */
  scoringVersion?: string;
};

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
};

// --- Engineering + career taxonomy (Phase 2 + Phase 3) --------------------
//
// Reference tables, seeded from src/lib/taxonomy-catalog.ts (db/seed.ts).
// The model is deliberately open: adding a category / branch / career / link is
// a data edit, never an application-logic change.
//
//   engineering_categories  1─┐
//                             └─N  engineering_branches ──┐
//                                                         │ (M:N, by relevance)
//   careers ──┬──────────────────── branch_career_paths ──┘
//             │ (M:N, by importance)
//             └── career_skill_requirements ── skills
//
// Branch and career are independent: `branch_career_paths` expresses which
// careers are *reachable* from a branch, and the same career is reachable from
// many branches (e.g. Software Engineer from ECE, Mechanical and CSE alike).

export const engineeringCategories = sqliteTable("engineering_categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const engineeringBranches = sqliteTable(
  "engineering_branches",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    categoryId: text("category_id").references(() => engineeringCategories.id, {
      onDelete: "set null",
    }),
    aliases: text("aliases", { mode: "json" }).$type<string[]>(),
    description: text("description"),
    ...timestamps,
  },
  (table) => [index("engineering_branches_category_idx").on(table.categoryId)],
);

export const careers = sqliteTable("careers", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // Display grouping (e.g. "Software", "Data & AI") — not a DB relationship.
  category: text("category").notNull(),
  description: text("description"),
  // Typical entry point for a new engineering graduate targeting this role.
  typicalExperienceLevel: text("typical_experience_level", {
    enum: ["entry", "junior", "mid", "senior"],
  })
    .notNull()
    .default("junior"),
  ...timestamps,
});

// Which careers are reachable from which branches, and how strongly. This is
// the "careers compatible with a branch" relationship — many-to-many.
export const branchCareerPaths = sqliteTable(
  "branch_career_paths",
  {
    id: id(),
    branchId: text("branch_id")
      .notNull()
      .references(() => engineeringBranches.id, { onDelete: "cascade" }),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    relevance: text("relevance", { enum: ["primary", "common", "possible"] }).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("branch_career_paths_branch_career_unique").on(table.branchId, table.careerId),
    index("branch_career_paths_branch_idx").on(table.branchId),
    index("branch_career_paths_career_idx").on(table.careerId),
  ],
);

// The skills a career requires, and how central each one is.
export const careerSkillRequirements = sqliteTable(
  "career_skill_requirements",
  {
    id: id(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    importance: text("importance", { enum: ["core", "important", "helpful"] }).notNull(),
    // Proficiency a candidate for this role is expected to reach — drives the
    // Skill Gap Engine (Phase 6+). Derived from `importance` at seed time.
    requiredLevel: text("required_level", {
      enum: ["beginner", "intermediate", "advanced", "expert"],
    })
      .notNull()
      .default("intermediate"),
    ...timestamps,
  },
  (table) => [
    unique("career_skill_requirements_career_skill_unique").on(table.careerId, table.skillId),
    index("career_skill_requirements_career_idx").on(table.careerId),
    index("career_skill_requirements_skill_idx").on(table.skillId),
  ],
);

export const engineeringCategoryRelations = relations(engineeringCategories, ({ many }) => ({
  branches: many(engineeringBranches),
}));

export const engineeringBranchRelations = relations(engineeringBranches, ({ one, many }) => ({
  category: one(engineeringCategories, {
    fields: [engineeringBranches.categoryId],
    references: [engineeringCategories.id],
  }),
  careerPaths: many(branchCareerPaths),
}));

export const careerRelations = relations(careers, ({ many }) => ({
  branchPaths: many(branchCareerPaths),
  skillRequirements: many(careerSkillRequirements),
}));

export const branchCareerPathRelations = relations(branchCareerPaths, ({ one }) => ({
  branch: one(engineeringBranches, {
    fields: [branchCareerPaths.branchId],
    references: [engineeringBranches.id],
  }),
  career: one(careers, {
    fields: [branchCareerPaths.careerId],
    references: [careers.id],
  }),
}));

// `careerSkillRequirementRelations` is defined after the `skills` table below,
// since it references it eagerly.

// One row per user. Created on the first onboarding step save and filled in
// progressively — every field except the goal status is nullable so a student
// can skip optional questions. `lastCompletedStep` drives resume-on-return;
// `onboardingCompletedAt` flips once step 5 (Review) is confirmed.
export const studentProfiles = sqliteTable(
  "student_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    // Step 1 — academic background
    degree: text("degree"),
    branchId: text("branch_id").references(() => engineeringBranches.id, {
      onDelete: "set null",
    }),
    collegeName: text("college_name"),
    countryCode: text("country_code"),
    // Step 3 — current year / graduation
    currentYear: text("current_year", {
      enum: ["first", "second", "third", "fourth", "fifth", "graduated"],
    }),
    graduationYear: integer("graduation_year"),
    // Step 4 — career direction
    experienceLevel: text("experience_level", {
      enum: ["student", "internship", "junior", "mid", "senior"],
    }),
    careerGoalStatus: text("career_goal_status", {
      enum: ["known", "exploring", "unsure"],
    }),
    // Step 1/2 — free-text specialization within the branch (e.g. "VLSI",
    // "Cloud & DevOps", "Structural"). Kept as text, not a catalog — it varies
    // too much between colleges to enumerate usefully.
    specialization: text("specialization"),
    // Step 3 — current semester (1–12), only meaningful while still studying.
    currentSemester: integer("current_semester"),
    // Step 4 — where the student wants to work (city / region / "Remote").
    // Distinct from `country_code`, which is where they study. Kept for
    // back-compat; the Career Profile (Phase 6) uses `preferredLocations` and
    // mirrors its first entry here.
    preferredWorkLocation: text("preferred_work_location"),
    // Step 4 — any other non-sensitive career context the student wants to add.
    careerNotes: text("career_notes"),
    // --- Career Profile preferences (Phase 6) ---------------------------------
    // Slugs from career-profile-catalog.ts. JSON arrays so the set can grow
    // without a schema change.
    preferredIndustries: text("preferred_industries", { mode: "json" }).$type<string[]>(),
    preferredJobTypes: text("preferred_job_types", { mode: "json" }).$type<string[]>(),
    preferredLocations: text("preferred_locations", { mode: "json" }).$type<string[]>(),
    workMode: text("work_mode", { enum: ["remote", "hybrid", "onsite", "flexible"] }),
    // 0–100, recomputed by profile-completion.server.ts.
    profileCompletion: integer("profile_completion").notNull().default(0),
    // AI-detected branch — stored separately from the student's DECLARED
    // `branchId` and never used to overwrite it (Phase 4/5 principle).
    detectedBranchId: text("detected_branch_id").references(() => engineeringBranches.id, {
      onDelete: "set null",
    }),
    detectedBranchConfidence: integer("detected_branch_confidence"),
    branchDetectionSource: text("branch_detection_source", {
      enum: ["resume_analysis", "assessment", "manual"],
    }),
    // Onboarding progress
    lastCompletedStep: integer("last_completed_step").notNull().default(0),
    onboardingCompletedAt: integer("onboarding_completed_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [
    index("student_profiles_branch_idx").on(table.branchId),
    index("student_profiles_country_idx").on(table.countryCode),
  ],
);

// The student's target career role(s) — the "what job they want" half of the
// Career Profile (Phase 6). Many-to-many so it covers "I know exactly what I
// want" (one row) and "I have a few options" (several). Exactly one row may be
// `isPrimary` at a time (enforced in the service). Phase 7's skill-gap engine
// reads the primary row's `career_id` and joins `career_skill_requirements`.
export const studentTargetCareers = sqliteTable(
  "student_target_careers",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique("student_target_careers_user_career_unique").on(table.userId, table.careerId),
    index("student_target_careers_user_idx").on(table.userId),
    index("student_target_careers_user_primary_idx").on(table.userId, table.isPrimary),
  ],
);

// The student's broad career-interest areas (taxonomy career groups — e.g.
// "Data & AI", "Robotics & Automation"). Many-to-many, kept separate from
// `student_target_careers`: interests are exploratory, targets are concrete.
export const studentInterestAreas = sqliteTable(
  "student_interest_areas",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Slug of a taxonomy career group (see `CAREER_GROUPS` in taxonomy-catalog.ts).
    groupSlug: text("group_slug").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("student_interest_areas_user_group_unique").on(table.userId, table.groupSlug),
    index("student_interest_areas_user_idx").on(table.userId),
  ],
);

export const studentProfileRelations = relations(studentProfiles, ({ one, many }) => ({
  user: one(user, { fields: [studentProfiles.userId], references: [user.id] }),
  branch: one(engineeringBranches, {
    fields: [studentProfiles.branchId],
    references: [engineeringBranches.id],
  }),
  targetCareers: many(studentTargetCareers),
  interestAreas: many(studentInterestAreas),
}));

export const studentInterestAreaRelations = relations(studentInterestAreas, ({ one }) => ({
  profile: one(studentProfiles, {
    fields: [studentInterestAreas.userId],
    references: [studentProfiles.userId],
  }),
}));

export const studentTargetCareerRelations = relations(studentTargetCareers, ({ one }) => ({
  profile: one(studentProfiles, {
    fields: [studentTargetCareers.userId],
    references: [studentProfiles.userId],
  }),
  career: one(careers, {
    fields: [studentTargetCareers.careerId],
    references: [careers.id],
  }),
}));

// One row per user, backing the "Career preferences" panel on Settings.
// (Name/email/avatar live on better-auth's own `user` table — see auth-schema.ts.)
export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  targetRole: text("target_role"),
  weeklyStudyHours: integer("weekly_study_hours"),
  ...timestamps,
});

// --- Resume intelligence (Phase 4 / Phase 5) ---------------------------------
//
// Pipeline: upload → validate/scan → extract text → run AI analysis.
// `status` mirrors the UI processing states. AI-detected information is stored
// in `resume_analyses` / `resume_skills` / `resume_career_signals`, kept
// SEPARATE from the student's DECLARED profile (student_profiles); a
// disagreement is surfaced, never silently applied.
//
// VERSIONING (Phase 5): a new upload never overwrites the previous resume — it
// gets the next `version` for that user and its own analyses. The ACTIVE resume
// is simply the highest `version`; deleting it promotes the next one down.
// History (rows, files, analyses) is preserved until the user deletes a version.
export const resumes = sqliteTable(
  "resumes",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // 1-based, monotonically increasing per user. `unique(user_id, version)`.
    version: integer("version").notNull().default(1),
    // `fileName` is the sanitized, safe-to-display basename (see resume-upload.server.ts).
    fileName: text("file_name").notNull(),
    // Opaque storage key `<userId>/<uuid>.<ext>` — never a client-controlled path.
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // Processing state machine. `uploaded` → `extracting_text` → `processing`
    // (text ready) → `analyzing` (AI) → `complete` | `failed`. Retry re-runs
    // from `analyzing`; a conditional update guards against concurrent retries.
    status: text("status", {
      enum: ["uploaded", "extracting_text", "processing", "analyzing", "complete", "failed"],
    })
      .notNull()
      .default("uploaded"),
    // Extracted plain text, kept for evidence-linking and re-analysis. Private,
    // owner-scoped, capped in length — this is storage, not logging.
    extractedText: text("extracted_text"),
    textCharCount: integer("text_char_count"),
    // User-safe failure reason for the `failed` state (never a stack trace).
    errorMessage: text("error_message"),
    analysisModel: text("analysis_model"),
    analyzedAt: integer("analyzed_at", { mode: "timestamp" }),
    // Deprecated (Phase 0): kept so the Phase 4 migration is purely additive.
    structuredData: text("structured_data", { mode: "json" }).$type<Record<string, unknown>>(),
    parsedAt: integer("parsed_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [
    index("resumes_user_idx").on(table.userId),
    index("resumes_status_idx").on(table.status),
    index("resumes_user_created_idx").on(table.userId, table.createdAt),
    unique("resumes_user_version_unique").on(table.userId, table.version),
  ],
);

// One row per completed AI analysis of a resume (latest per resume is "current").
// Columns hold the queryable AI classification + confidences; `payload` holds the
// validated rich extraction (education, projects, experience, certifications,
// achievements) as a schema-checked JSON document.
export const resumeAnalyses = sqliteTable(
  "resume_analyses",
  {
    id: id(),
    resumeId: text("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // AI-detected academic classification (NOT written to student_profiles).
    aiBranchSlug: text("ai_branch_slug"),
    aiBranchConfidence: integer("ai_branch_confidence"), // 0–100
    aiSpecialization: text("ai_specialization"),
    aiSpecializationConfidence: integer("ai_specialization_confidence"),
    aiExperienceLevel: text("ai_experience_level", {
      enum: ["student", "internship", "junior", "mid", "senior"],
    }),
    aiExperienceConfidence: integer("ai_experience_confidence"),
    // Uncertainty indicator — set when the résumé evidence for the branch is
    // weak or conflicting. The UI shows this instead of a confident-looking guess.
    aiBranchUncertain: integer("ai_branch_uncertain", { mode: "boolean" }),
    // Overall job-readiness bucket derived from the résumé's evidence.
    readinessLevel: text("readiness_level", {
      enum: ["early", "developing", "approaching", "job_ready"],
    }),
    // Extracted, as text (the AI's reading of the resume — not authoritative).
    extractedName: text("extracted_name"),
    extractedCollege: text("extracted_college"),
    extractedDegree: text("extracted_degree"),
    extractedGraduationYear: integer("extracted_graduation_year"),
    summary: text("summary"),
    projectDomains: text("project_domains", { mode: "json" }).$type<string[]>(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    ...timestamps,
  },
  (table) => [
    index("resume_analyses_resume_idx").on(table.resumeId),
    index("resume_analyses_user_idx").on(table.userId),
    index("resume_analyses_user_created_idx").on(table.userId, table.createdAt),
  ],
);

// Detected skills with EVIDENCE. A skill from a resume is at most
// `supported_by_resume` — never `assessed` / `project_verified` from text alone.
export const resumeSkills = sqliteTable(
  "resume_skills",
  {
    id: id(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => resumeAnalyses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Matched catalog skill, or null when the AI named a skill we don't catalog.
    skillId: text("skill_id").references(() => skills.id, { onDelete: "set null" }),
    skillNameRaw: text("skill_name_raw").notNull(),
    // AI skill family. Widened in Phase 5 to the full set of categories the
    // résumé-intelligence view groups by.
    kind: text("kind", {
      enum: [
        "language",
        "framework",
        "library",
        "database",
        "cloud",
        "devops",
        "ai_ml",
        "cybersecurity",
        "software_engineering",
        "tool",
        "concept",
        "other",
      ],
    })
      .notNull()
      .default("other"),
    evidenceType: text("evidence_type", {
      enum: ["claimed", "supported_by_resume", "assessed", "project_verified"],
    })
      .notNull()
      .default("claimed"),
    // Finer AI signal behind `evidenceType`: demonstrated | project_backed |
    // work_backed | mentioned | inferred. `evidenceType` stays the coarse
    // "is this verified?" axis (résumé text is never `assessed`/`project_verified`).
    evidenceStrength: text("evidence_strength", {
      enum: ["demonstrated", "project_backed", "work_backed", "mentioned", "inferred"],
    }),
    confidence: integer("confidence").notNull().default(0), // 0–100
    // [{ kind: "project"|"internship"|"experience"|"certification"|"education", label: string }]
    evidence: text("evidence", { mode: "json" }).$type<{ kind: string; label: string }[]>(),
    ...timestamps,
  },
  (table) => [
    unique("resume_skills_analysis_name_unique").on(table.analysisId, table.skillNameRaw),
    index("resume_skills_analysis_idx").on(table.analysisId),
    index("resume_skills_user_idx").on(table.userId),
  ],
);

// AI-suggested career paths from the resume. Recommendations, not classifications
// (the UI states this). `score` is the AI's fit estimate 0–100.
export const resumeCareerSignals = sqliteTable(
  "resume_career_signals",
  {
    id: id(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => resumeAnalyses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    careerId: text("career_id").references(() => careers.id, { onDelete: "set null" }),
    careerTitleRaw: text("career_title_raw").notNull(),
    score: integer("score").notNull().default(0), // 0–100
    rationale: text("rationale"),
    ...timestamps,
  },
  (table) => [
    index("resume_career_signals_analysis_idx").on(table.analysisId),
    index("resume_career_signals_user_idx").on(table.userId),
  ],
);

export const resumeRelations = relations(resumes, ({ one, many }) => ({
  user: one(user, { fields: [resumes.userId], references: [user.id] }),
  analyses: many(resumeAnalyses),
}));

export const resumeAnalysisRelations = relations(resumeAnalyses, ({ one, many }) => ({
  resume: one(resumes, { fields: [resumeAnalyses.resumeId], references: [resumes.id] }),
  skills: many(resumeSkills),
  careerSignals: many(resumeCareerSignals),
}));

// Skills page — canonical skill catalog + per-user claimed/verified levels.
export const skills = sqliteTable("skills", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category"),
  parentSkillId: text("parent_skill_id"),
  ...timestamps,
});

// Taxonomy relation that references `skills` eagerly — must come after it.
export const careerSkillRequirementRelations = relations(careerSkillRequirements, ({ one }) => ({
  career: one(careers, {
    fields: [careerSkillRequirements.careerId],
    references: [careers.id],
  }),
  skill: one(skills, {
    fields: [careerSkillRequirements.skillId],
    references: [skills.id],
  }),
}));

export const userSkills = sqliteTable(
  "user_skills",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    claimedLevel: text("claimed_level", {
      enum: ["beginner", "intermediate", "advanced", "expert"],
    }),
    verifiedLevel: text("verified_level", {
      enum: ["beginner", "intermediate", "advanced", "expert"],
    }),
    // The effective current level used by the Skill Gap Engine (max of claimed /
    // verified, weighted by source — see student-skills.server.ts).
    currentLevel: text("current_level", {
      enum: ["beginner", "intermediate", "advanced", "expert"],
    }),
    confidence: integer("confidence"), // 0-100
    score: integer("score"), // 0-100, from assessments / coding practice
    // Widened in Phase 6. AI inference is kept distinct from verified evidence.
    source: text("source", {
      enum: [
        "resume",
        "assessment",
        "project",
        "course",
        "coding_practice",
        "interview",
        "user_input",
        "ai_inference",
      ],
    }),
    evidence: text("evidence", { mode: "json" }).$type<{ kind: string; label: string }[]>(),
    lastAssessedAt: integer("last_assessed_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (t) => [
    unique("user_skills_user_skill_unique").on(t.userId, t.skillId),
    index("user_skills_user_idx").on(t.userId),
  ],
);

// Jobs page — "Analyze a job description".
export const jobs = sqliteTable("jobs", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title"),
  company: text("company"),
  rawDescription: text("raw_description").notNull(),
  seniority: text("seniority"),
  location: text("location"),
  remote: integer("remote", { mode: "boolean" }),
  // Phase 6 job-catalog fields (all nullable — the existing "paste a JD" flow
  // fills only title/company/rawDescription).
  employmentType: text("employment_type", {
    enum: ["full_time", "part_time", "internship", "contract"],
  }),
  experienceLevel: text("experience_level"),
  source: text("source"), // e.g. "user_paste", "seed", "partner_feed"
  externalRef: text("external_ref"),
  postedDate: integer("posted_date", { mode: "timestamp" }),
  closingDate: integer("closing_date", { mode: "timestamp" }),
  status: text("status", { enum: ["pending", "analyzed", "failed"] })
    .notNull()
    .default("pending"),
  matchScore: integer("match_score"), // 0-100, overall job match score
  analyzedAt: integer("analyzed_at", { mode: "timestamp" }),
  // Phase 7: AI-extracted structured JD data (skills by category, responsibilities,
  // education/experience requirements, soft skills, etc.). Populated by jd-intelligence.server.ts.
  structuredData: text("structured_data", { mode: "json" }).$type<JDStructuredData>(),
  // Phase 7: multi-dimensional match scores (weights versioned in scoringVersion).
  matchSkillsScore: integer("match_skills_score"), // 0-100
  matchExperienceScore: integer("match_experience_score"), // 0-100
  matchEducationScore: integer("match_education_score"), // 0-100
  matchToolsScore: integer("match_tools_score"), // 0-100
  matchKeywordsScore: integer("match_keywords_score"), // 0-100
  scoringVersion: text("scoring_version"), // e.g. "2026-08-30.1"
  ...timestamps,
});

export const jobSkills = sqliteTable("job_skills", {
  id: id(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  skillId: text("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  requirement: text("requirement", { enum: ["required", "preferred"] }).notNull(),
  ...timestamps,
});

// Assessments page — catalog + a user's attempts and per-skill results.
export const assessments = sqliteTable("assessments", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  type: text("type", { enum: ["mcq", "coding", "written"] }).notNull(),
  // What the assessment measures (Phase 6 — questions/answers live in
  // career-schema.ts: assessment_questions / assessment_answers).
  category: text("category", {
    enum: ["skill", "career", "coding", "aptitude", "interview"],
  })
    .notNull()
    .default("skill"),
  skillId: text("skill_id").references(() => skills.id, { onDelete: "set null" }),
  durationMinutes: integer("duration_minutes").notNull(),
  description: text("description"),
  ...timestamps,
});

export const assessmentAttempts = sqliteTable("assessment_attempts", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  assessmentId: text("assessment_id")
    .notNull()
    .references(() => assessments.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["in_progress", "submitted", "scored"] })
    .notNull()
    .default("in_progress"),
  score: integer("score"), // 0-100
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  submittedAt: integer("submitted_at", { mode: "timestamp" }),
});

export const assessmentResults = sqliteTable("assessment_results", {
  id: id(),
  attemptId: text("attempt_id")
    .notNull()
    .references(() => assessmentAttempts.id, { onDelete: "cascade" }),
  skillId: text("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  verifiedLevel: text("verified_level", {
    enum: ["beginner", "intermediate", "advanced", "expert"],
  }).notNull(),
  confidence: integer("confidence").notNull(), // 0-100
  feedback: text("feedback"),
  ...timestamps,
});

// Roadmap page — "8-week plan".
export const learningRoadmaps = sqliteTable("learning_roadmaps", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  targetRole: text("target_role"),
  weeklyHours: integer("weekly_hours"),
  status: text("status", { enum: ["active", "completed", "archived"] })
    .notNull()
    .default("active"),
  ...timestamps,
});

export const roadmapItems = sqliteTable("roadmap_items", {
  id: id(),
  roadmapId: text("roadmap_id")
    .notNull()
    .references(() => learningRoadmaps.id, { onDelete: "cascade" }),
  week: integer("week").notNull(),
  topic: text("topic").notNull(),
  status: text("status", { enum: ["todo", "active", "done"] })
    .notNull()
    .default("todo"),
  resourceUrl: text("resource_url"),
  ...timestamps,
});

// Dashboard "Next actions" / future project-recommendation feature.
export const projectRecommendations = sqliteTable("project_recommendations", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  difficulty: text("difficulty", { enum: ["beginner", "intermediate", "advanced"] }),
  skillsAddressed: text("skills_addressed", { mode: "json" }).$type<string[]>(),
  status: text("status", { enum: ["suggested", "started", "completed"] })
    .notNull()
    .default("suggested"),
  ...timestamps,
});
