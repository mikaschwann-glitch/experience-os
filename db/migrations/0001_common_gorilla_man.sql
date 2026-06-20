CREATE TYPE "public"."brief_item_kind" AS ENUM('context', 'preparation');--> statement-breakpoint
CREATE TYPE "public"."brief_status" AS ENUM('draft', 'approved', 'rejected', 'edited', 'not_useful', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('granted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."evidence_classification" AS ENUM('allowed', 'prohibited_sensitive', 'irrelevant', 'disallowed_source', 'insufficient_confidence');--> statement-breakpoint
CREATE TYPE "public"."identity_resolution" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."policy_incident_kind" AS ENUM('no_consent_refused', 'consent_withdrawn_abort', 'disallowed_source_refused', 'prohibited_sensitive_blocked', 'low_confidence_no_brief', 'no_match', 'false_match_uncertain');--> statement-breakpoint
CREATE TYPE "public"."research_job_status" AS ENUM('queued', 'running', 'blocked', 'needs_review', 'completed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."source_policy" AS ENUM('allowed', 'disallowed');--> statement-breakpoint
CREATE TABLE "brief_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"brief_id" uuid NOT NULL,
	"evidence_item_id" uuid,
	"kind" "brief_item_kind" DEFAULT 'context' NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"scope" text DEFAULT 'prearrival_research' NOT NULL,
	"status" "consent_status" DEFAULT 'granted' NOT NULL,
	"granted_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"source_id" uuid,
	"candidate_id" uuid,
	"category" text NOT NULL,
	"excerpt" text,
	"classification" "evidence_classification" NOT NULL,
	"actionable" boolean DEFAULT false NOT NULL,
	"included_in_brief" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"fixture_candidate_key" text NOT NULL,
	"label" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"level" "confidence_level" DEFAULT 'low' NOT NULL,
	"resolution" "identity_resolution" DEFAULT 'pending' NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid,
	"guest_id" uuid,
	"kind" "policy_incident_kind" NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prearrival_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"stay_id" uuid,
	"job_id" uuid NOT NULL,
	"status" "brief_status" DEFAULT 'draft' NOT NULL,
	"confidence" "confidence_level" DEFAULT 'high' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"host_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"stay_id" uuid,
	"consent_grant_id" uuid,
	"scenario_key" text NOT NULL,
	"status" "research_job_status" DEFAULT 'queued' NOT NULL,
	"triggered_by_user_id" uuid,
	"best_candidate_id" uuid,
	"brief_id" uuid,
	"abort_reason" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"fixture_source_key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"policy_status" "source_policy" DEFAULT 'allowed' NOT NULL,
	"excerpt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brief_items" ADD CONSTRAINT "brief_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_items" ADD CONSTRAINT "brief_items_brief_id_prearrival_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."prearrival_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_items" ADD CONSTRAINT "brief_items_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."evidence_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_job_id_research_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."research_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_source_id_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."research_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_candidates" ADD CONSTRAINT "identity_candidates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_candidates" ADD CONSTRAINT "identity_candidates_job_id_research_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."research_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_incidents" ADD CONSTRAINT "policy_incidents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prearrival_briefs" ADD CONSTRAINT "prearrival_briefs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prearrival_briefs" ADD CONSTRAINT "prearrival_briefs_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prearrival_briefs" ADD CONSTRAINT "prearrival_briefs_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prearrival_briefs" ADD CONSTRAINT "prearrival_briefs_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_job_id_research_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."research_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brief_items_tenant_idx" ON "brief_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "brief_items_brief_idx" ON "brief_items" USING btree ("brief_id");--> statement-breakpoint
CREATE INDEX "consent_grants_tenant_idx" ON "consent_grants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "consent_grants_guest_idx" ON "consent_grants" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "evidence_items_tenant_idx" ON "evidence_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "evidence_items_job_idx" ON "evidence_items" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "identity_candidates_tenant_idx" ON "identity_candidates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "identity_candidates_job_idx" ON "identity_candidates" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "policy_incidents_tenant_idx" ON "policy_incidents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "prearrival_briefs_tenant_idx" ON "prearrival_briefs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "prearrival_briefs_guest_idx" ON "prearrival_briefs" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "research_jobs_tenant_idx" ON "research_jobs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "research_jobs_guest_idx" ON "research_jobs" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "research_sources_tenant_idx" ON "research_sources" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "research_sources_job_idx" ON "research_sources" USING btree ("job_id");