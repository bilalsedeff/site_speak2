CREATE TABLE "user_activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"resource" varchar(50),
	"resource_id" uuid,
	"ip_address" varchar(45),
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language" varchar(5) DEFAULT 'en' NOT NULL,
	"timezone" varchar(50) DEFAULT 'UTC' NOT NULL,
	"date_format" varchar(20) DEFAULT 'MM/DD/YYYY',
	"time_format" varchar(10) DEFAULT '12h',
	"theme" varchar(10) DEFAULT 'system' NOT NULL,
	"sidebar_collapsed" boolean DEFAULT false,
	"email_notifications" jsonb DEFAULT '{"sitePublished":true,"voiceInteractions":true,"monthlyReports":true,"securityAlerts":true,"productUpdates":false}'::jsonb NOT NULL,
	"push_notifications" jsonb DEFAULT '{"enabled":false,"siteEvents":false,"voiceAlerts":false}'::jsonb NOT NULL,
	"editor_settings" jsonb DEFAULT '{"autoSave":true,"gridSnapping":true,"showGuides":true,"defaultTemplate":"modern","favoriteComponents":[]}'::jsonb NOT NULL,
	"dashboard_layout" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_token" varchar(255) NOT NULL,
	"refresh_token" varchar(255),
	"user_agent" text,
	"ip_address" varchar(45),
	"country" varchar(2),
	"city" varchar(100),
	"expires_at" timestamp with time zone NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(100) NOT NULL,
	"avatar" text,
	"password_hash" varchar(255),
	"email_verified_at" timestamp with time zone,
	"email_verification_token" varchar(255),
	"password_reset_token" varchar(255),
	"password_reset_expires_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"role" varchar(20) DEFAULT 'owner' NOT NULL,
	"tenant_id" uuid NOT NULL,
	"last_login_at" timestamp with time zone,
	"last_login_ip" varchar(45),
	"login_count" jsonb DEFAULT '0'::jsonb,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"default_language" varchar(5) DEFAULT 'en' NOT NULL,
	"default_locale" varchar(10) DEFAULT 'en-US' NOT NULL,
	"allowed_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_domain" varchar(255),
	"custom_domain_verified" boolean DEFAULT false,
	"branding_enabled" boolean DEFAULT false,
	"logo_url" text,
	"primary_color" varchar(7) DEFAULT '#2563eb',
	"secondary_color" varchar(7) DEFAULT '#64748b',
	"sso_enabled" boolean DEFAULT false,
	"sso_provider" varchar(50),
	"sso_config" jsonb DEFAULT '{}'::jsonb,
	"api_enabled" boolean DEFAULT true,
	"api_rate_limit" integer DEFAULT 1000,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"domain" varchar(255),
	"subdomain" varchar(50),
	"plan" varchar(20) DEFAULT 'free' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"max_sites" integer DEFAULT 3 NOT NULL,
	"max_knowledge_base_mb" real DEFAULT 50 NOT NULL,
	"max_ai_tokens_per_month" integer DEFAULT 200000 NOT NULL,
	"max_voice_minutes_per_month" real DEFAULT 30 NOT NULL,
	"current_sites" integer DEFAULT 0 NOT NULL,
	"current_knowledge_base_mb" real DEFAULT 0 NOT NULL,
	"current_ai_tokens_this_month" integer DEFAULT 0 NOT NULL,
	"current_voice_minutes_this_month" real DEFAULT 0 NOT NULL,
	"usage_reset_date" timestamp with time zone DEFAULT now() NOT NULL,
	"stripe_customer_id" varchar(100),
	"stripe_subscription_id" varchar(100),
	"billing_email" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"is_trial_active" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "site_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"version" varchar(50) NOT NULL,
	"environment" varchar(20) DEFAULT 'production' NOT NULL,
	"build_id" varchar(100),
	"build_status" varchar(20) NOT NULL,
	"build_started_at" timestamp with time zone,
	"build_completed_at" timestamp with time zone,
	"build_duration" integer,
	"build_logs" text,
	"preview_url" text,
	"production_url" text,
	"static_assets" jsonb DEFAULT '[]'::jsonb,
	"total_size" integer,
	"lighthouse_score" integer,
	"performance_metrics" jsonb DEFAULT '{}'::jsonb,
	"deployed_by" uuid,
	"commit_hash" varchar(40),
	"deployment_config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"version" varchar(20) DEFAULT '1.0.0' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"structured_data" jsonb DEFAULT '[]'::jsonb,
	"sitemap" jsonb DEFAULT '{}'::jsonb,
	"graphql_schema" text,
	"is_valid" boolean DEFAULT true,
	"validation_errors" jsonb DEFAULT '[]'::jsonb,
	"crawlability_score" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_manifests_site_id_unique" UNIQUE("site_id")
);
--> statement-breakpoint
CREATE TABLE "site_templates" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"category" varchar(30) NOT NULL,
	"version" varchar(20) DEFAULT '1.0.0' NOT NULL,
	"author" varchar(100),
	"license" varchar(50) DEFAULT 'MIT',
	"preview_image" text,
	"thumbnail" text,
	"screenshots" jsonb DEFAULT '[]'::jsonb,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required_features" jsonb DEFAULT '[]'::jsonb,
	"supported_languages" jsonb DEFAULT '["en"]'::jsonb,
	"is_active" boolean DEFAULT true,
	"is_premium" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"usage_count" integer DEFAULT 0,
	"rating" real DEFAULT 5,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"slug" varchar(100) NOT NULL,
	"domain" varchar(255),
	"subdomain" varchar(50),
	"custom_domain" varchar(255),
	"custom_domain_verified" boolean DEFAULT false,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"template_id" varchar(50) NOT NULL,
	"category" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT false,
	"published_at" timestamp with time zone,
	"last_published_at" timestamp with time zone,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seo_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_views" integer DEFAULT 0 NOT NULL,
	"unique_visitors" integer DEFAULT 0 NOT NULL,
	"voice_interactions" integer DEFAULT 0 NOT NULL,
	"last_month_growth" real DEFAULT 0,
	"knowledge_base_id" uuid,
	"last_crawled_at" timestamp with time zone,
	"last_indexed_at" timestamp with time zone,
	"last_indexed_pages" integer DEFAULT 0,
	"knowledge_base_size" real DEFAULT 0,
	"voice_agent_enabled" boolean DEFAULT true,
	"voice_agent_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"build_version" varchar(50),
	"build_size" integer,
	"build_duration" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site_contract_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"change_type" varchar(50) NOT NULL,
	"change_description" text,
	"changed_by" uuid,
	"previous_version" integer,
	"changes_diff" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_contract_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"validation_type" varchar(50) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"component" varchar(100),
	"property" varchar(100),
	"message" text NOT NULL,
	"recommendation" text,
	"rule_name" varchar(100),
	"automated_fix" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "site_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"business_info" jsonb NOT NULL,
	"pages" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"navigation" jsonb NOT NULL,
	"forms" jsonb NOT NULL,
	"jsonld" jsonb,
	"sitemap" jsonb,
	"accessibility" jsonb,
	"seo" jsonb,
	"analytics" jsonb,
	"performance" jsonb,
	"generation_config" jsonb NOT NULL,
	"ai_insights" jsonb,
	"suggestions" jsonb,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"is_archived" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"content_hash" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "crawl_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crawl_session_id" uuid NOT NULL,
	"url" text NOT NULL,
	"url_hash" varchar(64) NOT NULL,
	"title" text,
	"status" varchar(20) NOT NULL,
	"http_status" integer,
	"http_headers" jsonb DEFAULT '{}'::jsonb,
	"content_type" varchar(100),
	"content_length" integer,
	"language" varchar(5),
	"text_content" text,
	"html_content" text,
	"structured_data" jsonb DEFAULT '[]'::jsonb,
	"meta_description" text,
	"meta_keywords" text,
	"og_title" text,
	"og_description" text,
	"og_image" text,
	"internal_links" jsonb DEFAULT '[]'::jsonb,
	"external_links" jsonb DEFAULT '[]'::jsonb,
	"assets" jsonb DEFAULT '[]'::jsonb,
	"load_time" real,
	"size" integer,
	"quality_score" real,
	"error" text,
	"error_details" jsonb DEFAULT '{}'::jsonb,
	"crawled_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"session_type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"start_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_depth" integer DEFAULT 3,
	"max_pages" integer DEFAULT 1000,
	"respect_robots" boolean DEFAULT true,
	"follow_sitemaps" boolean DEFAULT true,
	"pages_discovered" integer DEFAULT 0,
	"pages_crawled" integer DEFAULT 0,
	"pages_skipped" integer DEFAULT 0,
	"pages_failed" integer DEFAULT 0,
	"chunks_created" integer DEFAULT 0,
	"chunks_updated" integer DEFAULT 0,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration" integer,
	"avg_page_time" real,
	"errors" jsonb DEFAULT '[]'::jsonb,
	"warnings" jsonb DEFAULT '[]'::jsonb,
	"crawler_version" varchar(20),
	"crawler_config" jsonb DEFAULT '{}'::jsonb,
	"summary" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_bases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'initializing' NOT NULL,
	"version" varchar(20) DEFAULT '1.0.0' NOT NULL,
	"last_crawled_at" timestamp with time zone,
	"last_indexed_at" timestamp with time zone,
	"next_scheduled_crawl" timestamp with time zone,
	"total_chunks" integer DEFAULT 0 NOT NULL,
	"total_pages" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"size_in_mb" real DEFAULT 0 NOT NULL,
	"avg_chunk_size" integer DEFAULT 0,
	"last_update_duration" integer DEFAULT 0,
	"configuration" jsonb DEFAULT '{"crawlDepth":3,"chunkSize":1000,"chunkOverlap":100,"excludePatterns":[],"includePatterns":["**/*"],"autoReindex":false,"reindexFrequency":"weekly"}'::jsonb NOT NULL,
	"last_error" text,
	"error_count" integer DEFAULT 0,
	"embedding_model" varchar(100) DEFAULT 'text-embedding-3-small',
	"vector_dimensions" integer DEFAULT 1536,
	"index_type" varchar(20) DEFAULT 'hnsw',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_bases_site_id_unique" UNIQUE("site_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"url" text NOT NULL,
	"url_hash" varchar(64) NOT NULL,
	"selector" text,
	"content" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"embedding" vector(1536),
	"parent_chunk_id" uuid,
	"chunk_order" integer DEFAULT 0,
	"chunk_level" integer DEFAULT 0,
	"title" text,
	"description" text,
	"keywords" jsonb DEFAULT '[]'::jsonb,
	"language" varchar(5) DEFAULT 'en' NOT NULL,
	"content_type" varchar(20) DEFAULT 'text' NOT NULL,
	"page_type" varchar(20) DEFAULT 'other',
	"importance" varchar(10) DEFAULT 'medium',
	"last_modified" timestamp with time zone,
	"crawled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"token_count" integer DEFAULT 0,
	"character_count" integer DEFAULT 0,
	"quality_score" real DEFAULT 0.5,
	"readability_score" real DEFAULT 0.5,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_audio_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" uuid,
	"session_id" uuid NOT NULL,
	"filename" varchar(255) NOT NULL,
	"original_filename" varchar(255),
	"file_path" text NOT NULL,
	"file_url" text,
	"audio_type" varchar(20) NOT NULL,
	"format" varchar(10) NOT NULL,
	"duration" real,
	"sample_rate" integer,
	"channels" integer,
	"bitrate" integer,
	"file_size" integer,
	"processed_by" varchar(50),
	"processing_metadata" jsonb DEFAULT '{}'::jsonb,
	"signal_to_noise" real,
	"voice_activity" jsonb DEFAULT '[]'::jsonb,
	"storage_provider" varchar(20) DEFAULT 'local',
	"expires_at" timestamp with time zone,
	"is_temporary" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"turn_id" varchar(100) NOT NULL,
	"type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb,
	"output" jsonb DEFAULT '{}'::jsonb,
	"processing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"detected_intent" varchar(100),
	"intent_confidence" real,
	"entities" jsonb DEFAULT '[]'::jsonb,
	"context" jsonb DEFAULT '{}'::jsonb,
	"tools_called" jsonb DEFAULT '[]'::jsonb,
	"actions_executed" jsonb DEFAULT '[]'::jsonb,
	"user_satisfaction" integer,
	"quality_score" real,
	"error" text,
	"error_details" jsonb DEFAULT '{}'::jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(100) NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" uuid,
	"status" varchar(20) DEFAULT 'initializing' NOT NULL,
	"language" varchar(5) DEFAULT 'en' NOT NULL,
	"locale" varchar(10) DEFAULT 'en-US' NOT NULL,
	"configuration" jsonb DEFAULT '{"sttProvider":"whisper","ttsProvider":"openai","voice":{"name":"alloy","speed":1,"pitch":1,"volume":1},"audio":{"sampleRate":24000,"channels":1,"format":"wav","noiseReduction":true},"behavior":{"interruptible":true,"pauseThreshold":1500,"maxSilence":5000,"confirmationRequired":false}}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_agent" text,
	"ip_address" varchar(45),
	"device" varchar(20),
	"browser" varchar(50),
	"connection_type" varchar(20) DEFAULT 'websocket',
	"microphone_permission" boolean DEFAULT false,
	"speaker_support" boolean DEFAULT true,
	"audio_quality" jsonb DEFAULT '{"inputLevel":0,"outputLevel":0,"latency":0,"jitter":0,"packetLoss":0,"signalToNoise":0}'::jsonb,
	"total_interactions" integer DEFAULT 0,
	"total_duration" integer DEFAULT 0,
	"average_response_time" real DEFAULT 0,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"error_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "voice_widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true,
	"version" varchar(20) DEFAULT '1.0.0',
	"configuration" jsonb DEFAULT '{"position":"bottom-right","size":"medium","activationMethod":"click","autoStart":false,"persistentMode":false}'::jsonb NOT NULL,
	"appearance" jsonb DEFAULT '{"theme":"auto","primaryColor":"#2563eb","secondaryColor":"#64748b","borderRadius":8,"shadow":true,"animation":"pulse","icon":"microphone"}'::jsonb NOT NULL,
	"behavior" jsonb DEFAULT '{"greetingMessage":"Hi! How can I help you today?","placeholder":"Click to start speaking...","showTranscript":true,"showSuggestions":true,"showTyping":true,"minimizable":true,"draggable":false,"fullscreenMode":false,"keyboardShortcuts":true}'::jsonb NOT NULL,
	"analytics" jsonb DEFAULT '{"totalSessions":0,"avgSessionDuration":0,"completionRate":0,"mostUsedFeatures":[],"userFeedback":[],"performanceMetrics":{"avgLoadTime":0,"avgResponseTime":0,"errorRate":0,"uptime":100}}'::jsonb NOT NULL,
	"embed_code" text,
	"widget_url" text,
	"custom_css" text,
	"custom_js" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_widgets_site_id_unique" UNIQUE("site_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"turn_id" uuid,
	"action_name" varchar(100) NOT NULL,
	"action_type" varchar(30) NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb,
	"context" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"error_details" jsonb DEFAULT '{}'::jsonb,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"executed_by" varchar(50),
	"execution_duration" integer,
	"requires_confirmation" boolean DEFAULT false,
	"confirmed" boolean DEFAULT false,
	"confirmation_prompt" text,
	"risk_level" varchar(10) DEFAULT 'low',
	"side_effecting" boolean DEFAULT false,
	"reversible" boolean DEFAULT true,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversation_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"turn_id" uuid,
	"intent" varchar(100) NOT NULL,
	"confidence" real NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb,
	"parameters" jsonb DEFAULT '{}'::jsonb,
	"classifier" varchar(50) DEFAULT 'default',
	"classifier_version" varchar(20),
	"resolved" boolean DEFAULT false,
	"resolution" text,
	"resolution_type" varchar(30),
	"context" jsonb DEFAULT '{}'::jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"turn_number" integer NOT NULL,
	"role" varchar(20) NOT NULL,
	"type" varchar(20) DEFAULT 'message',
	"content" text NOT NULL,
	"original_content" text,
	"input_type" varchar(20),
	"output_type" varchar(20),
	"processing_metadata" jsonb DEFAULT '{"responseTime":null,"tokensUsed":null,"model":null,"confidence":null,"intent":null,"entities":[],"toolsCalled":[],"actionsExecuted":[]}'::jsonb,
	"voice_data" jsonb DEFAULT '{"transcript":null,"confidence":null,"audioUrl":null,"duration":null,"language":null}'::jsonb,
	"sentiment" varchar(15),
	"sentiment_score" real,
	"emotional_tone" varchar(20),
	"context_data" jsonb DEFAULT '{}'::jsonb,
	"state_changes" jsonb DEFAULT '[]'::jsonb,
	"quality_score" real,
	"flagged" boolean DEFAULT false,
	"flag_reason" varchar(100),
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"session_id" varchar(100) NOT NULL,
	"user_id" uuid,
	"voice_session_id" uuid,
	"title" varchar(200),
	"summary" text,
	"language" varchar(5) DEFAULT 'en' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"category" varchar(50),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"priority" varchar(10) DEFAULT 'normal',
	"metadata" jsonb DEFAULT '{"userAgent":null,"referrer":null,"location":null,"device":null,"startPage":null,"currentPage":null}'::jsonb NOT NULL,
	"satisfaction_score" integer,
	"resolved" boolean DEFAULT false,
	"escalated" boolean DEFAULT false,
	"escalated_to" varchar(100),
	"escalation_reason" text,
	"response_time" real,
	"total_turns" integer DEFAULT 0,
	"user_messages" integer DEFAULT 0,
	"assistant_messages" integer DEFAULT 0,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"follow_up_required" boolean DEFAULT false,
	"follow_up_at" timestamp with time zone,
	"follow_up_completed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_interaction_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"conversation_id" uuid,
	"date" date NOT NULL,
	"hour" integer,
	"query" text,
	"query_hash" varchar(64),
	"intent" varchar(100),
	"intent_confidence" real,
	"response_type" varchar(30),
	"response_time" real,
	"response_length" integer,
	"tools_used" jsonb DEFAULT '[]'::jsonb,
	"actions_executed" jsonb DEFAULT '[]'::jsonb,
	"user_satisfaction" integer,
	"conversation_completed" boolean DEFAULT false,
	"goal_achieved" boolean DEFAULT false,
	"escalated" boolean DEFAULT false,
	"tokens_used" integer,
	"cost" real,
	"model" varchar(50),
	"had_error" boolean DEFAULT false,
	"error_type" varchar(50),
	"error_message" text,
	"language" varchar(5),
	"input_type" varchar(20),
	"session_duration" real,
	"turn_number" integer,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" uuid,
	"session_id" varchar(100) NOT NULL,
	"conversation_id" uuid,
	"conversion_type" varchar(50) NOT NULL,
	"conversion_category" varchar(30),
	"conversion_value" real,
	"currency" varchar(3),
	"revenue_type" varchar(20),
	"first_touch_source" varchar(100),
	"last_touch_source" varchar(100),
	"ai_assisted" boolean DEFAULT false,
	"ai_interactions" integer DEFAULT 0,
	"ai_session_duration" real,
	"key_ai_actions" jsonb DEFAULT '[]'::jsonb,
	"funnel_stage" varchar(50),
	"journey_length" integer,
	"time_to_conversion" real,
	"products" jsonb DEFAULT '[]'::jsonb,
	"order_id" varchar(100),
	"transaction_id" varchar(100),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"date" date NOT NULL,
	"period" varchar(10) NOT NULL,
	"largest_contentful_paint" real,
	"first_input_delay" real,
	"cumulative_layout_shift" real,
	"first_contentful_paint" real,
	"time_to_interactive" real,
	"avg_page_load_time" real,
	"avg_dom_content_loaded_time" real,
	"avg_first_byte_time" real,
	"avg_ai_response_time" real,
	"ai_uptime" real,
	"ai_error_rate" real,
	"avg_voice_latency" real,
	"server_response_time" real,
	"database_response_time" real,
	"cache_hit_rate" real,
	"cdn_hit_rate" real,
	"js_error_rate" real,
	"http_error_rate" real,
	"avg_memory_usage" real,
	"avg_cpu_usage" real,
	"bandwidth_usage" real,
	"performance_score" integer,
	"accessibility_score" integer,
	"best_practices_score" integer,
	"seo_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"date" date NOT NULL,
	"period" varchar(10) NOT NULL,
	"page_views" integer DEFAULT 0,
	"unique_visitors" integer DEFAULT 0,
	"sessions" integer DEFAULT 0,
	"bounce_rate" real DEFAULT 0,
	"avg_session_duration" real DEFAULT 0,
	"voice_interactions" integer DEFAULT 0,
	"voice_sessions" integer DEFAULT 0,
	"avg_voice_session_duration" real DEFAULT 0,
	"voice_completion_rate" real DEFAULT 0,
	"voice_satisfaction_score" real DEFAULT 0,
	"total_conversations" integer DEFAULT 0,
	"resolved_conversations" integer DEFAULT 0,
	"escalated_conversations" integer DEFAULT 0,
	"avg_conversation_turns" real DEFAULT 0,
	"avg_response_time" real DEFAULT 0,
	"top_pages" jsonb DEFAULT '[]'::jsonb,
	"top_queries" jsonb DEFAULT '[]'::jsonb,
	"top_intents" jsonb DEFAULT '[]'::jsonb,
	"top_actions" jsonb DEFAULT '[]'::jsonb,
	"countries" jsonb DEFAULT '{}'::jsonb,
	"languages" jsonb DEFAULT '{}'::jsonb,
	"devices" jsonb DEFAULT '{}'::jsonb,
	"browsers" jsonb DEFAULT '{}'::jsonb,
	"referrers" jsonb DEFAULT '{}'::jsonb,
	"search_engines" jsonb DEFAULT '{}'::jsonb,
	"social_media" jsonb DEFAULT '{}'::jsonb,
	"avg_page_load_time" real DEFAULT 0,
	"core_web_vitals" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_interaction_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" uuid,
	"session_id" varchar(100) NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"event_category" varchar(30) NOT NULL,
	"event_action" varchar(100),
	"event_label" varchar(200),
	"page_url" text,
	"page_title" varchar(300),
	"referrer" text,
	"user_agent" text,
	"ip_address" varchar(45),
	"country" varchar(2),
	"region" varchar(100),
	"city" varchar(100),
	"device" varchar(20),
	"browser" varchar(50),
	"browser_version" varchar(20),
	"os" varchar(50),
	"os_version" varchar(20),
	"screen_resolution" varchar(20),
	"viewport_size" varchar(20),
	"page_load_time" real,
	"dom_content_loaded_time" real,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"custom_dimensions" jsonb DEFAULT '{}'::jsonb,
	"event_value" real,
	"currency" varchar(3),
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"aggregate" varchar(100) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"type" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"error" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_deployments" ADD CONSTRAINT "site_deployments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_deployments" ADD CONSTRAINT "site_deployments_deployed_by_users_id_fk" FOREIGN KEY ("deployed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_manifests" ADD CONSTRAINT "site_manifests_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_contract_history" ADD CONSTRAINT "site_contract_history_contract_id_site_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."site_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_contract_validations" ADD CONSTRAINT "site_contract_validations_contract_id_site_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."site_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD CONSTRAINT "crawl_pages_crawl_session_id_crawl_sessions_id_fk" FOREIGN KEY ("crawl_session_id") REFERENCES "public"."crawl_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_sessions" ADD CONSTRAINT "crawl_sessions_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_audio_files" ADD CONSTRAINT "voice_audio_files_interaction_id_voice_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."voice_interactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_audio_files" ADD CONSTRAINT "voice_audio_files_session_id_voice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_interactions" ADD CONSTRAINT "voice_interactions_session_id_voice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_widgets" ADD CONSTRAINT "voice_widgets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_actions" ADD CONSTRAINT "conversation_actions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_actions" ADD CONSTRAINT "conversation_actions_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_intents" ADD CONSTRAINT "conversation_intents_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_intents" ADD CONSTRAINT "conversation_intents_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_voice_session_id_voice_sessions_id_fk" FOREIGN KEY ("voice_session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interaction_analytics" ADD CONSTRAINT "ai_interaction_analytics_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interaction_analytics" ADD CONSTRAINT "ai_interaction_analytics_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_analytics" ADD CONSTRAINT "site_analytics_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interaction_events" ADD CONSTRAINT "user_interaction_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interaction_events" ADD CONSTRAINT "user_interaction_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_user" ON "user_activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_activity_action" ON "user_activity_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_activity_timestamp" ON "user_activity_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_activity_resource" ON "user_activity_logs" USING btree ("resource","resource_id");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_token" ON "user_sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_user" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_expires" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_tenant" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_users_status" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_site_deployments_site" ON "site_deployments" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_site_deployments_status" ON "site_deployments" USING btree ("build_status");--> statement-breakpoint
CREATE INDEX "idx_site_deployments_env" ON "site_deployments" USING btree ("environment");--> statement-breakpoint
CREATE INDEX "idx_site_deployments_version" ON "site_deployments" USING btree ("version");--> statement-breakpoint
CREATE INDEX "idx_site_manifests_site" ON "site_manifests" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_site_manifests_valid" ON "site_manifests" USING btree ("is_valid");--> statement-breakpoint
CREATE INDEX "idx_site_manifests_score" ON "site_manifests" USING btree ("crawlability_score");--> statement-breakpoint
CREATE INDEX "idx_site_templates_category" ON "site_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_site_templates_active" ON "site_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_site_templates_popular" ON "site_templates" USING btree ("usage_count");--> statement-breakpoint
CREATE INDEX "idx_sites_tenant" ON "sites" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_sites_user" ON "sites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sites_status" ON "sites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sites_slug" ON "sites" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_sites_domain" ON "sites" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_sites_published" ON "sites" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_sites_category" ON "sites" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_contract_history_site_id" ON "site_contract_history" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_contract_history_contract_id" ON "site_contract_history" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "idx_contract_history_created_at" ON "site_contract_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_contract_validations_contract_id" ON "site_contract_validations" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "idx_contract_validations_severity" ON "site_contract_validations" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_contract_validations_type" ON "site_contract_validations" USING btree ("validation_type");--> statement-breakpoint
CREATE INDEX "idx_site_contracts_site_id" ON "site_contracts" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_site_contracts_tenant_id" ON "site_contracts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_site_contracts_status" ON "site_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_site_contracts_version" ON "site_contracts" USING btree ("site_id","version");--> statement-breakpoint
CREATE INDEX "idx_site_contracts_updated_at" ON "site_contracts" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_site_contracts_archived" ON "site_contracts" USING btree ("is_archived");--> statement-breakpoint
CREATE INDEX "idx_crawl_pages_session" ON "crawl_pages" USING btree ("crawl_session_id");--> statement-breakpoint
CREATE INDEX "idx_crawl_pages_url_hash" ON "crawl_pages" USING btree ("url_hash");--> statement-breakpoint
CREATE INDEX "idx_crawl_pages_status" ON "crawl_pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_crawl_pages_crawled" ON "crawl_pages" USING btree ("crawled_at");--> statement-breakpoint
CREATE INDEX "idx_crawl_sessions_kb" ON "crawl_sessions" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "idx_crawl_sessions_status" ON "crawl_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_crawl_sessions_type" ON "crawl_sessions" USING btree ("session_type");--> statement-breakpoint
CREATE INDEX "idx_crawl_sessions_started" ON "crawl_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_knowledge_bases_site" ON "knowledge_bases" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_bases_status" ON "knowledge_bases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_knowledge_bases_crawled" ON "knowledge_bases" USING btree ("last_crawled_at");--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_kb" ON "knowledge_chunks" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_url_hash" ON "knowledge_chunks" USING btree ("url_hash");--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_content_hash" ON "knowledge_chunks" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_embedding" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_parent" ON "knowledge_chunks" USING btree ("parent_chunk_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_language" ON "knowledge_chunks" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_content_type" ON "knowledge_chunks" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_page_type" ON "knowledge_chunks" USING btree ("page_type");--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_importance" ON "knowledge_chunks" USING btree ("importance");--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_crawled" ON "knowledge_chunks" USING btree ("crawled_at");--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_unique" ON "knowledge_chunks" USING btree ("knowledge_base_id","content_hash");--> statement-breakpoint
CREATE INDEX "idx_voice_audio_interaction" ON "voice_audio_files" USING btree ("interaction_id");--> statement-breakpoint
CREATE INDEX "idx_voice_audio_session" ON "voice_audio_files" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_voice_audio_type" ON "voice_audio_files" USING btree ("audio_type");--> statement-breakpoint
CREATE INDEX "idx_voice_audio_expires" ON "voice_audio_files" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_voice_audio_temporary" ON "voice_audio_files" USING btree ("is_temporary");--> statement-breakpoint
CREATE INDEX "idx_voice_interactions_session" ON "voice_interactions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_voice_interactions_turn_id" ON "voice_interactions" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "idx_voice_interactions_type" ON "voice_interactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_voice_interactions_status" ON "voice_interactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_voice_interactions_intent" ON "voice_interactions" USING btree ("detected_intent");--> statement-breakpoint
CREATE INDEX "idx_voice_interactions_received" ON "voice_interactions" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "idx_voice_sessions_session_id" ON "voice_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_voice_sessions_site" ON "voice_sessions" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_voice_sessions_user" ON "voice_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_voice_sessions_status" ON "voice_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_voice_sessions_started" ON "voice_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_voice_sessions_active" ON "voice_sessions" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "idx_voice_widgets_site" ON "voice_widgets" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_voice_widgets_enabled" ON "voice_widgets" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_conversation_actions_conversation" ON "conversation_actions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_actions_turn" ON "conversation_actions" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_actions_name" ON "conversation_actions" USING btree ("action_name");--> statement-breakpoint
CREATE INDEX "idx_conversation_actions_type" ON "conversation_actions" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "idx_conversation_actions_status" ON "conversation_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_conversation_actions_requested" ON "conversation_actions" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "idx_conversation_actions_risk" ON "conversation_actions" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "idx_conversation_intents_conversation" ON "conversation_intents" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_intents_turn" ON "conversation_intents" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_intents_intent" ON "conversation_intents" USING btree ("intent");--> statement-breakpoint
CREATE INDEX "idx_conversation_intents_confidence" ON "conversation_intents" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "idx_conversation_intents_resolved" ON "conversation_intents" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "idx_conversation_intents_timestamp" ON "conversation_intents" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_conversation_turns_conversation" ON "conversation_turns" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_turns_role" ON "conversation_turns" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_conversation_turns_type" ON "conversation_turns" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_conversation_turns_timestamp" ON "conversation_turns" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_conversation_turns_number" ON "conversation_turns" USING btree ("conversation_id","turn_number");--> statement-breakpoint
CREATE INDEX "idx_conversation_turns_sentiment" ON "conversation_turns" USING btree ("sentiment");--> statement-breakpoint
CREATE INDEX "idx_conversation_turns_flagged" ON "conversation_turns" USING btree ("flagged");--> statement-breakpoint
CREATE INDEX "idx_conversations_site" ON "conversations" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_session" ON "conversations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_user" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_voice_session" ON "conversations" USING btree ("voice_session_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_status" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_conversations_started" ON "conversations" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_conversations_last_message" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "idx_conversations_category" ON "conversations" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_conversations_priority" ON "conversations" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_conversations_resolved" ON "conversations" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "idx_ai_interaction_analytics_site" ON "ai_interaction_analytics" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_ai_interaction_analytics_date" ON "ai_interaction_analytics" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_ai_interaction_analytics_intent" ON "ai_interaction_analytics" USING btree ("intent");--> statement-breakpoint
CREATE INDEX "idx_ai_interaction_analytics_response_time" ON "ai_interaction_analytics" USING btree ("response_time");--> statement-breakpoint
CREATE INDEX "idx_ai_interaction_analytics_satisfaction" ON "ai_interaction_analytics" USING btree ("user_satisfaction");--> statement-breakpoint
CREATE INDEX "idx_ai_interaction_analytics_model" ON "ai_interaction_analytics" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_ai_interaction_analytics_error" ON "ai_interaction_analytics" USING btree ("had_error");--> statement-breakpoint
CREATE INDEX "idx_ai_interaction_analytics_language" ON "ai_interaction_analytics" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_ai_interaction_analytics_timestamp" ON "ai_interaction_analytics" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_interaction_analytics_query_hash" ON "ai_interaction_analytics" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_site" ON "conversion_events" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_user" ON "conversion_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_session" ON "conversion_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_conversation" ON "conversion_events" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_type" ON "conversion_events" USING btree ("conversion_type");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_category" ON "conversion_events" USING btree ("conversion_category");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_value" ON "conversion_events" USING btree ("conversion_value");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_ai_assisted" ON "conversion_events" USING btree ("ai_assisted");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_timestamp" ON "conversion_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_performance_metrics_site" ON "performance_metrics" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_performance_metrics_date" ON "performance_metrics" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_performance_metrics_period" ON "performance_metrics" USING btree ("period");--> statement-breakpoint
CREATE INDEX "idx_performance_metrics_site_date" ON "performance_metrics" USING btree ("site_id","date","period");--> statement-breakpoint
CREATE INDEX "idx_site_analytics_site" ON "site_analytics" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_site_analytics_date" ON "site_analytics" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_site_analytics_period" ON "site_analytics" USING btree ("period");--> statement-breakpoint
CREATE INDEX "idx_site_analytics_site_date" ON "site_analytics" USING btree ("site_id","date","period");--> statement-breakpoint
CREATE INDEX "idx_user_interaction_events_site" ON "user_interaction_events" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_user_interaction_events_user" ON "user_interaction_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_interaction_events_session" ON "user_interaction_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_user_interaction_events_type" ON "user_interaction_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_user_interaction_events_category" ON "user_interaction_events" USING btree ("event_category");--> statement-breakpoint
CREATE INDEX "idx_user_interaction_events_timestamp" ON "user_interaction_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_user_interaction_events_country" ON "user_interaction_events" USING btree ("country");--> statement-breakpoint
CREATE INDEX "idx_user_interaction_events_device" ON "user_interaction_events" USING btree ("device");--> statement-breakpoint
CREATE INDEX "outbox_events_tenant_id_idx" ON "outbox_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "outbox_events_status_idx" ON "outbox_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outbox_events_created_at_idx" ON "outbox_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate","aggregate_id");--> statement-breakpoint
CREATE INDEX "outbox_events_type_idx" ON "outbox_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_polling_idx" ON "outbox_events" USING btree ("status","created_at") WHERE "outbox_events"."status" = $1;--> statement-breakpoint
CREATE INDEX "outbox_events_correlation_idx" ON "outbox_events" USING btree ("correlation_id");