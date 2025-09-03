CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"metadata" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_activity" timestamp DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"language" varchar(10) DEFAULT 'en-US',
	"metadata" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"selector" text NOT NULL,
	"description" text NOT NULL,
	"parameters" json DEFAULT '[]'::json,
	"confirmation" boolean DEFAULT false NOT NULL,
	"side_effecting" varchar(50) DEFAULT 'safe' NOT NULL,
	"risk_level" varchar(20) DEFAULT 'low' NOT NULL,
	"category" varchar(50) NOT NULL,
	"metadata" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kb_actions_site_name_unique" UNIQUE("site_id","name")
);
--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"content" text NOT NULL,
	"cleaned_content" text NOT NULL,
	"section" varchar(255),
	"heading" text,
	"hpath" text,
	"selector" text,
	"word_count" integer NOT NULL,
	"token_count" integer NOT NULL,
	"locale" varchar(10) DEFAULT 'en',
	"content_type" varchar(50) DEFAULT 'text',
	"priority" numeric(2, 1) DEFAULT '0.5',
	"metadata" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kb_chunks_document_chunk_unique" UNIQUE("document_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "kb_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content_hash" varchar(64) NOT NULL,
	"page_hash" varchar(64) NOT NULL,
	"lastmod" timestamp,
	"last_crawled" timestamp DEFAULT now() NOT NULL,
	"etag" varchar(255),
	"last_modified" varchar(255),
	"priority" numeric(2, 1) DEFAULT '0.5',
	"changefreq" varchar(20) DEFAULT 'weekly',
	"locale" varchar(10) DEFAULT 'en',
	"content_type" varchar(100) DEFAULT 'text/html',
	"word_count" integer DEFAULT 0,
	"version" integer DEFAULT 1 NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"metadata" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kb_documents_site_canonical_unique" UNIQUE("site_id","canonical_url")
);
--> statement-breakpoint
CREATE TABLE "kb_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"model" varchar(50) DEFAULT 'text-embedding-3-small' NOT NULL,
	"dimensions" integer DEFAULT 1536 NOT NULL,
	"embedding" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"selector" text NOT NULL,
	"action" text,
	"method" varchar(10) DEFAULT 'POST',
	"enctype" varchar(50) DEFAULT 'application/x-www-form-urlencoded',
	"fields" json DEFAULT '[]'::json NOT NULL,
	"validation" json DEFAULT '{}'::json,
	"metadata" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"document_count" integer DEFAULT 0,
	"chunk_count" integer DEFAULT 0,
	"action_count" integer DEFAULT 0,
	"form_count" integer DEFAULT 0,
	"conversation_count" integer DEFAULT 0,
	"avg_response_time" numeric(10, 2),
	"search_queries" integer DEFAULT 0,
	"metadata" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kb_stats_site_date_unique" UNIQUE("site_id","date")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"domain" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"contract" json NOT NULL,
	"settings" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sites_tenant_domain_unique" UNIQUE("tenant_id","domain")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"domain" varchar(255) NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"settings" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"avatar" text,
	"role" varchar(50) DEFAULT 'user' NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"preferences" json DEFAULT '{}'::json,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_session_id_conversation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."conversation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_actions" ADD CONSTRAINT "kb_actions_document_id_kb_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_actions" ADD CONSTRAINT "kb_actions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_actions" ADD CONSTRAINT "kb_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_document_id_kb_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_embeddings" ADD CONSTRAINT "kb_embeddings_chunk_id_kb_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."kb_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_embeddings" ADD CONSTRAINT "kb_embeddings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_embeddings" ADD CONSTRAINT "kb_embeddings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_forms" ADD CONSTRAINT "kb_forms_document_id_kb_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_forms" ADD CONSTRAINT "kb_forms_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_forms" ADD CONSTRAINT "kb_forms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_stats" ADD CONSTRAINT "kb_stats_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_stats" ADD CONSTRAINT "kb_stats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_messages_session_idx" ON "conversation_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_site_idx" ON "conversation_messages" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_tenant_idx" ON "conversation_messages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_type_idx" ON "conversation_messages" USING btree ("type");--> statement-breakpoint
CREATE INDEX "conversation_messages_created_at_idx" ON "conversation_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversation_sessions_site_idx" ON "conversation_sessions" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "conversation_sessions_tenant_idx" ON "conversation_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "conversation_sessions_user_idx" ON "conversation_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversation_sessions_status_idx" ON "conversation_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversation_sessions_last_activity_idx" ON "conversation_sessions" USING btree ("last_activity");--> statement-breakpoint
CREATE INDEX "kb_actions_document_idx" ON "kb_actions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "kb_actions_site_idx" ON "kb_actions" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "kb_actions_tenant_idx" ON "kb_actions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kb_actions_name_idx" ON "kb_actions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "kb_actions_type_idx" ON "kb_actions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "kb_actions_category_idx" ON "kb_actions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "kb_actions_risk_idx" ON "kb_actions" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "kb_chunks_document_idx" ON "kb_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "kb_chunks_site_idx" ON "kb_chunks" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "kb_chunks_tenant_idx" ON "kb_chunks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kb_chunks_content_hash_idx" ON "kb_chunks" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "kb_chunks_locale_idx" ON "kb_chunks" USING btree ("locale");--> statement-breakpoint
CREATE INDEX "kb_chunks_content_type_idx" ON "kb_chunks" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "kb_documents_site_idx" ON "kb_documents" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "kb_documents_tenant_idx" ON "kb_documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kb_documents_url_idx" ON "kb_documents" USING btree ("url");--> statement-breakpoint
CREATE INDEX "kb_documents_canonical_idx" ON "kb_documents" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "kb_documents_content_hash_idx" ON "kb_documents" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "kb_documents_lastmod_idx" ON "kb_documents" USING btree ("lastmod");--> statement-breakpoint
CREATE INDEX "kb_documents_locale_idx" ON "kb_documents" USING btree ("locale");--> statement-breakpoint
CREATE INDEX "kb_embeddings_chunk_idx" ON "kb_embeddings" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "kb_embeddings_site_idx" ON "kb_embeddings" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "kb_embeddings_tenant_idx" ON "kb_embeddings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kb_embeddings_model_idx" ON "kb_embeddings" USING btree ("model");--> statement-breakpoint
CREATE INDEX "kb_forms_document_idx" ON "kb_forms" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "kb_forms_site_idx" ON "kb_forms" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "kb_forms_tenant_idx" ON "kb_forms" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kb_forms_selector_idx" ON "kb_forms" USING btree ("selector");--> statement-breakpoint
CREATE INDEX "kb_stats_site_idx" ON "kb_stats" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "kb_stats_tenant_idx" ON "kb_stats" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kb_stats_date_idx" ON "kb_stats" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sites_tenant_idx" ON "sites" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sites_domain_idx" ON "sites" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "sites_status_idx" ON "sites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenants_domain_idx" ON "tenants" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "tenants_owner_idx" ON "tenants" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");