CREATE TYPE "public"."learning_draft_status" AS ENUM('draft', 'promoted', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."learning_type" AS ENUM('local_insight', 'constraint', 'capability', 'playbook');--> statement-breakpoint
CREATE TABLE "property_learning_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"outcome_id" uuid,
	"host_action_id" uuid,
	"recommendation_id" uuid,
	"feasibility_proposal_id" uuid,
	"brief_id" uuid,
	"stay_id" uuid,
	"guest_id" uuid,
	"learning_type" "learning_type" NOT NULL,
	"note" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "learning_draft_status" DEFAULT 'draft' NOT NULL,
	"promoted_item_type" text,
	"promoted_item_id" uuid,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "property_learning_drafts" ADD CONSTRAINT "property_learning_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_learning_drafts" ADD CONSTRAINT "property_learning_drafts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_learning_drafts" ADD CONSTRAINT "property_learning_drafts_outcome_id_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."outcomes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_learning_drafts" ADD CONSTRAINT "property_learning_drafts_host_action_id_host_actions_id_fk" FOREIGN KEY ("host_action_id") REFERENCES "public"."host_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_learning_drafts" ADD CONSTRAINT "property_learning_drafts_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_learning_drafts" ADD CONSTRAINT "property_learning_drafts_feasibility_proposal_id_feasibility_proposals_id_fk" FOREIGN KEY ("feasibility_proposal_id") REFERENCES "public"."feasibility_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_learning_drafts" ADD CONSTRAINT "property_learning_drafts_brief_id_prearrival_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."prearrival_briefs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_learning_drafts" ADD CONSTRAINT "property_learning_drafts_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_learning_drafts" ADD CONSTRAINT "property_learning_drafts_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_learning_drafts" ADD CONSTRAINT "property_learning_drafts_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "property_learning_drafts_tenant_idx" ON "property_learning_drafts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "property_learning_drafts_property_idx" ON "property_learning_drafts" USING btree ("tenant_id","property_id");--> statement-breakpoint
CREATE INDEX "property_learning_drafts_status_idx" ON "property_learning_drafts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "property_learning_drafts_outcome_idx" ON "property_learning_drafts" USING btree ("tenant_id","outcome_id");