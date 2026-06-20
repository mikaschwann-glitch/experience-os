CREATE TYPE "public"."pi_cost" AS ENUM('none', 'low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."pi_effort" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."pi_freshness" AS ENUM('stable', 'verify_before_use', 'dynamic');--> statement-breakpoint
CREATE TYPE "public"."pi_rule_type" AS ENUM('exclusion', 'timing', 'weather', 'mobility', 'suitability', 'partner', 'other');--> statement-breakpoint
CREATE TYPE "public"."pi_severity" AS ENUM('soft', 'hard');--> statement-breakpoint
CREATE TYPE "public"."pi_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TABLE "local_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suitable_for" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unsuitable_for" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"best_time_of_day" text,
	"seasonal_suitability" text,
	"weather_dependency" text,
	"distance_duration" text,
	"reservation_required" boolean DEFAULT false NOT NULL,
	"host_effort" "pi_effort",
	"freshness" "pi_freshness" DEFAULT 'stable' NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"status" "pi_status" DEFAULT 'active' NOT NULL,
	"visibility" text DEFAULT 'property_private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preparation_playbook_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"linked_capability_id" uuid,
	"lead_time" text,
	"host_effort" "pi_effort",
	"cost_level" "pi_cost",
	"suitable_for" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "pi_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suitable_for" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unsuitable_for" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lead_time" text,
	"host_effort" "pi_effort",
	"cost_level" "pi_cost",
	"status" "pi_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_constraints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"rule_type" "pi_rule_type" DEFAULT 'exclusion' NOT NULL,
	"severity" "pi_severity" DEFAULT 'soft' NOT NULL,
	"applicability_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_insights" ADD CONSTRAINT "local_insights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_insights" ADD CONSTRAINT "local_insights_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_playbook_actions" ADD CONSTRAINT "preparation_playbook_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_playbook_actions" ADD CONSTRAINT "preparation_playbook_actions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_playbook_actions" ADD CONSTRAINT "preparation_playbook_actions_linked_capability_id_property_capabilities_id_fk" FOREIGN KEY ("linked_capability_id") REFERENCES "public"."property_capabilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_capabilities" ADD CONSTRAINT "property_capabilities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_capabilities" ADD CONSTRAINT "property_capabilities_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_constraints" ADD CONSTRAINT "property_constraints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_constraints" ADD CONSTRAINT "property_constraints_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_insights_tenant_idx" ON "local_insights" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "local_insights_property_idx" ON "local_insights" USING btree ("tenant_id","property_id");--> statement-breakpoint
CREATE INDEX "preparation_playbook_tenant_idx" ON "preparation_playbook_actions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "preparation_playbook_property_idx" ON "preparation_playbook_actions" USING btree ("tenant_id","property_id");--> statement-breakpoint
CREATE INDEX "property_capabilities_tenant_idx" ON "property_capabilities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "property_capabilities_property_idx" ON "property_capabilities" USING btree ("tenant_id","property_id");--> statement-breakpoint
CREATE INDEX "property_constraints_tenant_idx" ON "property_constraints" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "property_constraints_property_idx" ON "property_constraints" USING btree ("tenant_id","property_id");