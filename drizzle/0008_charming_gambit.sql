CREATE TABLE `student_interest_areas` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`group_slug` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `student_interest_areas_user_idx` ON `student_interest_areas` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_interest_areas_user_group_unique` ON `student_interest_areas` (`user_id`,`group_slug`);--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `career_notes` text;