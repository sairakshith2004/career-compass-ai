CREATE TABLE `branch_career_paths` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`career_id` text NOT NULL,
	`relevance` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `engineering_branches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`career_id`) REFERENCES `careers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `branch_career_paths_branch_idx` ON `branch_career_paths` (`branch_id`);--> statement-breakpoint
CREATE INDEX `branch_career_paths_career_idx` ON `branch_career_paths` (`career_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `branch_career_paths_branch_career_unique` ON `branch_career_paths` (`branch_id`,`career_id`);--> statement-breakpoint
CREATE TABLE `career_skill_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`career_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`importance` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`career_id`) REFERENCES `careers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `career_skill_requirements_career_idx` ON `career_skill_requirements` (`career_id`);--> statement-breakpoint
CREATE INDEX `career_skill_requirements_skill_idx` ON `career_skill_requirements` (`skill_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `career_skill_requirements_career_skill_unique` ON `career_skill_requirements` (`career_id`,`skill_id`);--> statement-breakpoint
CREATE TABLE `engineering_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engineering_categories_slug_unique` ON `engineering_categories` (`slug`);--> statement-breakpoint
ALTER TABLE `careers` ADD `description` text;--> statement-breakpoint
ALTER TABLE `engineering_branches` ADD `category_id` text REFERENCES engineering_categories(id);--> statement-breakpoint
ALTER TABLE `engineering_branches` ADD `aliases` text;--> statement-breakpoint
ALTER TABLE `engineering_branches` ADD `description` text;--> statement-breakpoint
CREATE INDEX `engineering_branches_category_idx` ON `engineering_branches` (`category_id`);