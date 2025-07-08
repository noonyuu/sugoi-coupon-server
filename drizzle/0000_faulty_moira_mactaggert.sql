CREATE TABLE `todos` (
	`id` integer PRIMARY KEY NOT NULL,
	`store` text NOT NULL,
	`usage_period_start` text,
	`usage_period_end` text,
	`discount` integer DEFAULT 0,
	`discount_type` integer DEFAULT 0,
	`image_path` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
