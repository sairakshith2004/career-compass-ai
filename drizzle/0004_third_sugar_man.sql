CREATE TABLE `resume_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`resume_id` text NOT NULL,
	`user_id` text NOT NULL,
	`ai_branch_slug` text,
	`ai_branch_confidence` integer,
	`ai_specialization` text,
	`ai_specialization_confidence` integer,
	`ai_experience_level` text,
	`ai_experience_confidence` integer,
	`extracted_name` text,
	`extracted_college` text,
	`extracted_degree` text,
	`extracted_graduation_year` integer,
	`summary` text,
	`project_domains` text,
	`payload` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resume_analyses_resume_idx` ON `resume_analyses` (`resume_id`);--> statement-breakpoint
CREATE INDEX `resume_analyses_user_idx` ON `resume_analyses` (`user_id`);--> statement-breakpoint
CREATE TABLE `resume_career_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`user_id` text NOT NULL,
	`career_id` text,
	`career_title_raw` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`rationale` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `resume_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`career_id`) REFERENCES `careers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `resume_career_signals_analysis_idx` ON `resume_career_signals` (`analysis_id`);--> statement-breakpoint
CREATE INDEX `resume_career_signals_user_idx` ON `resume_career_signals` (`user_id`);--> statement-breakpoint
CREATE TABLE `resume_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`user_id` text NOT NULL,
	`skill_id` text,
	`skill_name_raw` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`evidence_type` text DEFAULT 'claimed' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`evidence` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `resume_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `resume_skills_analysis_idx` ON `resume_skills` (`analysis_id`);--> statement-breakpoint
CREATE INDEX `resume_skills_user_idx` ON `resume_skills` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `resume_skills_analysis_name_unique` ON `resume_skills` (`analysis_id`,`skill_name_raw`);--> statement-breakpoint
ALTER TABLE `resumes` ADD `extracted_text` text;--> statement-breakpoint
ALTER TABLE `resumes` ADD `text_char_count` integer;--> statement-breakpoint
ALTER TABLE `resumes` ADD `error_message` text;--> statement-breakpoint
ALTER TABLE `resumes` ADD `analysis_model` text;--> statement-breakpoint
ALTER TABLE `resumes` ADD `analyzed_at` integer;--> statement-breakpoint
CREATE INDEX `resumes_user_idx` ON `resumes` (`user_id`);