ALTER TABLE "host_actions" ADD COLUMN "archived_by" text;--> statement-breakpoint
ALTER TABLE "host_actions" ADD COLUMN "archive_batch_id" text;--> statement-breakpoint
-- Wave 1A audit provenance: mark the rows that migration 0006 quarantined as
-- migration-generated remediation, so they are forever distinguishable from a
-- host-initiated cancellation/archive.
UPDATE "host_actions"
SET "archived_by" = 'system_migration',
    "archive_batch_id" = 'wave1a_0006'
WHERE "archive_reason" = 'wave1a_legacy_stayless'
  AND "archived_at" IS NOT NULL
  AND "archived_by" IS NULL;