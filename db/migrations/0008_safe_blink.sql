ALTER TYPE "public"."host_action_status" ADD VALUE 'prepared' BEFORE 'done';--> statement-breakpoint
CREATE TABLE "preparation_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"host_action_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prepared_by_user_id" uuid,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outcomes" ADD COLUMN "execution_id" uuid;--> statement-breakpoint
ALTER TABLE "preparation_executions" ADD CONSTRAINT "preparation_executions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_executions" ADD CONSTRAINT "preparation_executions_host_action_id_host_actions_id_fk" FOREIGN KEY ("host_action_id") REFERENCES "public"."host_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_executions" ADD CONSTRAINT "preparation_executions_prepared_by_user_id_users_id_fk" FOREIGN KEY ("prepared_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "preparation_executions_tenant_idx" ON "preparation_executions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preparation_executions_action_version_uq" ON "preparation_executions" USING btree ("host_action_id","version");--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_execution_id_preparation_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."preparation_executions"("id") ON DELETE set null ON UPDATE no action;