import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";

import { user } from "./auth-schema";
// One-way import: this file depends on the base reference tables; `schema.ts`
// does NOT import this file (no cycle). Consumers import career-journey tables
// from `./db/career-schema` directly.
import { assessmentAttempts, assessments, careers, jobs, resumeAnalyses, skills } from "./schema";

/**
 * Phase 6 — persistent career-journey foundation.
 *
 * The DATABASE is the source of truth for a student's career state: active
 * goal, roadmap, current phase/task, progress, and the full activity history.
 * The frontend never remembers this. See `career-continue.server.ts` for the
 * "continue where you left off" computation.
 *
 * Every user-owned row references `user.id` (cascade delete) and is only ever
 * read/written through a `.server.ts` service scoped to the authenticated user
 * — enforced, not advisory.
 *
 * These tables live in their own file to keep `schema.ts` readable; they are
 * re-exported from `schema.ts` so `import { … } from "./db/schema"` keeps
 * working, and spread into the drizzle client in `db/client.ts`.
 */

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

const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

/** Where a student-skill signal came from. AI inference is kept distinct from
 * verified evidence (see student-skills.server.ts). */
export const SKILL_SOURCES = [
  "resume",
  "assessment",
  "project",
  "course",
  "coding_practice",
  "interview",
  "user_input",
  "ai_inference",
] as const;
export type SkillSource = (typeof SKILL_SOURCES)[number];

// --- career goals --------------------------------------------------------
//
// A student may hold several goals over their journey; history is preserved.
// Exactly one is `isPrimary` at a time (enforced in the service, since SQLite
// partial unique indexes aren't in the drizzle-kit sqlite path).

export const careerGoals = sqliteTable(
  "career_goals",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["active", "achieved", "abandoned", "paused"],
    })
      .notNull()
      .default("active"),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    priority: integer("priority").notNull().default(1),
    targetDate: integer("target_date", { mode: "timestamp" }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("career_goals_user_idx").on(t.userId),
    index("career_goals_user_status_idx").on(t.userId, t.status),
  ],
);

// --- skill gaps --------------------------------------------------------

export const skillGaps = sqliteTable(
  "skill_gaps",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    careerGoalId: text("career_goal_id")
      .notNull()
      .references(() => careerGoals.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    currentLevel: text("current_level", { enum: SKILL_LEVELS }),
    requiredLevel: text("required_level", { enum: SKILL_LEVELS }).notNull(),
    severity: text("severity", {
      enum: ["none", "low", "medium", "high", "critical"],
    }).notNull(),
    priority: integer("priority").notNull(),
    status: text("status", { enum: ["open", "in_progress", "closed"] })
      .notNull()
      .default("open"),
    identifiedAt: integer("identified_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (t) => [
    unique("skill_gaps_goal_skill_unique").on(t.careerGoalId, t.skillId),
    index("skill_gaps_user_idx").on(t.userId),
    index("skill_gaps_goal_idx").on(t.careerGoalId),
  ],
);

// --- roadmap → phases → tasks ---------------------------------------------

export const careerRoadmaps = sqliteTable(
  "career_roadmaps",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    careerGoalId: text("career_goal_id")
      .notNull()
      .references(() => careerGoals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", { enum: ["active", "completed", "archived"] })
      .notNull()
      .default("active"),
    source: text("source", { enum: ["template", "ai_generated", "manual"] })
      .notNull()
      .default("template"),
    estimatedWeeks: integer("estimated_weeks"),
    progressPercent: integer("progress_percent").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("career_roadmaps_user_idx").on(t.userId),
    index("career_roadmaps_goal_idx").on(t.careerGoalId),
    index("career_roadmaps_user_status_idx").on(t.userId, t.status),
  ],
);

export const roadmapPhases = sqliteTable(
  "roadmap_phases",
  {
    id: id(),
    roadmapId: text("roadmap_id")
      .notNull()
      .references(() => careerRoadmaps.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull(),
    status: text("status", { enum: ["not_started", "in_progress", "completed"] })
      .notNull()
      .default("not_started"),
    progressPercent: integer("progress_percent").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique("roadmap_phases_roadmap_order_unique").on(t.roadmapId, t.orderIndex),
    index("roadmap_phases_roadmap_idx").on(t.roadmapId),
    index("roadmap_phases_user_idx").on(t.userId),
  ],
);

export const TASK_STATUSES = ["not_started", "in_progress", "completed", "skipped"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const roadmapTasks = sqliteTable(
  "roadmap_tasks",
  {
    id: id(),
    phaseId: text("phase_id")
      .notNull()
      .references(() => roadmapPhases.id, { onDelete: "cascade" }),
    // Denormalised for cheap scoping / "current task" queries — a roadmap and
    // all its rows belong to exactly one user.
    roadmapId: text("roadmap_id")
      .notNull()
      .references(() => careerRoadmaps.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    taskType: text("task_type", {
      enum: ["learn", "practice", "project", "assessment", "reading", "milestone"],
    })
      .notNull()
      .default("learn"),
    orderIndex: integer("order_index").notNull(),
    estimatedMinutes: integer("estimated_minutes"),
    priority: integer("priority").notNull().default(2),
    // Canonical task status — the DB source of truth. `task_progress` only adds
    // timing/analytics detail, never a competing status.
    status: text("status", { enum: TASK_STATUSES }).notNull().default("not_started"),
    skillId: text("skill_id").references(() => skills.id, { onDelete: "set null" }),
    resourceUrl: text("resource_url"),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (t) => [
    unique("roadmap_tasks_phase_order_unique").on(t.phaseId, t.orderIndex),
    index("roadmap_tasks_roadmap_idx").on(t.roadmapId),
    index("roadmap_tasks_phase_idx").on(t.phaseId),
    index("roadmap_tasks_user_status_idx").on(t.userId, t.status),
  ],
);

// Per-task timing / analytics detail. One row per task, created on first
// interaction. Status is NOT stored here — `roadmap_tasks.status` is canonical.
export const taskProgress = sqliteTable(
  "task_progress",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => roadmapTasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roadmapId: text("roadmap_id")
      .notNull()
      .references(() => careerRoadmaps.id, { onDelete: "cascade" }),
    phaseId: text("phase_id")
      .notNull()
      .references(() => roadmapPhases.id, { onDelete: "cascade" }),
    timeSpentMinutes: integer("time_spent_minutes").notNull().default(0),
    completionPercent: integer("completion_percent").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    lastAccessedAt: integer("last_accessed_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    ...timestamps,
  },
  (t) => [
    unique("task_progress_task_unique").on(t.taskId),
    index("task_progress_user_idx").on(t.userId),
    index("task_progress_roadmap_idx").on(t.roadmapId),
  ],
);

// --- skill progression history (append-only) ----------------------------

export const userSkillHistory = sqliteTable(
  "user_skill_history",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    previousLevel: text("previous_level", { enum: SKILL_LEVELS }),
    newLevel: text("new_level", { enum: SKILL_LEVELS }).notNull(),
    score: integer("score"),
    source: text("source", { enum: SKILL_SOURCES }).notNull(),
    reason: text("reason"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("user_skill_history_user_skill_idx").on(t.userId, t.skillId),
    index("user_skill_history_user_created_idx").on(t.userId, t.createdAt),
  ],
);

// --- activity / journey log (append-only) -------------------------------

export const ACTIVITY_TYPES = [
  "login",
  "profile_completed",
  "resume_uploaded",
  "resume_analyzed",
  "career_goal_set",
  "career_goal_changed",
  "skill_gaps_identified",
  "job_analyzed",
  "roadmap_created",
  "phase_started",
  "phase_completed",
  "task_started",
  "task_completed",
  "task_skipped",
  "assessment_started",
  "assessment_completed",
  "project_started",
  "project_completed",
  "job_saved",
  "job_applied",
  "interview_prep_started",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: ACTIVITY_TYPES }).notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    // Small, non-sensitive descriptors only (title, counts). Never resume text.
    metadata: text("metadata", { mode: "json" }).$type<Record<
      string,
      string | number | boolean | null
    > | null>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("activity_events_user_created_idx").on(t.userId, t.createdAt)],
);

// --- AI run audit (append-only) ---------------------------------------

export const aiRuns = sqliteTable(
  "ai_runs",
  {
    id: id(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: [
        "resume_analysis",
        "roadmap_generation",
        "skill_gap_analysis",
        "career_recommendation",
        "jd_analysis",
      ],
    }).notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    status: text("status", { enum: ["ok", "failed"] }).notNull(),
    errorCode: text("error_code"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("ai_runs_user_created_idx").on(t.userId, t.createdAt)],
);

// --- AI career recommendations --------------------------------------

export const careerRecommendations = sqliteTable(
  "career_recommendations",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    careerId: text("career_id").references(() => careers.id, { onDelete: "set null" }),
    careerTitleRaw: text("career_title_raw").notNull(),
    score: integer("score").notNull(),
    rationale: text("rationale"),
    source: text("source", {
      enum: ["resume_analysis", "skill_profile", "branch_default", "manual"],
    }).notNull(),
    resumeAnalysisId: text("resume_analysis_id").references(() => resumeAnalyses.id, {
      onDelete: "set null",
    }),
    dismissedAt: integer("dismissed_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (t) => [
    unique("career_recommendations_user_title_source_unique").on(
      t.userId,
      t.careerTitleRaw,
      t.source,
    ),
    index("career_recommendations_user_idx").on(t.userId),
  ],
);

// --- assessment questions + answers (Step 19) --------------------------

export const assessmentQuestions = sqliteTable(
  "assessment_questions",
  {
    id: id(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    prompt: text("prompt").notNull(),
    options: text("options", { mode: "json" }).$type<string[]>().notNull(),
    // Server-only — never selected into a client-facing payload.
    correctIndex: integer("correct_index").notNull(),
    skillId: text("skill_id").references(() => skills.id, { onDelete: "set null" }),
    points: integer("points").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    unique("assessment_questions_assessment_order_unique").on(t.assessmentId, t.orderIndex),
    index("assessment_questions_assessment_idx").on(t.assessmentId),
  ],
);

export const assessmentAnswers = sqliteTable(
  "assessment_answers",
  {
    id: id(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => assessmentAttempts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => assessmentQuestions.id, { onDelete: "cascade" }),
    selectedIndex: integer("selected_index"),
    isCorrect: integer("is_correct", { mode: "boolean" }),
    ...timestamps,
  },
  (t) => [
    unique("assessment_answers_attempt_question_unique").on(t.attemptId, t.questionId),
    index("assessment_answers_user_idx").on(t.userId),
  ],
);

// --- projects catalog + per-student progress (Step 20) ----------------

export const projects = sqliteTable("projects", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  difficulty: text("difficulty", { enum: ["beginner", "intermediate", "advanced"] }).notNull(),
  technologies: text("technologies", { mode: "json" }).$type<string[]>().notNull(),
  estimatedHours: integer("estimated_hours"),
  ...timestamps,
});

export const projectSkills = sqliteTable(
  "project_skills",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [unique("project_skills_unique").on(t.projectId, t.skillId)],
);

export const projectCareerRoles = sqliteTable(
  "project_career_roles",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
  },
  (t) => [unique("project_career_roles_unique").on(t.projectId, t.careerId)],
);

export const studentProjects = sqliteTable(
  "student_projects",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    source: text("source", {
      enum: ["ai_recommended", "user_created", "roadmap_assigned"],
    }).notNull(),
    status: text("status", { enum: ["not_started", "in_progress", "completed"] })
      .notNull()
      .default("not_started"),
    repoUrl: text("repo_url"),
    notes: text("notes"),
    roadmapTaskId: text("roadmap_task_id").references(() => roadmapTasks.id, {
      onDelete: "set null",
    }),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (t) => [
    index("student_projects_user_idx").on(t.userId),
    index("student_projects_user_status_idx").on(t.userId, t.status),
  ],
);

// --- jobs: matches, applications, interview prep (Steps 22-24) --------

export const jobMatches = sqliteTable(
  "job_matches",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    matchScore: integer("match_score").notNull(),
    matchingSkills: text("matching_skills", { mode: "json" }).$type<string[]>(),
    missingSkills: text("missing_skills", { mode: "json" }).$type<string[]>(),
    generatedAt: integer("generated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    ...timestamps,
  },
  (t) => [
    unique("job_matches_user_job_unique").on(t.userId, t.jobId),
    index("job_matches_user_idx").on(t.userId),
  ],
);

export const JOB_APPLICATION_STATUSES = [
  "saved",
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export const jobApplications = sqliteTable(
  "job_applications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: text("status", { enum: JOB_APPLICATION_STATUSES }).notNull().default("saved"),
    appliedAt: integer("applied_at", { mode: "timestamp" }),
    interviewStage: text("interview_stage"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    unique("job_applications_user_job_unique").on(t.userId, t.jobId),
    index("job_applications_user_status_idx").on(t.userId, t.status),
  ],
);

export const interviewPrep = sqliteTable(
  "interview_prep",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    careerGoalId: text("career_goal_id").references(() => careerGoals.id, {
      onDelete: "set null",
    }),
    jobApplicationId: text("job_application_id").references(() => jobApplications.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: ["not_started", "in_progress", "completed"] })
      .notNull()
      .default("not_started"),
    focusAreas: text("focus_areas", { mode: "json" }).$type<string[]>(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("interview_prep_user_idx").on(t.userId)],
);

// --- notifications / reminders (Step 25) ------------------------------

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: [
        "roadmap_reminder",
        "assessment_reminder",
        "resume_update",
        "interview_prep",
        "application_deadline",
        "general",
      ],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    actionUrl: text("action_url"),
    readAt: integer("read_at", { mode: "timestamp" }),
    scheduledFor: integer("scheduled_for", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("notifications_user_read_idx").on(t.userId, t.readAt),
    index("notifications_user_scheduled_idx").on(t.userId, t.scheduledFor),
  ],
);

// --- relations (only where `.with` queries are used) -----------------

export const careerGoalRelations = relations(careerGoals, ({ one, many }) => ({
  user: one(user, { fields: [careerGoals.userId], references: [user.id] }),
  career: one(careers, { fields: [careerGoals.careerId], references: [careers.id] }),
  roadmaps: many(careerRoadmaps),
  skillGaps: many(skillGaps),
}));

export const careerRoadmapRelations = relations(careerRoadmaps, ({ one, many }) => ({
  goal: one(careerGoals, {
    fields: [careerRoadmaps.careerGoalId],
    references: [careerGoals.id],
  }),
  phases: many(roadmapPhases),
  tasks: many(roadmapTasks),
}));

export const roadmapPhaseRelations = relations(roadmapPhases, ({ one, many }) => ({
  roadmap: one(careerRoadmaps, {
    fields: [roadmapPhases.roadmapId],
    references: [careerRoadmaps.id],
  }),
  tasks: many(roadmapTasks),
}));

export const roadmapTaskRelations = relations(roadmapTasks, ({ one }) => ({
  phase: one(roadmapPhases, {
    fields: [roadmapTasks.phaseId],
    references: [roadmapPhases.id],
  }),
  roadmap: one(careerRoadmaps, {
    fields: [roadmapTasks.roadmapId],
    references: [careerRoadmaps.id],
  }),
  skill: one(skills, { fields: [roadmapTasks.skillId], references: [skills.id] }),
}));
