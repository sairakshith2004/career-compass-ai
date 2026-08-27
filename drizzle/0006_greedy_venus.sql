CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_events_user_created_idx` ON `activity_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`duration_ms` integer,
	`status` text NOT NULL,
	`error_code` text,
	`entity_type` text,
	`entity_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_runs_user_created_idx` ON `ai_runs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `assessment_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`selected_index` integer,
	`is_correct` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `assessment_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `assessment_questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assessment_answers_user_idx` ON `assessment_answers` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_answers_attempt_question_unique` ON `assessment_answers` (`attempt_id`,`question_id`);--> statement-breakpoint
CREATE TABLE `assessment_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`prompt` text NOT NULL,
	`options` text NOT NULL,
	`correct_index` integer NOT NULL,
	`skill_id` text,
	`points` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `assessment_questions_assessment_idx` ON `assessment_questions` (`assessment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_questions_assessment_order_unique` ON `assessment_questions` (`assessment_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `career_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`career_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`priority` integer DEFAULT 1 NOT NULL,
	`target_date` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`career_id`) REFERENCES `careers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `career_goals_user_idx` ON `career_goals` (`user_id`);--> statement-breakpoint
CREATE INDEX `career_goals_user_status_idx` ON `career_goals` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `career_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`career_id` text,
	`career_title_raw` text NOT NULL,
	`score` integer NOT NULL,
	`rationale` text,
	`source` text NOT NULL,
	`resume_analysis_id` text,
	`dismissed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`career_id`) REFERENCES `careers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resume_analysis_id`) REFERENCES `resume_analyses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `career_recommendations_user_idx` ON `career_recommendations` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `career_recommendations_user_title_source_unique` ON `career_recommendations` (`user_id`,`career_title_raw`,`source`);--> statement-breakpoint
CREATE TABLE `career_roadmaps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`career_goal_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`source` text DEFAULT 'template' NOT NULL,
	`estimated_weeks` integer,
	`progress_percent` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`career_goal_id`) REFERENCES `career_goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `career_roadmaps_user_idx` ON `career_roadmaps` (`user_id`);--> statement-breakpoint
CREATE INDEX `career_roadmaps_goal_idx` ON `career_roadmaps` (`career_goal_id`);--> statement-breakpoint
CREATE INDEX `career_roadmaps_user_status_idx` ON `career_roadmaps` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `interview_prep` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`career_goal_id` text,
	`job_application_id` text,
	`status` text DEFAULT 'not_started' NOT NULL,
	`focus_areas` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`career_goal_id`) REFERENCES `career_goals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `interview_prep_user_idx` ON `interview_prep` (`user_id`);--> statement-breakpoint
CREATE TABLE `job_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`status` text DEFAULT 'saved' NOT NULL,
	`applied_at` integer,
	`interview_stage` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_applications_user_status_idx` ON `job_applications` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_applications_user_job_unique` ON `job_applications` (`user_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `job_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`match_score` integer NOT NULL,
	`matching_skills` text,
	`missing_skills` text,
	`generated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_matches_user_idx` ON `job_matches` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_matches_user_job_unique` ON `job_matches` (`user_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`action_url` text,
	`read_at` integer,
	`scheduled_for` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_scheduled_idx` ON `notifications` (`user_id`,`scheduled_for`);--> statement-breakpoint
CREATE TABLE `project_career_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`career_id` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`career_id`) REFERENCES `careers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_career_roles_unique` ON `project_career_roles` (`project_id`,`career_id`);--> statement-breakpoint
CREATE TABLE `project_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`skill_id` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_skills_unique` ON `project_skills` (`project_id`,`skill_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`difficulty` text NOT NULL,
	`technologies` text NOT NULL,
	`estimated_hours` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `roadmap_phases` (
	`id` text PRIMARY KEY NOT NULL,
	`roadmap_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`order_index` integer NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`progress_percent` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`roadmap_id`) REFERENCES `career_roadmaps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `roadmap_phases_roadmap_idx` ON `roadmap_phases` (`roadmap_id`);--> statement-breakpoint
CREATE INDEX `roadmap_phases_user_idx` ON `roadmap_phases` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `roadmap_phases_roadmap_order_unique` ON `roadmap_phases` (`roadmap_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `roadmap_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`phase_id` text NOT NULL,
	`roadmap_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`task_type` text DEFAULT 'learn' NOT NULL,
	`order_index` integer NOT NULL,
	`estimated_minutes` integer,
	`priority` integer DEFAULT 2 NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`skill_id` text,
	`resource_url` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`phase_id`) REFERENCES `roadmap_phases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`roadmap_id`) REFERENCES `career_roadmaps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `roadmap_tasks_roadmap_idx` ON `roadmap_tasks` (`roadmap_id`);--> statement-breakpoint
CREATE INDEX `roadmap_tasks_phase_idx` ON `roadmap_tasks` (`phase_id`);--> statement-breakpoint
CREATE INDEX `roadmap_tasks_user_status_idx` ON `roadmap_tasks` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `roadmap_tasks_phase_order_unique` ON `roadmap_tasks` (`phase_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `skill_gaps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`career_goal_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`current_level` text,
	`required_level` text NOT NULL,
	`severity` text NOT NULL,
	`priority` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`identified_at` integer DEFAULT (unixepoch()) NOT NULL,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`career_goal_id`) REFERENCES `career_goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `skill_gaps_user_idx` ON `skill_gaps` (`user_id`);--> statement-breakpoint
CREATE INDEX `skill_gaps_goal_idx` ON `skill_gaps` (`career_goal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `skill_gaps_goal_skill_unique` ON `skill_gaps` (`career_goal_id`,`skill_id`);--> statement-breakpoint
CREATE TABLE `student_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`repo_url` text,
	`notes` text,
	`roadmap_task_id` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`roadmap_task_id`) REFERENCES `roadmap_tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `student_projects_user_idx` ON `student_projects` (`user_id`);--> statement-breakpoint
CREATE INDEX `student_projects_user_status_idx` ON `student_projects` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `task_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`roadmap_id` text NOT NULL,
	`phase_id` text NOT NULL,
	`time_spent_minutes` integer DEFAULT 0 NOT NULL,
	`completion_percent` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`last_accessed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `roadmap_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`roadmap_id`) REFERENCES `career_roadmaps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`phase_id`) REFERENCES `roadmap_phases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_progress_user_idx` ON `task_progress` (`user_id`);--> statement-breakpoint
CREATE INDEX `task_progress_roadmap_idx` ON `task_progress` (`roadmap_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_progress_task_unique` ON `task_progress` (`task_id`);--> statement-breakpoint
CREATE TABLE `user_skill_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`previous_level` text,
	`new_level` text NOT NULL,
	`score` integer,
	`source` text NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_skill_history_user_skill_idx` ON `user_skill_history` (`user_id`,`skill_id`);--> statement-breakpoint
CREATE INDEX `user_skill_history_user_created_idx` ON `user_skill_history` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `assessments` ADD `category` text DEFAULT 'skill' NOT NULL;--> statement-breakpoint
ALTER TABLE `career_skill_requirements` ADD `required_level` text DEFAULT 'intermediate' NOT NULL;--> statement-breakpoint
ALTER TABLE `careers` ADD `typical_experience_level` text DEFAULT 'junior' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `employment_type` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `experience_level` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `source` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `external_ref` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `posted_date` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `closing_date` integer;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `specialization` text;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `current_semester` integer;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `preferred_work_location` text;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `profile_completion` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `detected_branch_id` text REFERENCES engineering_branches(id);--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `detected_branch_confidence` integer;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `branch_detection_source` text;--> statement-breakpoint
ALTER TABLE `user_skills` ADD `current_level` text;--> statement-breakpoint
ALTER TABLE `user_skills` ADD `score` integer;--> statement-breakpoint
ALTER TABLE `user_skills` ADD `evidence` text;--> statement-breakpoint
ALTER TABLE `user_skills` ADD `last_assessed_at` integer;