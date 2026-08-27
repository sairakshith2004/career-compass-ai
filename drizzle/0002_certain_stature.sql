CREATE TABLE `careers` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `careers_slug_unique` ON `careers` (`slug`);--> statement-breakpoint
CREATE TABLE `engineering_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engineering_branches_slug_unique` ON `engineering_branches` (`slug`);--> statement-breakpoint
CREATE TABLE `student_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`degree` text,
	`branch_id` text,
	`college_name` text,
	`country_code` text,
	`current_year` text,
	`graduation_year` integer,
	`experience_level` text,
	`career_goal_status` text,
	`last_completed_step` integer DEFAULT 0 NOT NULL,
	`onboarding_completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`branch_id`) REFERENCES `engineering_branches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `student_profiles_branch_idx` ON `student_profiles` (`branch_id`);--> statement-breakpoint
CREATE INDEX `student_profiles_country_idx` ON `student_profiles` (`country_code`);--> statement-breakpoint
CREATE TABLE `student_target_careers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`career_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`career_id`) REFERENCES `careers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `student_target_careers_user_idx` ON `student_target_careers` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_target_careers_user_career_unique` ON `student_target_careers` (`user_id`,`career_id`);