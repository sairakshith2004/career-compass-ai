import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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
