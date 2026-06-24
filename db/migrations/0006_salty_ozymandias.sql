CREATE TYPE "public"."preparation_intent_status" AS ENUM('processing', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "preparation_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"initiator_user_id" uuid,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" "preparation_intent_status" DEFAULT 'processing' NOT NULL,
	"recommendation_id" uuid,
	"preparation_id" uuid,
	"stay_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "host_actions" ADD COLUMN "stay_id" uuid;--> statement-breakpoint
ALTER TABLE "host_actions" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "host_actions" ADD COLUMN "archive_reason" text;--> statement-breakpoint
ALTER TABLE "preparation_intents" ADD CONSTRAINT "preparation_intents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_intents" ADD CONSTRAINT "preparation_intents_initiator_user_id_users_id_fk" FOREIGN KEY ("initiator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_intents" ADD CONSTRAINT "preparation_intents_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_intents" ADD CONSTRAINT "preparation_intents_preparation_id_host_actions_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."host_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_intents" ADD CONSTRAINT "preparation_intents_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "preparation_intents_key_uq" ON "preparation_intents" USING btree ("tenant_id","initiator_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "preparation_intents_tenant_idx" ON "preparation_intents" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "host_actions" ADD CONSTRAINT "host_actions_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "host_actions_stay_idx" ON "host_actions" USING btree ("tenant_id","stay_id");--> statement-breakpoint
CREATE UNIQUE INDEX "host_actions_recommendation_uq" ON "host_actions" USING btree ("recommendation_id") WHERE recommendation_id IS NOT NULL;--> statement-breakpoint
-- Wave 1A backfill: set the direct stay_id ONLY where causally resolvable via the
-- recommendation, and only when tenant + guest are consistent (never write a
-- mismatched stay). Mirrors the preflight "cleanly backfillable" query.
UPDATE "host_actions" ha
SET "stay_id" = r."stay_id"
FROM "recommendations" r
WHERE r."id" = ha."recommendation_id"
  AND r."stay_id" IS NOT NULL
  AND ha."tenant_id" = r."tenant_id"
  AND EXISTS (
    SELECT 1 FROM "stays" s
    WHERE s."id" = r."stay_id"
      AND s."tenant_id" = ha."tenant_id"
      AND s."guest_id" = ha."guest_id"
  );--> statement-breakpoint
-- Wave 1A legacy isolation: any operational host_action that still has no causal
-- stay after backfill is quarantined — excluded from every host read model but
-- RETAINED for audit (never deleted). Outcome-bearing legacy rows survive here.
UPDATE "host_actions"
SET "archived_at" = now(),
    "archive_reason" = 'wave1a_legacy_stayless'
WHERE "stay_id" IS NULL
  AND "archived_at" IS NULL;