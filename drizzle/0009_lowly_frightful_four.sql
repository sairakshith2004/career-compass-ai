ALTER TABLE `resumes` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `resumes_status_idx` ON `resumes` (`status`);--> statement-breakpoint
CREATE INDEX `resumes_user_created_idx` ON `resumes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `resumes_user_version_unique` ON `resumes` (`user_id`,`version`);--> statement-breakpoint
CREATE INDEX `resume_analyses_user_created_idx` ON `resume_analyses` (`user_id`,`created_at`);