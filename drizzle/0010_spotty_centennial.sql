ALTER TABLE `student_profiles` ADD `preferred_industries` text;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `preferred_job_types` text;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `preferred_locations` text;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `work_mode` text;--> statement-breakpoint
ALTER TABLE `student_target_careers` ADD `is_primary` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `student_target_careers_user_primary_idx` ON `student_target_careers` (`user_id`,`is_primary`);