PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `acl_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`actor_role` text,
	`event_type` text NOT NULL,
	`subject_type` text,
	`subject_id` text,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`outcome` text NOT NULL,
	`detail_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_acl_event_created` ON `acl_events` (`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_acl_event_scope` ON `acl_events` (`scope_type`,`scope_id`);
--> statement-breakpoint
CREATE INDEX `idx_acl_event_subject` ON `acl_events` (`subject_type`,`subject_id`);
--> statement-breakpoint
CREATE INDEX `idx_acl_event_actor` ON `acl_events` (`actor_user_id`);
--> statement-breakpoint
CREATE TABLE `acl_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`principal_type` text NOT NULL,
	`principal_id` text NOT NULL,
	`capability` text NOT NULL,
	`domain_kind` text,
	`domain_value` text,
	`granted_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_acl_grant_unique_scoped_domain` ON `acl_grants` (`scope_type`,`scope_id`,`principal_type`,`principal_id`,`capability`,`domain_kind`,`domain_value`) WHERE "acl_grants"."scope_id" is not null and "acl_grants"."domain_value" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_acl_grant_unique_scoped_capability` ON `acl_grants` (`scope_type`,`scope_id`,`principal_type`,`principal_id`,`capability`) WHERE "acl_grants"."scope_id" is not null and "acl_grants"."domain_value" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_acl_grant_unique_global_domain` ON `acl_grants` (`scope_type`,`principal_type`,`principal_id`,`capability`,`domain_kind`,`domain_value`) WHERE "acl_grants"."scope_id" is null and "acl_grants"."domain_value" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_acl_grant_unique_global_capability` ON `acl_grants` (`scope_type`,`principal_type`,`principal_id`,`capability`) WHERE "acl_grants"."scope_id" is null and "acl_grants"."domain_value" is null;
--> statement-breakpoint
CREATE INDEX `idx_acl_grant_principal` ON `acl_grants` (`principal_type`,`principal_id`);
--> statement-breakpoint
CREATE INDEX `idx_acl_grant_scope` ON `acl_grants` (`scope_type`,`scope_id`);
--> statement-breakpoint
CREATE INDEX `idx_acl_grant_granted_by` ON `acl_grants` (`granted_by`);
--> statement-breakpoint
CREATE TABLE `api_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`narrator_id` text,
	`agent_label` text,
	`message_id` text,
	`kind` text DEFAULT 'narrator' NOT NULL,
	`provider` text,
	`credential_id` text,
	`model` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_input_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_5m_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_1h_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`ttft_ms` integer,
	`duration_ms` integer,
	`cost_usd` real,
	`cost_status` text,
	`cost_missing_fields` text,
	`context_usage_snapshot_json` text,
	`context_percent` real,
	`meter_usage` real,
	`meter_unit` text,
	`error_message` text,
	`raw_dump_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `narrator_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_api_requests_narrator` ON `api_requests` (`narrator_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_api_requests_message` ON `api_requests` (`message_id`);
--> statement-breakpoint
CREATE INDEX `idx_api_requests_provider` ON `api_requests` (`provider`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_api_requests_kind` ON `api_requests` (`kind`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_api_requests_created` ON `api_requests` (`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_api_requests_user_created` ON `api_requests` (`user_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_api_requests_credential` ON `api_requests` (`credential_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `background_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_narrator_id` text NOT NULL,
	`type` text NOT NULL,
	`logical_run_id` text,
	`status` text NOT NULL,
	`command` text,
	`exit_code` integer,
	`subagent_narrator_id` text,
	`subagent_type` text,
	`transfer_task_id` text,
	`tool_use_id` text,
	`tool_call_id` text,
	`execution_attempt` integer,
	`alias` text,
	`title` text,
	`output` text,
	`output_bytes` integer DEFAULT 0 NOT NULL,
	`output_truncated` integer DEFAULT false NOT NULL,
	`notified` integer DEFAULT false NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`parent_narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subagent_narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transfer_task_id`) REFERENCES `device_transfer_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_bg_tasks_parent` ON `background_tasks` (`parent_narrator_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_bg_tasks_subagent` ON `background_tasks` (`subagent_narrator_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bg_tasks_tool_attempt` ON `background_tasks` (`tool_call_id`,`execution_attempt`);
--> statement-breakpoint
CREATE INDEX `idx_bg_tasks_transfer` ON `background_tasks` (`transfer_task_id`);
--> statement-breakpoint
CREATE INDEX `idx_bg_tasks_parent_created` ON `background_tasks` (`parent_narrator_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `benchmark_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_id` text NOT NULL,
	`name` text NOT NULL,
	`model` text NOT NULL,
	`system_prompt` text,
	`permission_mode` text DEFAULT 'bypassPermissions',
	`status` text DEFAULT 'pending' NOT NULL,
	`config` text,
	`total_tasks` integer DEFAULT 0,
	`completed_tasks` integer DEFAULT 0,
	`passed_tasks` integer DEFAULT 0,
	`failed_tasks` integer DEFAULT 0,
	`total_cost_usd` real DEFAULT 0,
	`total_tokens_in` integer DEFAULT 0,
	`total_tokens_out` integer DEFAULT 0,
	`total_duration_ms` integer DEFAULT 0,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`suite_id`) REFERENCES `benchmark_suites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_benchmark_runs_suite` ON `benchmark_runs` (`suite_id`);
--> statement-breakpoint
CREATE TABLE `benchmark_suites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text,
	`description` text,
	`tasks_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `benchmark_task_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`task_id` text NOT NULL,
	`task_name` text NOT NULL,
	`narrator_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`score` real,
	`max_score` real,
	`output` text,
	`eval_output` text,
	`error_message` text,
	`tokens_in` integer DEFAULT 0,
	`tokens_out` integer DEFAULT 0,
	`cost_usd` real DEFAULT 0,
	`duration_ms` integer DEFAULT 0,
	`tool_call_count` integer DEFAULT 0,
	`message_count` integer DEFAULT 0,
	`metadata` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `benchmark_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_task_results_run` ON `benchmark_task_results` (`run_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_task_results_narrator` ON `benchmark_task_results` (`narrator_id`);
--> statement-breakpoint
CREATE TABLE `chapter_commits` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`sha` text NOT NULL,
	`message` text NOT NULL,
	`full_message` text,
	`author_name` text,
	`author_email` text,
	`authored_at` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`narrator_id` text,
	`narrator_message_id` text,
	`files_changed` integer,
	`lines_added` integer,
	`lines_removed` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`narrator_message_id`) REFERENCES `narrator_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chapter_commits_sha` ON `chapter_commits` (`chapter_id`,`sha`);
--> statement-breakpoint
CREATE INDEX `idx_chapter_commits_chapter` ON `chapter_commits` (`chapter_id`,`authored_at`);
--> statement-breakpoint
CREATE INDEX `idx_chapter_commits_narrator` ON `chapter_commits` (`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_chapter_commits_narrator_message` ON `chapter_commits` (`narrator_message_id`);
--> statement-breakpoint
CREATE TABLE `chapter_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`type` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chapter_edges_src_tgt_type` ON `chapter_edges` (`source_id`,`target_id`,`type`);
--> statement-breakpoint
CREATE INDEX `idx_chapter_edges_project` ON `chapter_edges` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_chapter_edges_source` ON `chapter_edges` (`source_id`);
--> statement-breakpoint
CREATE INDEX `idx_chapter_edges_target` ON `chapter_edges` (`target_id`);
--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`role` text DEFAULT 'branch' NOT NULL,
	`branch` text NOT NULL,
	`worktree_path` text,
	`base_branch` text NOT NULL,
	`parent_chapter_id` text,
	`fork_point` text,
	`merged_into_chapter_id` text,
	`merge_commit_sha` text,
	`merge_strategy` text,
	`pre_merge_target_sha` text,
	`merge_snapshot_commit_sha` text,
	`pre_merge_target_snapshot_sha` text,
	`merged_source_snapshot_sha` text,
	`container_config` text,
	`exploration_group_id` text,
	`is_root` integer DEFAULT 0,
	`head_commit_sha` text,
	`start_commit_sha` text,
	`commit_count` integer DEFAULT 0,
	`snapshot_commit_sha` text,
	`snapshot_shadow_key` text,
	`dormant_snapshot_commit_sha` text,
	`parked_snapshot_commit_sha` text,
	`parked_snapshot_base_tree` text,
	`color` text,
	`group_label` text,
	`pinned` integer DEFAULT 0,
	`anchor_commit_sha` text,
	`axis_offset` real DEFAULT 0,
	`cross_offset` real DEFAULT 0,
	`graph_x` real,
	`graph_y` real,
	`panel_expanded` integer DEFAULT 0,
	`panel_width` real,
	`panel_height` real,
	`dock_layout_json` text,
	`detached_panels_json` text,
	`review_source_chapter_id` text,
	`review_status` text,
	`last_accessed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`merged_into_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`exploration_group_id`) REFERENCES `exploration_groups`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`review_source_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_chapters_project` ON `chapters` (`project_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_chapters_parent` ON `chapters` (`parent_chapter_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chapters_project_branch` ON `chapters` (`project_id`,`branch`);
--> statement-breakpoint
CREATE INDEX `idx_chapters_merged_into` ON `chapters` (`merged_into_chapter_id`);
--> statement-breakpoint
CREATE INDEX `idx_chapters_review_source` ON `chapters` (`review_source_chapter_id`);
--> statement-breakpoint
CREATE INDEX `idx_chapters_exploration_group` ON `chapters` (`exploration_group_id`);
--> statement-breakpoint
CREATE INDEX `idx_chapters_snapshot_shadow_key` ON `chapters` (`snapshot_shadow_key`);
--> statement-breakpoint
CREATE INDEX `idx_chapters_worktree_path` ON `chapters` (`worktree_path`);
--> statement-breakpoint
CREATE TABLE `chat_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`message_id` text,
	`uploader_user_id` text,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`media_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`stored_name` text NOT NULL,
	`created_at` text NOT NULL,
	`claimed_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_chat_attachments_message` ON `chat_attachments` (`message_id`);
--> statement-breakpoint
CREATE INDEX `idx_chat_attachments_room_unclaimed` ON `chat_attachments` (`room_id`,`claimed_at`);
--> statement-breakpoint
CREATE INDEX `idx_chat_attachments_uploader` ON `chat_attachments` (`uploader_user_id`);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`seq` integer NOT NULL,
	`sender_user_id` text,
	`sender_share_id` text,
	`sender_guest_name` text,
	`kind` text DEFAULT 'text' NOT NULL,
	`content_text` text NOT NULL,
	`reply_to_message_id` text,
	`reply_to_seq` integer,
	`reply_to_sender_user_id` text,
	`reply_to_guest_name` text,
	`reply_to_preview` text,
	`edited_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sender_share_id`) REFERENCES `narrator_public_shares`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_messages_room_seq` ON `chat_messages` (`room_id`,`seq`);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_sender` ON `chat_messages` (`sender_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_sender_share` ON `chat_messages` (`sender_share_id`);
--> statement-breakpoint
CREATE TABLE `chat_room_members` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_read_seq` integer DEFAULT 0 NOT NULL,
	`last_read_at` text,
	`muted` integer DEFAULT false NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_room_members_room_user` ON `chat_room_members` (`room_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_chat_room_members_user_room` ON `chat_room_members` (`user_id`,`room_id`);
--> statement-breakpoint
CREATE TABLE `chat_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`dm_key` text,
	`narrator_id` text,
	`next_seq` integer DEFAULT 1 NOT NULL,
	`last_message_at` text,
	`last_message_preview` text,
	`last_message_sender_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_rooms_dm_key` ON `chat_rooms` (`dm_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_rooms_narrator` ON `chat_rooms` (`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_chat_rooms_kind_last` ON `chat_rooms` (`kind`,`last_message_at`);
--> statement-breakpoint
CREATE TABLE `container_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text,
	`worktree_resource_id` text,
	`container_id` text,
	`service_name` text NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`host_port` integer,
	`container_port` integer,
	`proxy_label` text,
	`container_ip` text,
	`volume_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worktree_resource_id`) REFERENCES `narrator_worktree_resources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_container_instances_owner" CHECK(("container_instances"."chapter_id" is null) <> ("container_instances"."worktree_resource_id" is null))
);
--> statement-breakpoint
CREATE INDEX `idx_container_instances_chapter` ON `container_instances` (`chapter_id`);
--> statement-breakpoint
CREATE INDEX `idx_container_instances_chapter_service` ON `container_instances` (`chapter_id`,`service_name`);
--> statement-breakpoint
CREATE INDEX `idx_container_instances_container` ON `container_instances` (`container_id`);
--> statement-breakpoint
CREATE INDEX `idx_container_instances_status` ON `container_instances` (`chapter_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_container_instances_resource_service_status` ON `container_instances` (`worktree_resource_id`,`service_name`,`status`);
--> statement-breakpoint
CREATE TABLE `credential_usage_totals` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`credential_id` text NOT NULL,
	`model` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`unpriced_request_count` integer DEFAULT 0 NOT NULL,
	`partial_request_count` integer DEFAULT 0 NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_credential_usage_totals_key` ON `credential_usage_totals` (`provider`,`credential_id`,`model`);
--> statement-breakpoint
CREATE INDEX `idx_credential_usage_totals_credential` ON `credential_usage_totals` (`provider`,`credential_id`);
--> statement-breakpoint
CREATE TABLE `device_transfer_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`direction` text NOT NULL,
	`remote_path` text NOT NULL,
	`local_path` text NOT NULL,
	`recursive` integer DEFAULT false NOT NULL,
	`run_generation` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`files_transferred` integer DEFAULT 0 NOT NULL,
	`bytes_transferred` integer DEFAULT 0 NOT NULL,
	`total_files` integer,
	`total_bytes` integer,
	`current_file` text,
	`error` text,
	`created_by` text,
	`parent_narrator_id` text,
	`tool_use_id` text,
	`alias` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`device_id`) REFERENCES `remote_devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_device_transfer_tasks_device_created` ON `device_transfer_tasks` (`device_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_device_transfer_tasks_status_updated` ON `device_transfer_tasks` (`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_device_transfer_tasks_created_by` ON `device_transfer_tasks` (`created_by`);
--> statement-breakpoint
CREATE INDEX `idx_device_transfer_tasks_parent_narrator` ON `device_transfer_tasks` (`parent_narrator_id`);
--> statement-breakpoint
CREATE TABLE `exploration_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`base_chapter_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`decided_chapter_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_exploration_groups_project` ON `exploration_groups` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_exploration_groups_base_chapter` ON `exploration_groups` (`base_chapter_id`);
--> statement-breakpoint
CREATE INDEX `idx_exploration_groups_decided_chapter` ON `exploration_groups` (`decided_chapter_id`);
--> statement-breakpoint
CREATE TABLE `file_attributions` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text DEFAULT 'local' NOT NULL,
	`workspace_path` text NOT NULL,
	`file_path` text NOT NULL,
	`narrator_id` text,
	`user_id` text,
	`subagent_type` text,
	`action` text NOT NULL,
	`tool_name` text,
	`tool_use_id` text,
	`operation_id` text,
	`effect_id` text,
	`scope_id` text,
	`file_key` text,
	`actor_subject_key` text,
	`actor_snapshot_json` text,
	`attribution_grade` text,
	`lines_added` integer,
	`lines_removed` integer,
	`changed_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`operation_id`) REFERENCES `file_change_operations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`effect_id`) REFERENCES `file_change_effects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`scope_id`) REFERENCES `file_change_scopes`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_file_attr_line_counts" CHECK(
			("file_attributions"."lines_added" IS NULL OR (typeof("file_attributions"."lines_added") = 'integer' AND "file_attributions"."lines_added" >= 0))
			AND ("file_attributions"."lines_removed" IS NULL OR (typeof("file_attributions"."lines_removed") = 'integer' AND "file_attributions"."lines_removed" >= 0))
		)
);
--> statement-breakpoint
CREATE INDEX `idx_file_attr_workspace_file` ON `file_attributions` (`workspace_path`,`file_path`,`changed_at`);
--> statement-breakpoint
CREATE INDEX `idx_file_attr_device_workspace_file` ON `file_attributions` (`device_id`,`workspace_path`,`file_path`,`changed_at`);
--> statement-breakpoint
CREATE INDEX `idx_file_attr_narrator` ON `file_attributions` (`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_file_attr_workspace` ON `file_attributions` (`workspace_path`,`changed_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_file_attr_effect` ON `file_attributions` (`effect_id`);
--> statement-breakpoint
CREATE INDEX `idx_file_attr_operation` ON `file_attributions` (`operation_id`);
--> statement-breakpoint
CREATE INDEX `idx_file_attr_scope_file` ON `file_attributions` (`scope_id`,`file_key`,`changed_at`,`id`);
--> statement-breakpoint
CREATE TABLE `file_change_blob_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`budget_id` text NOT NULL,
	`owner_epoch` text NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`expected_size` integer NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`blob_digest` text,
	`published` integer,
	`created_at` text NOT NULL,
	`settled_at` text,
	FOREIGN KEY (`budget_id`) REFERENCES `file_change_storage_budgets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blob_digest`) REFERENCES `file_change_blobs`(`digest`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_fc_reservation_budget` ON `file_change_blob_reservations` (`budget_id`,`status`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_fc_reservation_owner` ON `file_change_blob_reservations` (`owner_epoch`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_fc_reservation_blob` ON `file_change_blob_reservations` (`blob_digest`);
--> statement-breakpoint
CREATE TABLE `file_change_blobs` (
	`id` text PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`storage_key` text NOT NULL,
	`status` text DEFAULT 'staging' NOT NULL,
	`lease_until` text,
	`gc_generation` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fc_blob_digest` ON `file_change_blobs` (`digest`);
--> statement-breakpoint
CREATE INDEX `idx_fc_blob_gc` ON `file_change_blobs` (`status`,`lease_until`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `file_change_effects` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`journal_seq` integer,
	`scope_id` text NOT NULL,
	`file_key` text NOT NULL,
	`identity_json` text NOT NULL,
	`scope_revision` integer NOT NULL,
	`mutation_id` text NOT NULL,
	`request_digest` text NOT NULL,
	`phase` text NOT NULL,
	`before_state_json` text NOT NULL,
	`intended_after_state_json` text NOT NULL,
	`observed_after_state_json` text NOT NULL,
	`before_blob_digest` text,
	`intended_after_blob_digest` text,
	`observed_after_blob_digest` text,
	`outcome` text DEFAULT 'pending' NOT NULL,
	`settlement` text DEFAULT 'preparing' NOT NULL,
	`attribution_grade` text DEFAULT 'unknown' NOT NULL,
	`attribution_ceiling` text,
	`execution_confirmed` integer DEFAULT false NOT NULL,
	`execution_receipt_json` text,
	`execution_receipt_digest` text,
	`lines_added` integer,
	`lines_removed` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `file_change_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scope_id`) REFERENCES `file_change_scopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`before_blob_digest`) REFERENCES `file_change_blobs`(`digest`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`intended_after_blob_digest`) REFERENCES `file_change_blobs`(`digest`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`observed_after_blob_digest`) REFERENCES `file_change_blobs`(`digest`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fc_effect_mutation` ON `file_change_effects` (`mutation_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fc_effect_operation_file` ON `file_change_effects` (`operation_id`,`file_key`,`phase`);
--> statement-breakpoint
CREATE INDEX `idx_fc_effect_file` ON `file_change_effects` (`scope_id`,`file_key`,`scope_revision`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_fc_effect_pending` ON `file_change_effects` (`settlement`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_fc_effect_before_blob` ON `file_change_effects` (`before_blob_digest`);
--> statement-breakpoint
CREATE INDEX `idx_fc_effect_intended_blob` ON `file_change_effects` (`intended_after_blob_digest`);
--> statement-breakpoint
CREATE INDEX `idx_fc_effect_observed_blob` ON `file_change_effects` (`observed_after_blob_digest`);
--> statement-breakpoint
CREATE TABLE `file_change_execution_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`parent_segment_id` text,
	`source_tool_call_id` text,
	`source_execution_attempt` integer,
	`source_input_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_fc_segment_source` ON `file_change_execution_segments` (`source_tool_call_id`,`source_execution_attempt`);
--> statement-breakpoint
CREATE INDEX `idx_fc_segment_parent` ON `file_change_execution_segments` (`parent_segment_id`);
--> statement-breakpoint
CREATE INDEX `idx_fc_segment_narrator` ON `file_change_execution_segments` (`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_fc_segment_input` ON `file_change_execution_segments` (`narrator_id`,`source_input_id`);
--> statement-breakpoint
CREATE TABLE `file_change_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`journal_seq` integer,
	`execution_segment_id` text,
	`evidence_version` integer DEFAULT 2 NOT NULL,
	`source_instance_id` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`request_digest` text,
	`expected_effect_count` integer,
	`prepared_effect_count` integer DEFAULT 0 NOT NULL,
	`evidence_bytes` integer DEFAULT 0 NOT NULL,
	`settled_effect_count` integer DEFAULT 0 NOT NULL,
	`unresolved_effect_count` integer DEFAULT 0 NOT NULL,
	`tool_call_id` text,
	`tool_use_id` text,
	`background_task_id` text,
	`narrator_id` text,
	`project_id` text,
	`owner_user_id` text,
	`actor_subject_key` text NOT NULL,
	`actor_json` text NOT NULL,
	`initiator_subject_key` text,
	`execution_binding_json` text,
	`execution_outcome` text DEFAULT 'running' NOT NULL,
	`effect_outcome` text DEFAULT 'pending' NOT NULL,
	`settlement` text DEFAULT 'preparing' NOT NULL,
	`attribution_grade` text DEFAULT 'unknown' NOT NULL,
	`coverage` text DEFAULT 'unavailable' NOT NULL,
	`parent_operation_id` text,
	`reason` text,
	`lease_until` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fc_operation_attempt` ON `file_change_operations` (`source_instance_id`,`source_kind`,`source_id`,`attempt`);
--> statement-breakpoint
CREATE INDEX `idx_fc_operation_sequence` ON `file_change_operations` (`source_instance_id`,`journal_seq`);
--> statement-breakpoint
CREATE INDEX `idx_fc_operation_segment` ON `file_change_operations` (`execution_segment_id`,`journal_seq`);
--> statement-breakpoint
CREATE INDEX `idx_fc_operation_narrator` ON `file_change_operations` (`narrator_id`,`started_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_fc_operation_actor` ON `file_change_operations` (`actor_subject_key`,`started_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_fc_operation_pending` ON `file_change_operations` (`settlement`,`updated_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_fc_operation_task` ON `file_change_operations` (`background_task_id`,`attempt`);
--> statement-breakpoint
CREATE INDEX `idx_fc_operation_parent` ON `file_change_operations` (`parent_operation_id`);
--> statement-breakpoint
CREATE TABLE `file_change_rollups` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`file_key` text NOT NULL,
	`actor_subject_key` text NOT NULL,
	`projection_kind` text NOT NULL,
	`attempt_key` text DEFAULT '' NOT NULL,
	`change_count` integer DEFAULT 0 NOT NULL,
	`lines_added` integer DEFAULT 0 NOT NULL,
	`lines_removed` integer DEFAULT 0 NOT NULL,
	`unmeasured_count` integer DEFAULT 0 NOT NULL,
	`has_external_change` integer DEFAULT false NOT NULL,
	`has_imprecise_attribution` integer DEFAULT true NOT NULL,
	`complete` integer DEFAULT false NOT NULL,
	`as_of_revision` integer,
	`last_effect_id` text,
	`head_fingerprint` text,
	`index_fingerprint` text,
	`worktree_fingerprint` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `file_change_scopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_effect_id`) REFERENCES `file_change_effects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fc_rollup_dimension` ON `file_change_rollups` (`scope_id`,`file_key`,`actor_subject_key`,`projection_kind`,`attempt_key`);
--> statement-breakpoint
CREATE INDEX `idx_fc_rollup_actor` ON `file_change_rollups` (`actor_subject_key`,`projection_kind`,`updated_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_fc_rollup_effect` ON `file_change_rollups` (`last_effect_id`);
--> statement-breakpoint
CREATE TABLE `file_change_scope_recoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_lease_id` text,
	`resolution_authority` text DEFAULT 'execution_proven' NOT NULL,
	`maintenance_evidence_json` text,
	`scope_id` text NOT NULL,
	`device_id` text NOT NULL,
	`canonical_root` text NOT NULL,
	`path_flavor` text NOT NULL,
	`recovered_by_user_id` text,
	`effect_decisions_json` text NOT NULL,
	`scope_revision_before` integer NOT NULL,
	`fencing_token_before` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `file_change_scopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recovered_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_fc_scope_recovery_scope` ON `file_change_scope_recoveries` (`scope_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `file_change_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`source_instance_id` text NOT NULL,
	`device_id` text NOT NULL,
	`workspace_instance_id` text NOT NULL,
	`canonical_root` text NOT NULL,
	`display_root` text NOT NULL,
	`path_flavor` text NOT NULL,
	`status` text DEFAULT 'needs_verification' NOT NULL,
	`root_identity_json` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`fencing_token` integer DEFAULT 0 NOT NULL,
	`active_lease_id` text,
	`active_lease_epoch` text,
	`active_lease_started_at` text,
	`active_mutation_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fc_scope_instance` ON `file_change_scopes` (`source_instance_id`,`device_id`,`workspace_instance_id`);
--> statement-breakpoint
CREATE INDEX `idx_fc_scope_root` ON `file_change_scopes` (`source_instance_id`,`device_id`,`canonical_root`);
--> statement-breakpoint
CREATE INDEX `idx_fc_scope_status` ON `file_change_scopes` (`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_fc_scope_active_lease` ON `file_change_scopes` (`device_id`,`active_lease_id`,`canonical_root`);
--> statement-breakpoint
CREATE TABLE `file_change_storage_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`namespace_key` text NOT NULL,
	`status` text DEFAULT 'unverified' NOT NULL,
	`used_bytes` integer DEFAULT 0 NOT NULL,
	`reserved_bytes` integer DEFAULT 0 NOT NULL,
	`quota_bytes` integer NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`reconciled_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fc_storage_namespace` ON `file_change_storage_budgets` (`namespace_key`);
--> statement-breakpoint
CREATE TABLE `file_history_clock` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gateway_session_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`chat_id` text NOT NULL,
	`user_id` text NOT NULL,
	`username` text,
	`narrator_id` text NOT NULL,
	`app_user_id` text,
	`project_id` text,
	`chapter_id` text,
	`last_message_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_gsm_platform_chat_user` ON `gateway_session_mappings` (`platform`,`chat_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_gsm_narrator` ON `gateway_session_mappings` (`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_gsm_app_user` ON `gateway_session_mappings` (`app_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_gsm_chapter` ON `gateway_session_mappings` (`chapter_id`);
--> statement-breakpoint
CREATE INDEX `idx_gsm_project` ON `gateway_session_mappings` (`project_id`);
--> statement-breakpoint
CREATE TABLE `hooks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`event` text NOT NULL,
	`matcher` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`command` text,
	`url` text,
	`headers` text,
	`proxy_mode` text,
	`proxy_url` text,
	`prompt` text,
	`model` text,
	`timeout` integer DEFAULT 30 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_hooks_project` ON `hooks` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_hooks_event` ON `hooks` (`event`,`enabled`);
--> statement-breakpoint
CREATE TABLE `integration_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`principal_type` text NOT NULL,
	`principal_id` text,
	`authority_id` text,
	`credential_type` text,
	`credential_id` text,
	`transport` text NOT NULL,
	`operation_id` text NOT NULL,
	`capability_id` text,
	`resource_type` text,
	`resource_id` text,
	`scope_type` text,
	`scope_id` text,
	`outcome` text NOT NULL,
	`reason_code` text,
	`duration_ms` integer,
	`request_bytes` integer DEFAULT 0 NOT NULL,
	`response_bytes` integer DEFAULT 0 NOT NULL,
	`metadata_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_integration_audit_created` ON `integration_audit_events` (`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_integration_audit_authority` ON `integration_audit_events` (`authority_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_integration_audit_operation` ON `integration_audit_events` (`operation_id`,`outcome`,`created_at`);
--> statement-breakpoint
CREATE TABLE `integration_authorities` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`integration_type` text NOT NULL,
	`integration_id` text NOT NULL,
	`owner_user_id` text,
	`source_grant_id` text,
	`state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`policy_json` text,
	`metadata_json` text,
	`expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revoked_at` text,
	`revoked_reason` text,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_integration_authorities_integration` ON `integration_authorities` (`integration_type`,`integration_id`,`state`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_integration_authorities_owner` ON `integration_authorities` (`owner_user_id`,`state`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_integration_authorities_expiry` ON `integration_authorities` (`state`,`expires_at`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integration_authorities_source_grant` ON `integration_authorities` (`source_grant_id`) WHERE "integration_authorities"."source_grant_id" is not null;
--> statement-breakpoint
CREATE TABLE `integration_capability_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`authority_id` text NOT NULL,
	`capability_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`scope_key` text NOT NULL,
	`constraints_json` text,
	`expires_at` text,
	`revoked_at` text,
	`created_by_type` text NOT NULL,
	`created_by_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`authority_id`) REFERENCES `integration_authorities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integration_capability_grants_active_scope` ON `integration_capability_grants` (`authority_id`,`capability_id`,`scope_key`) WHERE "integration_capability_grants"."revoked_at" is null;
--> statement-breakpoint
CREATE INDEX `idx_integration_capability_grants_authority` ON `integration_capability_grants` (`authority_id`,`capability_id`,`revoked_at`,`expires_at`,`id`);
--> statement-breakpoint
CREATE TABLE `integration_resource_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`authority_type` text NOT NULL,
	`authority_id` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`provision_key` text,
	`metadata_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revoked_at` text,
	`orphaned_at` text,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integration_resource_binding_resource` ON `integration_resource_bindings` (`resource_type`,`resource_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integration_resource_binding_provision` ON `integration_resource_bindings` (`authority_id`,`resource_type`,`provision_key`);
--> statement-breakpoint
CREATE INDEX `idx_integration_resource_binding_authority` ON `integration_resource_bindings` (`authority_type`,`authority_id`,`state`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_integration_resource_binding_source` ON `integration_resource_bindings` (`source_type`,`source_id`,`state`);
--> statement-breakpoint
CREATE INDEX `idx_integration_resource_binding_state_updated` ON `integration_resource_bindings` (`state`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `knowledge_acl_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`actor_role` text,
	`event_type` text NOT NULL,
	`subject_type` text,
	`subject_id` text,
	`target_type` text,
	`target_id` text,
	`detail_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_kacl_events_created` ON `knowledge_acl_events` (`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_kacl_events_subject` ON `knowledge_acl_events` (`subject_type`,`subject_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_kacl_events_target` ON `knowledge_acl_events` (`target_type`,`target_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_kacl_events_actor` ON `knowledge_acl_events` (`actor_user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_kacl_events_type` ON `knowledge_acl_events` (`event_type`,`created_at`);
--> statement-breakpoint
CREATE TABLE `knowledge_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`project_id` text,
	`inherit_project_gate` integer DEFAULT true NOT NULL,
	`default_level` text DEFAULT 'public' NOT NULL,
	`classification_level` text,
	`controlled_tags_json` text,
	`owner_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_kc_project_slug` ON `knowledge_collections` (`project_id`,`slug`);
--> statement-breakpoint
CREATE INDEX `idx_kc_project` ON `knowledge_collections` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_kc_owner_user` ON `knowledge_collections` (`owner_user_id`);
--> statement-breakpoint
CREATE TABLE `knowledge_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text,
	`author_user_id` text NOT NULL,
	`name` text,
	`title` text,
	`target_collection_id` text,
	`base_revision_id` text,
	`keywords_json` text,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`format` text DEFAULT 'markdown' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `knowledge_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_collection_id`) REFERENCES `knowledge_collections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_kd_entry_author` ON `knowledge_drafts` (`entry_id`,`author_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_kd_entry` ON `knowledge_drafts` (`entry_id`);
--> statement-breakpoint
CREATE INDEX `idx_kd_author` ON `knowledge_drafts` (`author_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_kd_target_collection` ON `knowledge_drafts` (`target_collection_id`);
--> statement-breakpoint
CREATE TABLE `knowledge_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`current_revision_id` text,
	`current_content` text,
	`current_keywords` text,
	`tags_json` text,
	`keywords_json` text,
	`metadata_json` text,
	`classification_level` text,
	`controlled_tags_json` text,
	`review_tags_json` text,
	`owner_user_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `knowledge_collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ke_collection_slug` ON `knowledge_entries` (`collection_id`,`slug`);
--> statement-breakpoint
CREATE INDEX `idx_ke_collection` ON `knowledge_entries` (`collection_id`);
--> statement-breakpoint
CREATE INDEX `idx_ke_status` ON `knowledge_entries` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_ke_collection_updated` ON `knowledge_entries` (`collection_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_ke_owner_user` ON `knowledge_entries` (`owner_user_id`);
--> statement-breakpoint
CREATE TABLE `knowledge_entry_links` (
	`id` text PRIMARY KEY NOT NULL,
	`from_entry_id` text NOT NULL,
	`to_entry_id` text NOT NULL,
	`link_type` text NOT NULL,
	`label` text,
	`to_revision_id` text,
	`created_by_user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`from_entry_id`) REFERENCES `knowledge_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_entry_id`) REFERENCES `knowledge_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_revision_id`) REFERENCES `knowledge_revisions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_kelink_entry_from_to_type` ON `knowledge_entry_links` (`from_entry_id`,`to_entry_id`,`link_type`);
--> statement-breakpoint
CREATE INDEX `idx_kelink_from` ON `knowledge_entry_links` (`from_entry_id`);
--> statement-breakpoint
CREATE INDEX `idx_kelink_to` ON `knowledge_entry_links` (`to_entry_id`);
--> statement-breakpoint
CREATE INDEX `idx_kelink_created_by_user` ON `knowledge_entry_links` (`created_by_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_kelink_to_revision` ON `knowledge_entry_links` (`to_revision_id`);
--> statement-breakpoint
CREATE TABLE `knowledge_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text,
	`principal_type` text NOT NULL,
	`principal_id` text NOT NULL,
	`grant_type` text NOT NULL,
	`clearance_level` text,
	`tag_id` text,
	`can_write` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `knowledge_collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `knowledge_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_kgrant_principal` ON `knowledge_grants` (`principal_type`,`principal_id`);
--> statement-breakpoint
CREATE INDEX `idx_kgrant_tag` ON `knowledge_grants` (`tag_id`);
--> statement-breakpoint
CREATE INDEX `idx_kgrant_collection` ON `knowledge_grants` (`collection_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_kgrant_unique_scoped_tagged` ON `knowledge_grants` (`collection_id`,`principal_type`,`principal_id`,`grant_type`,`tag_id`) WHERE "knowledge_grants"."collection_id" is not null and "knowledge_grants"."tag_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_kgrant_unique_scoped_untagged` ON `knowledge_grants` (`collection_id`,`principal_type`,`principal_id`,`grant_type`) WHERE "knowledge_grants"."collection_id" is not null and "knowledge_grants"."tag_id" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_kgrant_unique_global_tagged` ON `knowledge_grants` (`principal_type`,`principal_id`,`grant_type`,`tag_id`) WHERE "knowledge_grants"."collection_id" is null and "knowledge_grants"."tag_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_kgrant_unique_global_untagged` ON `knowledge_grants` (`principal_type`,`principal_id`,`grant_type`) WHERE "knowledge_grants"."collection_id" is null and "knowledge_grants"."tag_id" is null;
--> statement-breakpoint
CREATE TABLE `knowledge_injection_events` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`compact_seq` integer NOT NULL,
	`entry_id` text NOT NULL,
	`entry_revision_id` text,
	`source` text NOT NULL,
	`trigger_message_id` text,
	`trigger_tool_call_id` text,
	`summary` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `knowledge_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_revision_id`) REFERENCES `knowledge_revisions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`trigger_message_id`) REFERENCES `narrator_messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`trigger_tool_call_id`) REFERENCES `narrator_tool_calls`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_kie_cycle_entry` ON `knowledge_injection_events` (`narrator_id`,`compact_seq`,`entry_id`);
--> statement-breakpoint
CREATE INDEX `idx_kie_narrator_cycle` ON `knowledge_injection_events` (`narrator_id`,`compact_seq`);
--> statement-breakpoint
CREATE INDEX `idx_kie_entry` ON `knowledge_injection_events` (`entry_id`);
--> statement-breakpoint
CREATE INDEX `idx_kie_trigger_message` ON `knowledge_injection_events` (`trigger_message_id`);
--> statement-breakpoint
CREATE INDEX `idx_kie_trigger_tool_call` ON `knowledge_injection_events` (`trigger_tool_call_id`);
--> statement-breakpoint
CREATE INDEX `idx_kie_entry_revision` ON `knowledge_injection_events` (`entry_revision_id`);
--> statement-breakpoint
CREATE TABLE `knowledge_levels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rank` integer NOT NULL,
	`label` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_levels_name_unique` ON `knowledge_levels` (`name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_klevel_rank` ON `knowledge_levels` (`rank`);
--> statement-breakpoint
CREATE TABLE `knowledge_pack_activations` (
	`id` text PRIMARY KEY NOT NULL,
	`pack_id` text NOT NULL,
	`narrator_id` text NOT NULL,
	`extract_dir` text NOT NULL,
	`whitelist_dir_id` text,
	`archive_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`released_at` text,
	FOREIGN KEY (`pack_id`) REFERENCES `knowledge_packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_kpackact_narrator` ON `knowledge_pack_activations` (`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_kpackact_pack` ON `knowledge_pack_activations` (`pack_id`);
--> statement-breakpoint
CREATE INDEX `idx_kpackact_narrator_pack_status` ON `knowledge_pack_activations` (`narrator_id`,`pack_id`,`status`);
--> statement-breakpoint
CREATE TABLE `knowledge_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`project_id` text,
	`entry_id` text,
	`classification_level` text,
	`controlled_tags_json` text,
	`owner_user_id` text,
	`archive_format` text NOT NULL,
	`archive_size` integer NOT NULL,
	`archive_hash` text NOT NULL,
	`uncompressed_size` integer,
	`manifest_json` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`entry_id`) REFERENCES `knowledge_entries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_kpack_project_slug` ON `knowledge_packs` (`project_id`,`slug`);
--> statement-breakpoint
CREATE INDEX `idx_kpack_project` ON `knowledge_packs` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_kpack_entry` ON `knowledge_packs` (`entry_id`);
--> statement-breakpoint
CREATE INDEX `idx_kpack_status` ON `knowledge_packs` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_kpack_owner_user` ON `knowledge_packs` (`owner_user_id`);
--> statement-breakpoint
CREATE TABLE `knowledge_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`version` integer NOT NULL,
	`format` text DEFAULT 'markdown' NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`change_note` text,
	`author_user_id` text,
	`base_revision_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `knowledge_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_kr_entry_version` ON `knowledge_revisions` (`entry_id`,`version`);
--> statement-breakpoint
CREATE INDEX `idx_kr_entry` ON `knowledge_revisions` (`entry_id`);
--> statement-breakpoint
CREATE INDEX `idx_kr_author_user` ON `knowledge_revisions` (`author_user_id`);
--> statement-breakpoint
CREATE TABLE `knowledge_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`entry_id` text,
	`collection_id` text,
	`title` text,
	`submitter_user_id` text NOT NULL,
	`base_revision_id` text,
	`proposed_content` text NOT NULL,
	`keywords_json` text,
	`change_note` text,
	`previous_submission_id` text,
	`round` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer_user_id` text,
	`verdict` text,
	`findings_json` text,
	`reviewed_at` text,
	`merged_revision_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `knowledge_drafts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `knowledge_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `knowledge_collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submitter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_ks_entry` ON `knowledge_submissions` (`entry_id`);
--> statement-breakpoint
CREATE INDEX `idx_ks_status` ON `knowledge_submissions` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_ks_submitter` ON `knowledge_submissions` (`submitter_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_ks_entry_created` ON `knowledge_submissions` (`entry_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_ks_status_created` ON `knowledge_submissions` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_ks_reviewer_user` ON `knowledge_submissions` (`reviewer_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_ks_collection` ON `knowledge_submissions` (`collection_id`);
--> statement-breakpoint
CREATE INDEX `idx_ks_draft` ON `knowledge_submissions` (`draft_id`);
--> statement-breakpoint
CREATE TABLE `knowledge_tag_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`builtin` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_tag_types_name_unique` ON `knowledge_tag_types` (`name`);
--> statement-breakpoint
CREATE INDEX `idx_ktagtype_sort` ON `knowledge_tag_types` (`sort_order`);
--> statement-breakpoint
CREATE TABLE `knowledge_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text,
	`type_id` text,
	`name` text NOT NULL,
	`controlled` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `knowledge_collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_id`) REFERENCES `knowledge_tag_types`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ktag_collection_name` ON `knowledge_tags` (`collection_id`,`name`);
--> statement-breakpoint
CREATE INDEX `idx_ktag_controlled` ON `knowledge_tags` (`controlled`);
--> statement-breakpoint
CREATE INDEX `idx_ktag_type` ON `knowledge_tags` (`type_id`);
--> statement-breakpoint
CREATE TABLE `merge_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`target_chapter_id` text NOT NULL,
	`source_chapter_ids` text NOT NULL,
	`strategy` text DEFAULT 'merge' NOT NULL,
	`status` text NOT NULL,
	`current_index` integer DEFAULT 0 NOT NULL,
	`merged_count` integer DEFAULT 0 NOT NULL,
	`current_source_chapter_id` text,
	`conflict_files` text,
	`pre_merge_tree` text,
	`conflict_tree` text,
	`pre_merge_target_snapshot` text,
	`merge_source_snapshot` text,
	`pre_merge_target_sha` text,
	`error` text,
	`locale` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`target_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_merge_sessions_target_chapter` ON `merge_sessions` (`target_chapter_id`);
--> statement-breakpoint
CREATE TABLE `narrator_blacklist_cmds` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`pattern` text NOT NULL,
	`deny_prompt` text,
	`enabled` integer DEFAULT true NOT NULL,
	`target_kind` text,
	`target_value` text,
	`device_scope` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_blacklist_cmds_narrator` ON `narrator_blacklist_cmds` (`narrator_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_blacklist_cmds_narrator_pattern_unscoped` ON `narrator_blacklist_cmds` (`narrator_id`,`pattern`) WHERE "narrator_blacklist_cmds"."device_scope" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_blacklist_cmds_narrator_pattern_scoped` ON `narrator_blacklist_cmds` (`narrator_id`,`pattern`,`device_scope`) WHERE "narrator_blacklist_cmds"."device_scope" is not null;
--> statement-breakpoint
CREATE TABLE `narrator_blacklist_dirs` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`path` text NOT NULL,
	`path_flavor` text,
	`path_key` text,
	`deny_level` text DEFAULT 'denyAll' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`target_kind` text,
	`target_value` text,
	`device_scope` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_blacklist_dirs_narrator` ON `narrator_blacklist_dirs` (`narrator_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_blacklist_dirs_narrator_path_unscoped` ON `narrator_blacklist_dirs` (`narrator_id`,`path`) WHERE "narrator_blacklist_dirs"."device_scope" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_blacklist_dirs_narrator_path_scoped` ON `narrator_blacklist_dirs` (`narrator_id`,`path`,`device_scope`) WHERE "narrator_blacklist_dirs"."device_scope" is not null;
--> statement-breakpoint
CREATE TABLE `narrator_buffered_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`text` text NOT NULL,
	`images_json` text,
	`command_text` text,
	`bash_command` text,
	`created_by` text,
	`creator_json` text,
	`text_file_paths_json` text,
	`file_references_json` text,
	`priority` integer DEFAULT false NOT NULL,
	`seq` integer NOT NULL,
	`buffered_at` text NOT NULL,
	`kind` text DEFAULT 'user_input' NOT NULL,
	`notice_kind` text,
	`envelope_version` integer DEFAULT 1 NOT NULL,
	`metadata_json` text,
	`source_narrator_id` text,
	`source_tool_call_id` text,
	`source_attempt` integer,
	`source_key` text,
	`dedupe_key` text,
	`delivery_id` text,
	`recipient_message_id` text,
	`recipient_ref_id` text,
	`current_message_id` text,
	`content_revision` integer DEFAULT 1 NOT NULL,
	`adopted_revision` integer,
	`adopted_at` text,
	`current_revision` integer DEFAULT 1 NOT NULL,
	`current_adopted_revision` integer,
	`current_adopted_at` text,
	`receipt_disposition` text DEFAULT 'active' NOT NULL,
	`arrival_seq` integer,
	`state` text DEFAULT 'queued' NOT NULL,
	`claim_token` text,
	`claim_epoch` text,
	`claimed_at` text,
	`claim_attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`byte_size` integer DEFAULT 0 NOT NULL,
	`projected_byte_size` integer DEFAULT 0 NOT NULL,
	`payload_ref_json` text,
	`dedupe_expires_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_nbm_narrator_seq` ON `narrator_buffered_messages` (`narrator_id`,`seq`);
--> statement-breakpoint
CREATE INDEX `idx_nbm_state_arrival` ON `narrator_buffered_messages` (`narrator_id`,`state`,`arrival_seq`);
--> statement-breakpoint
CREATE INDEX `idx_nbm_claim_recovery` ON `narrator_buffered_messages` (`state`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_nbm_quota` ON `narrator_buffered_messages` (`narrator_id`,`kind`,`notice_kind`,`state`);
--> statement-breakpoint
CREATE INDEX `idx_nbm_legacy` ON `narrator_buffered_messages` (`narrator_id`,`arrival_seq`,`seq`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_nbm_dedupe` ON `narrator_buffered_messages` (`narrator_id`,`dedupe_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_nbm_delivery` ON `narrator_buffered_messages` (`delivery_id`);
--> statement-breakpoint
CREATE INDEX `idx_nbm_ref` ON `narrator_buffered_messages` (`narrator_id`,`recipient_ref_id`);
--> statement-breakpoint
CREATE INDEX `idx_nbm_reserved` ON `narrator_buffered_messages` (`narrator_id`,`recipient_message_id`);
--> statement-breakpoint
CREATE INDEX `idx_nbm_source` ON `narrator_buffered_messages` (`source_narrator_id`,`source_tool_call_id`,`source_attempt`);
--> statement-breakpoint
CREATE TABLE `narrator_context_char_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`generation` text NOT NULL,
	`page` integer NOT NULL,
	`segments_json` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `context_char_pages_generation_page_idx` ON `narrator_context_char_pages` (`narrator_id`,`generation`,`page`);
--> statement-breakpoint
CREATE TABLE `narrator_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`narrator_id` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`file_references_json` text,
	`source_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_narrator_drafts_user_narrator` ON `narrator_drafts` (`user_id`,`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_drafts_narrator` ON `narrator_drafts` (`narrator_id`);
--> statement-breakpoint
CREATE TABLE `narrator_file_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`device_id` text DEFAULT 'local' NOT NULL,
	`file_path` text NOT NULL,
	`original_content` text,
	`original_encoding` text,
	`is_binary` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_file_snapshots_narrator` ON `narrator_file_snapshots` (`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_file_snapshots_device` ON `narrator_file_snapshots` (`device_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_file_snapshots_narrator_device_file` ON `narrator_file_snapshots` (`narrator_id`,`device_id`,`file_path`);
--> statement-breakpoint
CREATE TABLE `narrator_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`principal_type` text NOT NULL,
	`principal_id` text NOT NULL,
	`access` text DEFAULT 'read' NOT NULL,
	`granted_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_narrator_grant_unique` ON `narrator_grants` (`narrator_id`,`principal_type`,`principal_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_grant_principal` ON `narrator_grants` (`principal_type`,`principal_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_grant_narrator` ON `narrator_grants` (`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_grant_granted_by` ON `narrator_grants` (`granted_by`);
--> statement-breakpoint
CREATE TABLE `narrator_message_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`message_id` text NOT NULL,
	`seq` integer NOT NULL,
	`is_compact` integer DEFAULT 0 NOT NULL,
	`segment_compact_id` text,
	`injection_consumed_at` integer,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `narrator_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_narrator_refs_unique` ON `narrator_message_refs` (`narrator_id`,`message_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_refs_seq` ON `narrator_message_refs` (`narrator_id`,`seq`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_refs_compact_seq` ON `narrator_message_refs` (`narrator_id`,`is_compact`,`seq`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_refs_message` ON `narrator_message_refs` (`message_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_refs_segment_compact` ON `narrator_message_refs` (`segment_compact_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_refs_narrator_id` ON `narrator_message_refs` (`narrator_id`,`id`);
--> statement-breakpoint
CREATE TABLE `narrator_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`sdk_message_uuid` text,
	`parent_tool_use_id` text,
	`role` text NOT NULL,
	`content_json` text NOT NULL,
	`content_text` text,
	`context_chars_json` text,
	`tokens_in` integer,
	`cost_usd` real,
	`cost_status` text,
	`cost_missing_fields` text,
	`turn_usage_json` text,
	`provider` text,
	`credential_id` text,
	`model` text,
	`output_tokens` integer,
	`cached_input_tokens` integer,
	`cache_creation_input_tokens` integer,
	`cache_creation_5m_tokens` integer,
	`cache_creation_1h_tokens` integer,
	`reasoning_tokens` integer,
	`ttft_ms` integer,
	`duration_ms` integer,
	`context_percent` real,
	`meter_usage` real,
	`meter_unit` text,
	`commit_sha` text,
	`tree_hash_after` text,
	`snapshot_commit_sha` text,
	`command_text` text,
	`created_by` text,
	`origin` text,
	`origin_label` text,
	`edited_at` text,
	`edited_by` text,
	`original_content_json` text,
	`compact_pending` integer GENERATED ALWAYS AS ((CASE WHEN json_extract("content_json", '$[0].type') = 'compact' AND (json_extract("content_json", '$[0].status') IN ('compacting', 'running') OR json_extract("content_json", '$[0].attempts[#-1].status') = 'running') THEN 1 ELSE 0 END)) VIRTUAL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`edited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_messages_narrator` ON `narrator_messages` (`narrator_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_messages_parent_tool_use_lookup` ON `narrator_messages` (`parent_tool_use_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_messages_parent_tool_use` ON `narrator_messages` (`narrator_id`,`parent_tool_use_id`);
--> statement-breakpoint
CREATE INDEX `idx_messages_toplevel` ON `narrator_messages` (`narrator_id`,`parent_tool_use_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_messages_created_by` ON `narrator_messages` (`created_by`);
--> statement-breakpoint
CREATE INDEX `idx_messages_edited_by` ON `narrator_messages` (`edited_by`);
--> statement-breakpoint
CREATE INDEX `idx_messages_compact_pending` ON `narrator_messages` (`compact_pending`) WHERE "compact_pending" = 1;
--> statement-breakpoint
CREATE TABLE `narrator_patches` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`message_id` text NOT NULL,
	`tool_use_id` text NOT NULL,
	`before_hash` text NOT NULL,
	`after_hash` text NOT NULL,
	`files_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `narrator_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_patches_narrator` ON `narrator_patches` (`narrator_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_patches_message` ON `narrator_patches` (`message_id`);
--> statement-breakpoint
CREATE INDEX `idx_patches_tool_use` ON `narrator_patches` (`tool_use_id`);
--> statement-breakpoint
CREATE TABLE `narrator_public_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`guest_name` text NOT NULL,
	`label` text,
	`created_by_user_id` text,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_narrator_public_shares_token_hash` ON `narrator_public_shares` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_public_shares_narrator_created` ON `narrator_public_shares` (`narrator_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_public_shares_created_by` ON `narrator_public_shares` (`created_by_user_id`);
--> statement-breakpoint
CREATE TABLE `narrator_question_events` (
	`question_id` text NOT NULL,
	`message_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`resolution_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `narrator_questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `narrator_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_question_events_question_rowid` ON `narrator_question_events` (`question_id`);
--> statement-breakpoint
CREATE INDEX `idx_question_events_question_created` ON `narrator_question_events` (`question_id`,`created_at`,`message_id`);
--> statement-breakpoint
CREATE TABLE `narrator_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	`tool_use_id` text NOT NULL,
	`questions_json` text NOT NULL,
	`context` text,
	`resolution_json` text,
	`withdraw_reason` text,
	`summary_json` text,
	`execution_principal_json` text,
	`answers_json` text,
	`annotations_json` text,
	`status` text DEFAULT 'open' NOT NULL,
	`origin` text DEFAULT 'agent_async' NOT NULL,
	`answer_message_id` text,
	`decided_by` text,
	`decided_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tool_call_id`) REFERENCES `narrator_tool_calls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_narrator_questions_tool_call` ON `narrator_questions` (`tool_call_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_questions_narrator_status` ON `narrator_questions` (`narrator_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_questions_answer_message` ON `narrator_questions` (`answer_message_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_questions_created` ON `narrator_questions` (`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `narrator_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`message_id` text NOT NULL,
	`tool_use_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`input_json` text,
	`output_json` text,
	`input_chars` integer DEFAULT 0 NOT NULL,
	`output_chars` integer DEFAULT 0 NOT NULL,
	`execution_device_id` text,
	`execution_cwd` text,
	`execution_path_flavor` text,
	`resolved_file_path` text,
	`canonical_file_path` text,
	`runtime_generation` integer,
	`execution_targets_json` text,
	`device_selection_source` text,
	`status` text DEFAULT 'initializing' NOT NULL,
	`duration_ms` integer,
	`stream_started_at` text,
	`stream_completed_at` text,
	`permission_started_at` text,
	`execution_started_at` text,
	`completed_at` text,
	`started_at` text GENERATED ALWAYS AS (coalesce("execution_started_at", "permission_started_at", "stream_started_at", "created_at")) VIRTUAL,
	`error_message` text,
	`permission_decided_by` text,
	`permission_decided_at` text,
	`permission_deny_message` text,
	`permission_decision_reason` text,
	`permission_suggestions` text,
	`is_background` integer DEFAULT false NOT NULL,
	`execution_identity_version` integer DEFAULT 0 NOT NULL,
	`execution_origin_tool_call_id` text,
	`execution_attempt` integer DEFAULT 0 NOT NULL,
	`execution_segment_id` text,
	`file_change_operation_id` text,
	`is_file_history_checkpoint` integer DEFAULT false NOT NULL,
	`tree_hash_before` text,
	`tree_hash_after` text,
	`owned_paths_json` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_5m_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_1h_tokens` integer DEFAULT 0 NOT NULL,
	`input_cost` real DEFAULT 0 NOT NULL,
	`output_cost` real DEFAULT 0 NOT NULL,
	`cache_creation_cost` real DEFAULT 0 NOT NULL,
	`cache_read_cost` real DEFAULT 0 NOT NULL,
	`total_cost` real DEFAULT 0 NOT NULL,
	`cost_status` text,
	`cost_missing_fields` text,
	`provider` text,
	`model` text,
	`result_message_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `narrator_messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_change_operation_id`) REFERENCES `file_change_operations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_toolcalls_message` ON `narrator_tool_calls` (`message_id`);
--> statement-breakpoint
CREATE INDEX `idx_toolcalls_context_id` ON `narrator_tool_calls` (`message_id`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_toolcalls_context_order` ON `narrator_tool_calls` (`message_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_toolcalls_context_latest` ON `narrator_tool_calls` (`message_id`,`tool_use_id`,`execution_attempt`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_toolcalls_tool_use_id` ON `narrator_tool_calls` (`tool_use_id`);
--> statement-breakpoint
CREATE INDEX `idx_toolcalls_execution_device` ON `narrator_tool_calls` (`execution_device_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_toolcalls_status` ON `narrator_tool_calls` (`narrator_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_toolcalls_status_narrator_created` ON `narrator_tool_calls` (`status`,`narrator_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_toolcalls_created` ON `narrator_tool_calls` (`narrator_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_toolcalls_attempt` ON `narrator_tool_calls` (`narrator_id`,`tool_use_id`,`message_id`,`execution_attempt`);
--> statement-breakpoint
CREATE INDEX `idx_toolcalls_file_change_operation` ON `narrator_tool_calls` (`file_change_operation_id`);
--> statement-breakpoint
CREATE INDEX `idx_toolcalls_started_at` ON `narrator_tool_calls` (`started_at`,`id`);
--> statement-breakpoint
CREATE TABLE `narrator_tool_continuations` (
	`id` text PRIMARY KEY NOT NULL,
	`tool_call_id` text NOT NULL,
	`narrator_id` text NOT NULL,
	`update_epoch` text NOT NULL,
	`kind` text NOT NULL,
	`state` text DEFAULT 'paused' NOT NULL,
	`payload_json` text,
	`deadline_at` text,
	`claim_token` text,
	`claimed_at` text,
	`error_message` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tool_call_id`) REFERENCES `narrator_tool_calls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tool_continuations_tool_call` ON `narrator_tool_continuations` (`tool_call_id`);
--> statement-breakpoint
CREATE INDEX `idx_tool_continuations_epoch_state` ON `narrator_tool_continuations` (`update_epoch`,`state`);
--> statement-breakpoint
CREATE INDEX `idx_tool_continuations_narrator_state` ON `narrator_tool_continuations` (`narrator_id`,`state`);
--> statement-breakpoint
CREATE TABLE `narrator_whitelist_cmds` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`pattern` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`target_kind` text,
	`target_value` text,
	`device_scope` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_whitelist_cmds_narrator` ON `narrator_whitelist_cmds` (`narrator_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_whitelist_cmds_narrator_pattern_unscoped` ON `narrator_whitelist_cmds` (`narrator_id`,`pattern`) WHERE "narrator_whitelist_cmds"."device_scope" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_whitelist_cmds_narrator_pattern_scoped` ON `narrator_whitelist_cmds` (`narrator_id`,`pattern`,`device_scope`) WHERE "narrator_whitelist_cmds"."device_scope" is not null;
--> statement-breakpoint
CREATE TABLE `narrator_whitelist_dirs` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`path` text NOT NULL,
	`path_flavor` text,
	`path_key` text,
	`access_level` text DEFAULT 'readOnly' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`target_kind` text,
	`target_value` text,
	`device_scope` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_whitelist_dirs_narrator` ON `narrator_whitelist_dirs` (`narrator_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_whitelist_dirs_narrator_path_unscoped` ON `narrator_whitelist_dirs` (`narrator_id`,`path`) WHERE "narrator_whitelist_dirs"."device_scope" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_whitelist_dirs_narrator_path_scoped` ON `narrator_whitelist_dirs` (`narrator_id`,`path`,`device_scope`) WHERE "narrator_whitelist_dirs"."device_scope" is not null;
--> statement-breakpoint
CREATE TABLE `narrator_worktree_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_narrator_id` text,
	`scope_kind` text DEFAULT 'unknown' NOT NULL,
	`scope_project_id` text,
	`scope_owner_user_id` text,
	`ownership_revision` integer DEFAULT 0 NOT NULL,
	`container_config` text,
	`device_id` text NOT NULL,
	`repository_key` text NOT NULL,
	`worktree_path` text NOT NULL,
	`state` text NOT NULL,
	`create_request_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`owner_narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`scope_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`scope_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_worktree_resource_scope_kind" CHECK("narrator_worktree_resources"."scope_kind" in ('unknown', 'standalone', 'project')),
	CONSTRAINT "ck_worktree_resource_scope_project" CHECK("narrator_worktree_resources"."scope_project_id" is null or "narrator_worktree_resources"."scope_kind" = 'project'),
	CONSTRAINT "ck_worktree_resource_revision" CHECK("narrator_worktree_resources"."ownership_revision" >= 0),
	CONSTRAINT "ck_worktree_resource_config_bytes" CHECK("narrator_worktree_resources"."container_config" is null or length(cast("narrator_worktree_resources"."container_config" as blob)) <= 16384)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_narrator_worktree_resource_path` ON `narrator_worktree_resources` (`device_id`,`worktree_path`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_worktree_resource_owner` ON `narrator_worktree_resources` (`owner_narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_worktree_resource_scope_project` ON `narrator_worktree_resources` (`scope_project_id`);
--> statement-breakpoint
CREATE INDEX `idx_worktree_resource_scope_owner` ON `narrator_worktree_resources` (`scope_owner_user_id`);
--> statement-breakpoint
CREATE TABLE `narrators` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text,
	`scheduled_task_id` text,
	`api_conversation_id` text,
	`logical_run_id` text,
	`inbox_sequence` integer DEFAULT 0 NOT NULL,
	`next_seq` integer DEFAULT 0 NOT NULL,
	`fork_message_id` text,
	`type` text DEFAULT 'primary' NOT NULL,
	`subagent_type` text,
	`title` text,
	`inherit_mode` text DEFAULT 'fresh' NOT NULL,
	`parent_narrator_id` text,
	`origin_tool_call_id` text,
	`subagent_origin_kind` text,
	`context_summary` text,
	`context_summary_chars` integer DEFAULT 0 NOT NULL,
	`context_system_chars` integer DEFAULT 0 NOT NULL,
	`context_tools_chars` integer DEFAULT 0 NOT NULL,
	`context_char_revision` integer DEFAULT 0 NOT NULL,
	`context_usage_snapshot_json` text,
	`context_char_cache_json` text,
	`model` text DEFAULT 'claude-sonnet-4.5',
	`pending_model_restore` text,
	`system_prompt` text,
	`permission_mode` text DEFAULT 'default',
	`previous_permission_mode` text,
	`plan_file_id` text,
	`reasoning_effort` text,
	`fast_mode` integer DEFAULT false NOT NULL,
	`fast_mode_override` text DEFAULT 'inherit' NOT NULL,
	`relaxed_plan` integer DEFAULT false NOT NULL,
	`plan_reflection_auto_approve_override` text DEFAULT 'inherit' NOT NULL,
	`danger_reflection_override` text DEFAULT 'inherit' NOT NULL,
	`auto_continuation_override` text DEFAULT 'inherit' NOT NULL,
	`behavior_fence_interval_override` integer,
	`tasks_reminder_interval_override` integer,
	`behavior_fence_attach_override` text DEFAULT 'inherit' NOT NULL,
	`message_count` integer DEFAULT 0,
	`total_cost_usd` real DEFAULT 0,
	`last_message_at` text,
	`last_stop_reason` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`substatus` text DEFAULT '[]' NOT NULL,
	`plan_mode` integer DEFAULT false NOT NULL,
	`cwd` text,
	`workspace_revision` integer DEFAULT 0 NOT NULL,
	`workspace_context` text,
	`error_message` text,
	`error_retryable` integer,
	`refs_inherited_from` text,
	`refs_backfill_cursor` integer,
	`enabled_tools` text,
	`variant` text DEFAULT 'primary' NOT NULL,
	`traits` text DEFAULT '[]' NOT NULL,
	`handle` text,
	`handle_fold` text,
	`is_background` integer DEFAULT false NOT NULL,
	`background_status` text,
	`background_result` text,
	`background_completed_at` text,
	`is_ask_in_passing` integer DEFAULT false NOT NULL,
	`turn_started_at` text,
	`message_version` integer DEFAULT 0 NOT NULL,
	`message_structure_version` integer DEFAULT 0 NOT NULL,
	`default_device_id` text,
	`oauth_owner_grant_id` text,
	`oauth_provision_key` text,
	`context_project_id` text,
	`oauth_policy_snapshot_json` text,
	`avatar_image_id` text,
	`owner_user_id` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`write_audience` text DEFAULT 'owner' NOT NULL,
	`acl_root_narrator_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scheduled_task_id`) REFERENCES `scheduled_tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`fork_message_id`) REFERENCES `narrator_messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`refs_inherited_from`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`oauth_owner_grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`context_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`acl_root_narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_narrators_scheduled_task_created` ON `narrators` (`scheduled_task_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_chapter` ON `narrators` (`chapter_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_parent` ON `narrators` (`parent_narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_origin_tool_call` ON `narrators` (`origin_tool_call_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_owner` ON `narrators` (`owner_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_visibility` ON `narrators` (`visibility`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_write_audience` ON `narrators` (`write_audience`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_acl_root` ON `narrators` (`acl_root_narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_variant_updated` ON `narrators` (`variant`,`updated_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_handle` ON `narrators` (`handle`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_narrators_handle_fold` ON `narrators` (`handle_fold`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_context_project` ON `narrators` (`context_project_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_oauth_owner` ON `narrators` (`oauth_owner_grant_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_narrators_oauth_provision` ON `narrators` (`oauth_owner_grant_id`,`oauth_provision_key`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_fork_message` ON `narrators` (`fork_message_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrators_refs_inherited_from` ON `narrators` (`refs_inherited_from`) WHERE "refs_inherited_from" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_narrators_background_parent_created` ON `narrators` (`parent_narrator_id`,`created_at`,`id`) WHERE "is_background" = 1;
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`project_id` text,
	`chapter_id` text,
	`narrator_id` text,
	`title` text NOT NULL,
	`preview` text DEFAULT '' NOT NULL,
	`link_json` text NOT NULL,
	`source_key` text NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notifications_user_kind_source` ON `notifications` (`user_id`,`kind`,`source_key`);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user_created` ON `notifications` (`user_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user_status_created` ON `notifications` (`user_id`,`status`,`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `oauth_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`client_id` text NOT NULL,
	`oauth_client_id` text,
	`grant_id` text,
	`user_id` text NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`expires_at` text NOT NULL,
	`refresh_token_hash` text,
	`refresh_expires_at` text,
	`refresh_family_id` text,
	`refresh_family_expires_at` text,
	`refresh_family_revoked_at` text,
	`refresh_parent_token_id` text,
	`refresh_replaced_by_token_id` text,
	`refresh_used_at` text,
	`refresh_reuse_detected_at` text,
	`last_used_at` text,
	`revoked_at` text,
	`revoked_by_user_id` text,
	`revoked_by_type` text,
	`revoked_reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`oauth_client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_oauth_access_tokens_token_hash` ON `oauth_access_tokens` (`token_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_oauth_access_tokens_refresh_hash` ON `oauth_access_tokens` (`refresh_token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_access_tokens_client` ON `oauth_access_tokens` (`client_id`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_access_tokens_oauth_client` ON `oauth_access_tokens` (`oauth_client_id`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_access_tokens_grant_revoked` ON `oauth_access_tokens` (`grant_id`,`revoked_at`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_access_tokens_refresh_family` ON `oauth_access_tokens` (`refresh_family_id`,`revoked_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_oauth_access_tokens_refresh_parent` ON `oauth_access_tokens` (`refresh_parent_token_id`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_access_tokens_user` ON `oauth_access_tokens` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_access_tokens_revoked_by_user` ON `oauth_access_tokens` (`revoked_by_user_id`);
--> statement-breakpoint
CREATE TABLE `oauth_authorization_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`client_id` text NOT NULL,
	`oauth_client_id` text,
	`grant_id` text,
	`user_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`code_challenge` text NOT NULL,
	`code_challenge_method` text DEFAULT 'S256' NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`oauth_client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_oauth_authorization_codes_code_hash` ON `oauth_authorization_codes` (`code_hash`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_authorization_codes_client` ON `oauth_authorization_codes` (`client_id`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_authorization_codes_oauth_client` ON `oauth_authorization_codes` (`oauth_client_id`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_authorization_codes_grant` ON `oauth_authorization_codes` (`grant_id`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_authorization_codes_user` ON `oauth_authorization_codes` (`user_id`);
--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`redirect_uris` text DEFAULT '[]' NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`grant_types` text DEFAULT '["authorization_code","refresh_token"]' NOT NULL,
	`public_client` integer DEFAULT true NOT NULL,
	`policy_json` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	`revoked_by_user_id` text,
	`revoked_reason` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_oauth_clients_client_id` ON `oauth_clients` (`client_id`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_clients_created_by` ON `oauth_clients` (`created_by`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_clients_revoked_by_user` ON `oauth_clients` (`revoked_by_user_id`);
--> statement-breakpoint
CREATE TABLE `oauth_grant_events` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` text,
	`oauth_client_id` text NOT NULL,
	`user_id` text,
	`actor_type` text NOT NULL,
	`actor_user_id` text,
	`event_type` text NOT NULL,
	`requested_scopes` text DEFAULT '[]' NOT NULL,
	`granted_scopes` text DEFAULT '[]' NOT NULL,
	`project_ids` text DEFAULT '[]' NOT NULL,
	`reason` text,
	`metadata` text,
	`ip_address` text,
	`user_agent` text,
	`request_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`oauth_client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_grant_events_grant_created` ON `oauth_grant_events` (`grant_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_grant_events_client_created` ON `oauth_grant_events` (`oauth_client_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_grant_events_user_created` ON `oauth_grant_events` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_grant_events_request` ON `oauth_grant_events` (`request_id`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_grant_events_actor_user` ON `oauth_grant_events` (`actor_user_id`);
--> statement-breakpoint
CREATE TABLE `oauth_grant_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_oauth_grant_projects_grant_project` ON `oauth_grant_projects` (`grant_id`,`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_grant_projects_project` ON `oauth_grant_projects` (`project_id`);
--> statement-breakpoint
CREATE TABLE `oauth_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`oauth_client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`policy_json` text,
	`legacy_unscoped` integer DEFAULT false NOT NULL,
	`consented_at` text,
	`last_token_issued_at` text,
	`last_used_at` text,
	`revoked_at` text,
	`revoked_by_user_id` text,
	`revoked_by_type` text,
	`revoked_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`oauth_client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_oauth_grants_active_user_client` ON `oauth_grants` (`user_id`,`oauth_client_id`) WHERE "oauth_grants"."revoked_at" is null;
--> statement-breakpoint
CREATE INDEX `idx_oauth_grants_client_revoked` ON `oauth_grants` (`oauth_client_id`,`revoked_at`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_grants_user_revoked` ON `oauth_grants` (`user_id`,`revoked_at`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_grants_revoked_by_user` ON `oauth_grants` (`revoked_by_user_id`);
--> statement-breakpoint
CREATE TABLE `oauth_security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`endpoint` text NOT NULL,
	`bucket_type` text NOT NULL,
	`client_id` text,
	`grant_id` text,
	`user_id` text,
	`retry_after_seconds` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_security_events_created` ON `oauth_security_events` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_security_events_type_created` ON `oauth_security_events` (`event_type`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_security_events_user` ON `oauth_security_events` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_security_events_grant` ON `oauth_security_events` (`grant_id`);
--> statement-breakpoint
CREATE TABLE `permission_rule_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	`tool_use_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`proposal_json` text NOT NULL,
	`proposal_hash` text NOT NULL,
	`reason` text NOT NULL,
	`scope` text DEFAULT 'narrator' NOT NULL,
	`device_id` text NOT NULL,
	`context_revision` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`rule_id` text,
	`approval_source` text,
	`approval_user_id` text,
	`reflection_conclusion` text,
	`error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tool_call_id`) REFERENCES `narrator_tool_calls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_permission_rule_request_attempt` ON `permission_rule_requests` (`tool_call_id`,`attempt`);
--> statement-breakpoint
CREATE INDEX `idx_permission_rule_request_narrator_created` ON `permission_rule_requests` (`narrator_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `port_allocations` (
	`port` integer PRIMARY KEY NOT NULL,
	`chapter_id` text,
	`worktree_resource_id` text,
	`service_name` text,
	`allocated_at` text NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worktree_resource_id`) REFERENCES `narrator_worktree_resources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_port_allocations_owner" CHECK("port_allocations"."chapter_id" is null or "port_allocations"."worktree_resource_id" is null)
);
--> statement-breakpoint
CREATE INDEX `idx_port_allocations_chapter` ON `port_allocations` (`chapter_id`);
--> statement-breakpoint
CREATE INDEX `idx_port_allocations_resource` ON `port_allocations` (`worktree_resource_id`);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`flow_mode` text DEFAULT 'classic' NOT NULL,
	`git_path` text,
	`remote_url` text,
	`default_branch` text DEFAULT 'main',
	`startup_script` text,
	`copy_files` text,
	`chapter_settings` text,
	`proxy_domain` text,
	`traits` text DEFAULT '[]' NOT NULL,
	`owner_user_id` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `registration_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`note` text,
	`role` text DEFAULT 'user' NOT NULL,
	`bound_username` text,
	`expires_at` text NOT NULL,
	`created_by_user_id` text,
	`used_at` text,
	`used_by_user_id` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`used_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_registration_codes_code_hash` ON `registration_codes` (`code_hash`);
--> statement-breakpoint
CREATE INDEX `idx_registration_codes_created_by` ON `registration_codes` (`created_by_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_registration_codes_used_by` ON `registration_codes` (`used_by_user_id`);
--> statement-breakpoint
CREATE TABLE `remote_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`connection_mode` text DEFAULT 'reverse' NOT NULL,
	`direct_url` text,
	`status` text DEFAULT 'offline' NOT NULL,
	`last_seen_at` text,
	`platform_os` text,
	`platform_arch` text,
	`shell_path` text,
	`default_cwd` text,
	`agent_version` text,
	`capabilities_json` text,
	`path_rules_json` text,
	`reported_path_rules_json` text,
	`owner_scope` text DEFAULT 'shared' NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`project_id` text,
	`created_by` text NOT NULL,
	`oauth_owner_grant_id` text,
	`oauth_provision_key` text,
	`enrolled_at` text,
	`enrolled_from_ip` text,
	`enrolled_user_agent` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`oauth_owner_grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_devices_slug` ON `remote_devices` (`slug`);
--> statement-breakpoint
CREATE INDEX `idx_remote_devices_status` ON `remote_devices` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_remote_devices_project` ON `remote_devices` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_remote_devices_oauth_owner` ON `remote_devices` (`oauth_owner_grant_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_devices_oauth_provision` ON `remote_devices` (`oauth_owner_grant_id`,`oauth_provision_key`);
--> statement-breakpoint
CREATE TABLE `revert_operation_files` (
	`id` text PRIMARY KEY NOT NULL,
	`revert_operation_id` text NOT NULL,
	`scope_id` text NOT NULL,
	`file_key` text NOT NULL,
	`identity_json` text NOT NULL,
	`sequence` integer NOT NULL,
	`expected_state_json` text NOT NULL,
	`desired_state_json` text NOT NULL,
	`observed_after_state_json` text,
	`before_blob_digest` text,
	`desired_blob_digest` text,
	`observed_after_blob_digest` text,
	`compensation_after_state_json` text,
	`compensation_after_blob_digest` text,
	`apply_mutation_id` text NOT NULL,
	`apply_request_digest` text NOT NULL,
	`compensate_mutation_id` text NOT NULL,
	`compensate_request_digest` text NOT NULL,
	`status` text DEFAULT 'prepared' NOT NULL,
	`receipt_json` text,
	`reason` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`revert_operation_id`) REFERENCES `revert_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scope_id`) REFERENCES `file_change_scopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`before_blob_digest`) REFERENCES `file_change_blobs`(`digest`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`desired_blob_digest`) REFERENCES `file_change_blobs`(`digest`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`observed_after_blob_digest`) REFERENCES `file_change_blobs`(`digest`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`compensation_after_blob_digest`) REFERENCES `file_change_blobs`(`digest`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_revert_file_identity` ON `revert_operation_files` (`revert_operation_id`,`file_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_revert_file_apply` ON `revert_operation_files` (`apply_mutation_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_revert_file_compensate` ON `revert_operation_files` (`compensate_mutation_id`);
--> statement-breakpoint
CREATE INDEX `idx_revert_file_pending` ON `revert_operation_files` (`revert_operation_id`,`status`,`sequence`);
--> statement-breakpoint
CREATE INDEX `idx_revert_file_before_blob` ON `revert_operation_files` (`before_blob_digest`);
--> statement-breakpoint
CREATE INDEX `idx_revert_file_desired_blob` ON `revert_operation_files` (`desired_blob_digest`);
--> statement-breakpoint
CREATE INDEX `idx_revert_file_observed_blob` ON `revert_operation_files` (`observed_after_blob_digest`);
--> statement-breakpoint
CREATE INDEX `idx_revert_file_compensation_blob` ON `revert_operation_files` (`compensation_after_blob_digest`);
--> statement-breakpoint
CREATE TABLE `revert_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`protocol_version` integer DEFAULT 2 NOT NULL,
	`narrator_id` text,
	`project_id` text,
	`requested_by_subject_key` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_digest` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text NOT NULL,
	`selector_kind` text NOT NULL,
	`selector_blob_digest` text,
	`plan_blob_digest` text,
	`history_manifest_blob_digest` text,
	`plan_hash` text,
	`expected_message_version` integer,
	`parent_revert_id` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`file_count` integer DEFAULT 0 NOT NULL,
	`applied_file_count` integer DEFAULT 0 NOT NULL,
	`coverage_complete` integer DEFAULT false NOT NULL,
	`reason` text,
	`expires_at` text NOT NULL,
	`lease_until` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`selector_blob_digest`) REFERENCES `file_change_blobs`(`digest`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_blob_digest`) REFERENCES `file_change_blobs`(`digest`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`history_manifest_blob_digest`) REFERENCES `file_change_blobs`(`digest`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_revert_operation_request` ON `revert_operations` (`requested_by_subject_key`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `idx_revert_operation_narrator` ON `revert_operations` (`narrator_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_revert_operation_pending` ON `revert_operations` (`status`,`updated_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_revert_operation_owner_pending` ON `revert_operations` (`requested_by_subject_key`,`narrator_id`,`project_id`,`status`,`updated_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_revert_operation_parent` ON `revert_operations` (`parent_revert_id`);
--> statement-breakpoint
CREATE INDEX `idx_revert_operation_plan_blob` ON `revert_operations` (`plan_blob_digest`);
--> statement-breakpoint
CREATE INDEX `idx_revert_operation_selector_blob` ON `revert_operations` (`selector_blob_digest`);
--> statement-breakpoint
CREATE INDEX `idx_revert_operation_history_blob` ON `revert_operations` (`history_manifest_blob_digest`);
--> statement-breakpoint
CREATE TABLE `review_conclusions` (
	`id` text PRIMARY KEY NOT NULL,
	`review_chapter_id` text NOT NULL,
	`source_chapter_id` text NOT NULL,
	`verdict` text NOT NULL,
	`findings_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`review_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_review_conclusions_review` ON `review_conclusions` (`review_chapter_id`);
--> statement-breakpoint
CREATE INDEX `idx_review_conclusions_source` ON `review_conclusions` (`source_chapter_id`);
--> statement-breakpoint
CREATE TABLE `runtime_awaited_terminal_consumptions` (
	`producer_kind` text NOT NULL,
	`task_id` text NOT NULL,
	`logical_run_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`consumed_at` text NOT NULL,
	`source_result_ref` text,
	FOREIGN KEY (`recipient_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_runtime_awaited_terminal_run` ON `runtime_awaited_terminal_consumptions` (`producer_kind`,`task_id`,`logical_run_id`,`recipient_id`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_awaited_terminal_recipient` ON `runtime_awaited_terminal_consumptions` (`recipient_id`);
--> statement-breakpoint
CREATE TABLE `runtime_publication_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`producer_kind` text NOT NULL,
	`task_id` text NOT NULL,
	`logical_run_id` text NOT NULL,
	`event_kind` text NOT NULL,
	`recipient_id` text NOT NULL,
	`state` text DEFAULT 'reserved' NOT NULL,
	`arrival_seq` integer,
	`result_ref` text,
	`summary` text,
	`delivery_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_runtime_outbox_event` ON `runtime_publication_outbox` (`producer_kind`,`task_id`,`logical_run_id`,`event_kind`,`recipient_id`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_outbox_order` ON `runtime_publication_outbox` (`recipient_id`,`producer_kind`,`state`,`arrival_seq`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_outbox_recipient` ON `runtime_publication_outbox` (`recipient_id`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_outbox_state` ON `runtime_publication_outbox` (`state`,`id`);
--> statement-breakpoint
CREATE TABLE `scheduled_task_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`narrator_id` text,
	`status` text NOT NULL,
	`error` text,
	`run_context` text NOT NULL,
	`manual` integer DEFAULT false NOT NULL,
	`started_at` text,
	`finished_at` text,
	`duration_ms` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `scheduled_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_task_runs_task` ON `scheduled_task_runs` (`task_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_task_runs_narrator` ON `scheduled_task_runs` (`narrator_id`);
--> statement-breakpoint
CREATE TABLE `scheduled_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`cron_expr` text NOT NULL,
	`timezone` text,
	`prompt` text NOT NULL,
	`system_prompt` text,
	`model` text,
	`permission_mode` text DEFAULT 'bypassPermissions' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`run_context` text DEFAULT 'standalone' NOT NULL,
	`cwd` text,
	`project_id` text,
	`chapter_id` text,
	`narrator_mode` text DEFAULT 'new' NOT NULL,
	`cleanup_policy` text DEFAULT '{"mode":"none"}' NOT NULL,
	`reuse_narrator_id` text,
	`created_by` text,
	`last_run_at` text,
	`next_run_at` text,
	`last_narrator_id` text,
	`last_status` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reuse_narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_tasks_enabled` ON `scheduled_tasks` (`enabled`);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_tasks_next_run` ON `scheduled_tasks` (`enabled`,`next_run_at`);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_tasks_project` ON `scheduled_tasks` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_tasks_created_by` ON `scheduled_tasks` (`created_by`);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_tasks_reuse_narrator` ON `scheduled_tasks` (`reuse_narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_tasks_last_narrator` ON `scheduled_tasks` (`last_narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_tasks_chapter` ON `scheduled_tasks` (`chapter_id`);
--> statement-breakpoint
CREATE TABLE `skill_directory_caches` (
	`id` text PRIMARY KEY NOT NULL,
	`root_kind` text NOT NULL,
	`normalized_root_path` text NOT NULL,
	`skills_json` text NOT NULL,
	`signature_json` text NOT NULL,
	`scanned_at` text NOT NULL,
	`last_accessed_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_skill_dir_cache_root` ON `skill_directory_caches` (`root_kind`,`normalized_root_path`);
--> statement-breakpoint
CREATE INDEX `idx_skill_dir_cache_last_accessed` ON `skill_directory_caches` (`last_accessed_at`);
--> statement-breakpoint
CREATE INDEX `idx_skill_dir_cache_expires` ON `skill_directory_caches` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `snapshot_captures` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`operation_id` text,
	`tree_hash` text,
	`snapshot_commit_sha` text,
	`coverage` text DEFAULT 'unavailable' NOT NULL,
	`temporal_consistency` text DEFAULT 'unknown' NOT NULL,
	`policy_version` integer NOT NULL,
	`ignore_policy_digest` text,
	`manifest_blob_digest` text,
	`omitted_count` integer,
	`reason` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`scope_id`) REFERENCES `file_change_scopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `file_change_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manifest_blob_digest`) REFERENCES `file_change_blobs`(`digest`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_snapshot_capture_scope` ON `snapshot_captures` (`scope_id`,`started_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_snapshot_capture_tree` ON `snapshot_captures` (`scope_id`,`tree_hash`);
--> statement-breakpoint
CREATE INDEX `idx_snapshot_capture_operation` ON `snapshot_captures` (`operation_id`);
--> statement-breakpoint
CREATE INDEX `idx_snapshot_capture_manifest` ON `snapshot_captures` (`manifest_blob_digest`);
--> statement-breakpoint
CREATE TABLE `spec_file_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`namespace_id` text NOT NULL,
	`path` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`parent_revision_id` text,
	`source_tool_use_id` text,
	`source_message_id` text,
	`created_by` text DEFAULT 'assistant' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`namespace_id`) REFERENCES `spec_namespaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_revision_id`) REFERENCES `spec_file_revisions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_message_id`) REFERENCES `narrator_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_spec_file_revisions_namespace_path` ON `spec_file_revisions` (`namespace_id`,`path`);
--> statement-breakpoint
CREATE INDEX `idx_spec_file_revisions_parent` ON `spec_file_revisions` (`parent_revision_id`);
--> statement-breakpoint
CREATE INDEX `idx_spec_file_revisions_source_message` ON `spec_file_revisions` (`source_message_id`);
--> statement-breakpoint
CREATE TABLE `spec_namespace_files` (
	`id` text PRIMARY KEY NOT NULL,
	`namespace_id` text NOT NULL,
	`path` text NOT NULL,
	`revision_id` text,
	`deleted` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`namespace_id`) REFERENCES `spec_namespaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `spec_file_revisions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_spec_namespace_files_namespace_path` ON `spec_namespace_files` (`namespace_id`,`path`);
--> statement-breakpoint
CREATE INDEX `idx_spec_namespace_files_revision` ON `spec_namespace_files` (`revision_id`);
--> statement-breakpoint
CREATE TABLE `spec_namespaces` (
	`id` text PRIMARY KEY NOT NULL,
	`narrator_id` text NOT NULL,
	`forked_from_namespace_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`forked_from_namespace_id`) REFERENCES `spec_namespaces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_spec_namespaces_narrator` ON `spec_namespaces` (`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_spec_namespaces_forked_from` ON `spec_namespaces` (`forked_from_namespace_id`);
--> statement-breakpoint
CREATE TABLE `spec_protected_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`namespace_id` text NOT NULL,
	`text_hash` text NOT NULL,
	`text` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`first_revision_id` text,
	`last_revision_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	`deleted_at` text,
	FOREIGN KEY (`namespace_id`) REFERENCES `spec_namespaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`first_revision_id`) REFERENCES `spec_file_revisions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`last_revision_id`) REFERENCES `spec_file_revisions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_spec_protected_tasks_namespace_hash` ON `spec_protected_tasks` (`namespace_id`,`text_hash`);
--> statement-breakpoint
CREATE INDEX `idx_spec_protected_tasks_namespace_status` ON `spec_protected_tasks` (`namespace_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_spec_protected_tasks_first_revision` ON `spec_protected_tasks` (`first_revision_id`);
--> statement-breakpoint
CREATE INDEX `idx_spec_protected_tasks_last_revision` ON `spec_protected_tasks` (`last_revision_id`);
--> statement-breakpoint
CREATE TABLE `terminal_view_state` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`chapter_id` text,
	`narrator_id` text,
	`worktree_resource_id` text,
	`layout` text DEFAULT 'single' NOT NULL,
	`active_tab_id` text,
	`panel_assignments` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worktree_resource_id`) REFERENCES `narrator_worktree_resources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_view_state_resource_owner" CHECK("terminal_view_state"."worktree_resource_id" is null or ("terminal_view_state"."chapter_id" is null and "terminal_view_state"."narrator_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_view_state_user_chapter` ON `terminal_view_state` (`user_id`,`chapter_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_view_state_user_narrator` ON `terminal_view_state` (`user_id`,`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_view_state_chapter` ON `terminal_view_state` (`chapter_id`);
--> statement-breakpoint
CREATE INDEX `idx_view_state_narrator` ON `terminal_view_state` (`narrator_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_view_state_user_resource` ON `terminal_view_state` (`user_id`,`worktree_resource_id`);
--> statement-breakpoint
CREATE INDEX `idx_view_state_resource` ON `terminal_view_state` (`worktree_resource_id`);
--> statement-breakpoint
CREATE TABLE `terminals` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text,
	`narrator_id` text,
	`worktree_resource_id` text,
	`name` text NOT NULL,
	`cwd` text,
	`dtach_socket` text,
	`device_id` text,
	`status` text DEFAULT 'running' NOT NULL,
	`exit_code` integer,
	`graph_opened` integer DEFAULT 0 NOT NULL,
	`graph_x` real,
	`graph_y` real,
	`graph_width` real,
	`graph_height` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worktree_resource_id`) REFERENCES `narrator_worktree_resources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_terminals_resource_owner" CHECK("terminals"."worktree_resource_id" is null or ("terminals"."chapter_id" is null and "terminals"."narrator_id" is null))
);
--> statement-breakpoint
CREATE INDEX `idx_terminals_chapter` ON `terminals` (`chapter_id`,`status`,`graph_opened`);
--> statement-breakpoint
CREATE INDEX `idx_terminals_narrator` ON `terminals` (`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_terminals_status` ON `terminals` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_terminals_resource_status` ON `terminals` (`worktree_resource_id`,`status`,`id`);
--> statement-breakpoint
CREATE TABLE `user_favorite_directories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`path` text NOT NULL,
	`label` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_fav_dirs_user` ON `user_favorite_directories` (`user_id`,`sort_order`);
--> statement-breakpoint
CREATE TABLE `user_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`email` text,
	`display_name` text,
	`last_login_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_identities_provider_subject` ON `user_identities` (`provider`,`subject`);
--> statement-breakpoint
CREATE INDEX `idx_user_identities_user` ON `user_identities` (`user_id`);
--> statement-breakpoint
CREATE TABLE `user_mfa_backup_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mfa_backup_codes_user` ON `user_mfa_backup_codes` (`user_id`);
--> statement-breakpoint
CREATE TABLE `user_passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`device_type` text,
	`backed_up` integer DEFAULT false NOT NULL,
	`name` text,
	`last_used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_passkeys_credential` ON `user_passkeys` (`credential_id`);
--> statement-breakpoint
CREATE INDEX `idx_passkeys_user` ON `user_passkeys` (`user_id`);
--> statement-breakpoint
CREATE TABLE `user_plugin_themes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`theme_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_plugin_themes_unique` ON `user_plugin_themes` (`user_id`,`plugin_id`,`theme_id`);
--> statement-breakpoint
CREATE INDEX `idx_user_plugin_themes_user` ON `user_plugin_themes` (`user_id`);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`auto_load_older_messages` integer DEFAULT true NOT NULL,
	`fast_mode_default` integer DEFAULT false NOT NULL,
	`treat_as_local_access` integer DEFAULT false NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`word_wrap_markdown` integer DEFAULT true NOT NULL,
	`word_wrap_code` integer DEFAULT true NOT NULL,
	`word_wrap_diff` integer DEFAULT true NOT NULL,
	`reply_in_user_language` integer DEFAULT true NOT NULL,
	`show_token_usage` integer DEFAULT false NOT NULL,
	`show_output_stats` integer DEFAULT true NOT NULL,
	`terminal_theme` text DEFAULT 'auto' NOT NULL,
	`terminal_font_size` integer DEFAULT 14 NOT NULL,
	`narrator_font_scale_percent` integer DEFAULT 100 NOT NULL,
	`narrator_letter_spacing_percent` integer DEFAULT 0 NOT NULL,
	`narrator_line_height_scale_percent` integer DEFAULT 100 NOT NULL,
	`narrator_paragraph_scale_percent` integer DEFAULT 100 NOT NULL,
	`recent_tabs` text DEFAULT '[]' NOT NULL,
	`add_subagent_to_recent_tabs` integer DEFAULT true NOT NULL,
	`recent_tabs_group_mode` text DEFAULT 'flat' NOT NULL,
	`notify_on_done` integer DEFAULT true NOT NULL,
	`notify_on_waiting` integer DEFAULT true NOT NULL,
	`notify_pwa_enabled` integer DEFAULT false NOT NULL,
	`notify_sound_enabled` integer DEFAULT true NOT NULL,
	`notify_sound_type` text DEFAULT 'builtin' NOT NULL,
	`notify_sound_builtin` text DEFAULT 'gentle' NOT NULL,
	`notify_sound_file_id` text,
	`notify_sound_volume` integer DEFAULT 100 NOT NULL,
	`notify_sound_max_concurrent` integer DEFAULT 2 NOT NULL,
	`notify_dingtalk_enabled` integer DEFAULT false NOT NULL,
	`notify_dingtalk_webhook` text DEFAULT '' NOT NULL,
	`notify_dingtalk_secret` text DEFAULT '' NOT NULL,
	`notify_feishu_enabled` integer DEFAULT false NOT NULL,
	`notify_feishu_webhook` text DEFAULT '' NOT NULL,
	`notify_feishu_secret` text DEFAULT '' NOT NULL,
	`commands` text DEFAULT '[]' NOT NULL,
	`graph_viewports` text DEFAULT '{}' NOT NULL,
	`queue_mode` text DEFAULT 'turn' NOT NULL,
	`ctrl_enter_queue_mode` text DEFAULT 'tool' NOT NULL,
	`setup_wizard_completed` integer DEFAULT false NOT NULL,
	`gateway_config` text DEFAULT '{}' NOT NULL,
	`nav_layout` text DEFAULT '{}' NOT NULL,
	`narrator_toolbar_layout` text DEFAULT '{}' NOT NULL,
	`traits` text DEFAULT '[]' NOT NULL,
	`tutorial_progress` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_preferences_user_id_unique` ON `user_preferences` (`user_id`);
--> statement-breakpoint
CREATE TABLE `user_recent_tabs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tab_key` text NOT NULL,
	`section` text NOT NULL,
	`type` text NOT NULL,
	`entity_id` text NOT NULL,
	`narrator_id` text,
	`represented_narrator_id` text,
	`parent_narrator_id` text,
	`workspace_id` text,
	`title` text NOT NULL,
	`subtitle` text,
	`status` text,
	`last_visited_at` integer NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`is_scheduled` integer DEFAULT false NOT NULL,
	`sort_order` integer NOT NULL,
	`dir_sort_order` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_recent_tabs_user_key` ON `user_recent_tabs` (`user_id`,`tab_key`);
--> statement-breakpoint
CREATE INDEX `idx_user_recent_tabs_user_section_order` ON `user_recent_tabs` (`user_id`,`section`,`sort_order`,`tab_key`);
--> statement-breakpoint
CREATE INDEX `idx_user_recent_tabs_user_workspace` ON `user_recent_tabs` (`user_id`,`workspace_id`,`sort_order`);
--> statement-breakpoint
CREATE INDEX `idx_user_recent_tabs_narrator` ON `user_recent_tabs` (`represented_narrator_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_user_recent_tabs_entity` ON `user_recent_tabs` (`type`,`entity_id`,`user_id`);
--> statement-breakpoint
CREATE TABLE `user_recent_tabs_meta` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`migrated_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_totp` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`secret` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`activated_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_totp_user` ON `user_totp` (`user_id`);
--> statement-breakpoint
CREATE TABLE `user_usage_totals` (
	`user_id` text PRIMARY KEY NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`unpriced_request_count` integer DEFAULT 0 NOT NULL,
	`partial_request_count` integer DEFAULT 0 NOT NULL,
	`first_used_at` text NOT NULL,
	`last_used_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`token_version` integer DEFAULT 0 NOT NULL,
	`avatar_color` text,
	`avatar_image_id` text,
	`git_username` text,
	`git_email` text,
	`mfa_enabled` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
--> statement-breakpoint
CREATE TABLE `volume_snapshot_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`chapter_id` text,
	`target_worktree_resource_id` text,
	`applied_at` text NOT NULL,
	`applied_by` text,
	FOREIGN KEY (`snapshot_id`) REFERENCES `volume_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_worktree_resource_id`) REFERENCES `narrator_worktree_resources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`applied_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_snapshot_applications_owner" CHECK(("volume_snapshot_applications"."chapter_id" is null) <> ("volume_snapshot_applications"."target_worktree_resource_id" is null))
);
--> statement-breakpoint
CREATE INDEX `idx_snapshot_applications_snapshot` ON `volume_snapshot_applications` (`snapshot_id`);
--> statement-breakpoint
CREATE INDEX `idx_snapshot_applications_chapter` ON `volume_snapshot_applications` (`chapter_id`);
--> statement-breakpoint
CREATE INDEX `idx_snapshot_applications_target_resource` ON `volume_snapshot_applications` (`target_worktree_resource_id`);
--> statement-breakpoint
CREATE TABLE `volume_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`source_chapter_id` text,
	`source_worktree_resource_id` text,
	`service_name` text NOT NULL,
	`container_path` text NOT NULL,
	`size_bytes` integer,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_worktree_resource_id`) REFERENCES `narrator_worktree_resources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_volume_snapshots_project` ON `volume_snapshots` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_volume_snapshots_source_chapter` ON `volume_snapshots` (`source_chapter_id`);
--> statement-breakpoint
CREATE INDEX `idx_volume_snapshots_source_resource` ON `volume_snapshots` (`source_worktree_resource_id`);
--> statement-breakpoint
CREATE TABLE `webauthn_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`type` text NOT NULL,
	`user_id` text,
	`expires_at` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_webauthn_challenge` ON `webauthn_challenges` (`challenge`);
--> statement-breakpoint
CREATE INDEX `idx_webauthn_challenge_expires` ON `webauthn_challenges` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `idx_webauthn_challenge_user` ON `webauthn_challenges` (`user_id`);
--> statement-breakpoint
CREATE TABLE `workspace_execution_owners` (
	`owner_epoch` text PRIMARY KEY NOT NULL,
	`identity_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_panels` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`narrator_id` text,
	`config_json` text,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_panels_workspace` ON `workspace_panels` (`workspace_id`,`sort_order`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_panels_narrator` ON `workspace_panels` (`workspace_id`,`narrator_id`);
--> statement-breakpoint
CREATE INDEX `idx_workspace_panels_narrator_lookup` ON `workspace_panels` (`narrator_id`);
--> statement-breakpoint
CREATE TABLE `workspace_write_leases` (
	`lease_id` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`device_id` text NOT NULL,
	`owner_epoch` text NOT NULL,
	`execution_class` text DEFAULT 'unknown' NOT NULL,
	`runtime_epoch` text NOT NULL,
	`runtime_generation` integer NOT NULL,
	`fencing_token` integer NOT NULL,
	`scope_revision` integer NOT NULL,
	`path_flavor` text NOT NULL,
	`status` text NOT NULL,
	`ranges_json` text NOT NULL,
	`mutation_manifest_json` text NOT NULL,
	`execution_ended_at` text,
	`termination_evidence_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `file_change_scopes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_lease_device_status` ON `workspace_write_leases` (`device_id`,`status`,`lease_id`);
--> statement-breakpoint
CREATE INDEX `idx_workspace_lease_scope` ON `workspace_write_leases` (`scope_id`,`status`,`lease_id`);
--> statement-breakpoint
CREATE INDEX `idx_workspace_lease_cleanup` ON `workspace_write_leases` (`status`,`updated_at`,`lease_id`);
--> statement-breakpoint
CREATE INDEX `idx_workspace_lease_owner` ON `workspace_write_leases` (`owner_epoch`,`lease_id`);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`tree` text NOT NULL,
	`layout_revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workspaces_user` ON `workspaces` (`user_id`);
--> statement-breakpoint
CREATE TABLE `worktree_tree_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text DEFAULT 'local' NOT NULL,
	`worktree_path` text NOT NULL,
	`tree_hash` text NOT NULL,
	`snapshot_commit_sha` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_worktree_tree_snapshots_unique` ON `worktree_tree_snapshots` (`device_id`,`worktree_path`,`tree_hash`);
--> statement-breakpoint
CREATE INDEX `idx_worktree_tree_snapshots_path` ON `worktree_tree_snapshots` (`device_id`,`worktree_path`,`created_at`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
