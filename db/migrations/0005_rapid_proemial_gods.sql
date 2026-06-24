CREATE TYPE "public"."trigger_source" AS ENUM('guest_stated', 'host_noted', 'system_profile_match');--> statement-breakpoint
ALTER TABLE "feasibility_runs" ALTER COLUMN "brief_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "trigger_source" "trigger_source";--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "externally_researched" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "feasibility_runs" ADD COLUMN "trigger_source" "trigger_source";--> statement-breakpoint
ALTER TABLE "feasibility_runs" ADD COLUMN "externally_researched" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "feasibility_runs" ADD COLUMN "source_signal_id" uuid;--> statement-breakpoint
ALTER TABLE "feasibility_runs" ADD CONSTRAINT "feasibility_runs_source_signal_id_signals_id_fk" FOREIGN KEY ("source_signal_id") REFERENCES "public"."signals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Provenance backfill (data). Every existing feasibility run was derived from a
-- pre-arrival brief (brief_id was NOT NULL before this migration) → externally researched.
UPDATE "feasibility_runs" SET "externally_researched" = true WHERE "brief_id" IS NOT NULL;--> statement-breakpoint
-- Recommendations minted from a feasibility proposal are research-derived; mark them
-- via the real existing relationship (feasibility_proposals.recommendation_id).
UPDATE "recommendations" SET "externally_researched" = true WHERE "id" IN (SELECT "recommendation_id" FROM "feasibility_proposals" WHERE "recommendation_id" IS NOT NULL);