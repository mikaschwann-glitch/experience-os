CREATE TYPE "public"."feasibility_proposal_status" AS ENUM('proposed', 'requires_confirmation', 'withheld', 'accepted', 'rejected', 'not_useful', 'converted_to_host_action');--> statement-breakpoint
CREATE TYPE "public"."feasibility_run_status" AS ENUM('completed', 'refused');--> statement-breakpoint
CREATE TABLE "feasibility_proposal_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"evidence_item_id" uuid,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feasibility_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"rationale" text,
	"status" "feasibility_proposal_status" DEFAULT 'proposed' NOT NULL,
	"reason_code" text,
	"withheld_reason" text,
	"confirmation_required" boolean DEFAULT false NOT NULL,
	"freshness" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"lead_time" text,
	"host_effort" "pi_effort",
	"cost_level" "pi_cost",
	"linked_local_insight_id" uuid,
	"linked_capability_id" uuid,
	"linked_playbook_action_id" uuid,
	"recommendation_id" uuid,
	"matched_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"constraints_checked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feasibility_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"brief_id" uuid NOT NULL,
	"job_id" uuid,
	"stay_id" uuid,
	"status" "feasibility_run_status" DEFAULT 'completed' NOT NULL,
	"refused_reason" text,
	"sim_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proposal_count" integer DEFAULT 0 NOT NULL,
	"actionable_count" integer DEFAULT 0 NOT NULL,
	"triggered_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feasibility_proposal_evidence" ADD CONSTRAINT "feasibility_proposal_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_proposal_evidence" ADD CONSTRAINT "feasibility_proposal_evidence_proposal_id_feasibility_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."feasibility_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_proposal_evidence" ADD CONSTRAINT "feasibility_proposal_evidence_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."evidence_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_proposals" ADD CONSTRAINT "feasibility_proposals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_proposals" ADD CONSTRAINT "feasibility_proposals_run_id_feasibility_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."feasibility_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_proposals" ADD CONSTRAINT "feasibility_proposals_linked_local_insight_id_local_insights_id_fk" FOREIGN KEY ("linked_local_insight_id") REFERENCES "public"."local_insights"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_proposals" ADD CONSTRAINT "feasibility_proposals_linked_capability_id_property_capabilities_id_fk" FOREIGN KEY ("linked_capability_id") REFERENCES "public"."property_capabilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_proposals" ADD CONSTRAINT "feasibility_proposals_linked_playbook_action_id_preparation_playbook_actions_id_fk" FOREIGN KEY ("linked_playbook_action_id") REFERENCES "public"."preparation_playbook_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_proposals" ADD CONSTRAINT "feasibility_proposals_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_runs" ADD CONSTRAINT "feasibility_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_runs" ADD CONSTRAINT "feasibility_runs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_runs" ADD CONSTRAINT "feasibility_runs_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_runs" ADD CONSTRAINT "feasibility_runs_brief_id_prearrival_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."prearrival_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_runs" ADD CONSTRAINT "feasibility_runs_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_runs" ADD CONSTRAINT "feasibility_runs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feasibility_proposal_evidence_tenant_idx" ON "feasibility_proposal_evidence" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "feasibility_proposal_evidence_proposal_idx" ON "feasibility_proposal_evidence" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "feasibility_proposals_tenant_idx" ON "feasibility_proposals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "feasibility_proposals_run_idx" ON "feasibility_proposals" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "feasibility_runs_tenant_idx" ON "feasibility_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "feasibility_runs_property_idx" ON "feasibility_runs" USING btree ("tenant_id","property_id");--> statement-breakpoint
CREATE INDEX "feasibility_runs_brief_idx" ON "feasibility_runs" USING btree ("tenant_id","brief_id");