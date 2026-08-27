CREATE INDEX `user_skills_user_idx` ON `user_skills` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_skills_user_skill_unique` ON `user_skills` (`user_id`,`skill_id`);