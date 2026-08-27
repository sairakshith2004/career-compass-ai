import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";

import { user } from "./auth-schema";

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

// --- Student onboarding / profile (Phase 2) -------------------------------
//
// `engineering_branches` and `careers` are reference tables — a student profile
// points at them by id so we can later query "students in branch X" or
// "students targeting career Y". Branch and career are deliberately unrelated:
// the career picker offers every career regardless of the student's branch.
// Seeded from src/lib/onboarding-catalog.ts (db/seed.ts).

export const engineeringBranches = sqliteTable("engineering_branches", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  ...timestamps,
});

export const careers = sqliteTable("careers", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  ...timestamps,
});

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

// The student's target career(s). Many-to-many so it covers both "I know
// exactly what I want" (one row) and "I have a few options" (several); empty
// when the student is unsure.
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
    ...timestamps,
  },
  (table) => [
    unique("student_target_careers_user_career_unique").on(table.userId, table.careerId),
    index("student_target_careers_user_idx").on(table.userId),
  ],
);

export const studentProfileRelations = relations(studentProfiles, ({ one, many }) => ({
  user: one(user, { fields: [studentProfiles.userId], references: [user.id] }),
  branch: one(engineeringBranches, {
    fields: [studentProfiles.branchId],
    references: [engineeringBranches.id],
  }),
  targetCareers: many(studentTargetCareers),
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

// Resume page — "Upload resume".
export const resumes = sqliteTable("resumes", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status", { enum: ["uploaded", "parsing", "parsed", "failed"] })
    .notNull()
    .default("uploaded"),
  structuredData: text("structured_data", { mode: "json" }).$type<Record<string, unknown>>(),
  parsedAt: integer("parsed_at", { mode: "timestamp" }),
  ...timestamps,
});

// Skills page — canonical skill catalog + per-user claimed/verified levels.
export const skills = sqliteTable("skills", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category"),
  parentSkillId: text("parent_skill_id"),
  ...timestamps,
});

export const userSkills = sqliteTable("user_skills", {
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
  confidence: integer("confidence"), // 0-100
  source: text("source", { enum: ["resume", "assessment", "interview", "manual"] }),
  ...timestamps,
});

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
  status: text("status", { enum: ["pending", "analyzed", "failed"] })
    .notNull()
    .default("pending"),
  matchScore: integer("match_score"), // 0-100, computed once skill matching lands
  analyzedAt: integer("analyzed_at", { mode: "timestamp" }),
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
