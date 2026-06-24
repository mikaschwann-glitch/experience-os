/**
 * Experience-OS — Run 1 core schema (multi-tenant).
 *
 * Tenancy contract:
 * - `tenants` is the root table and has NO `tenant_id`.
 * - Every other (tenant-owned) table carries `tenant_id` referencing tenants(id)
 *   with ON DELETE CASCADE, so a tenant can be removed/reseeded cleanly.
 * - App-layer scoping is enforced in the repository layer (see lib/repositories).
 *   The schema is RLS-ready (tenant_id everywhere + indexes) but Run 1 does not
 *   implement RLS policies — no fake RLS. See TODO(RLS) markers below.
 *
 * Event log contract:
 * - `events` is append-only: it has NO `updated_at` and is never updated/deleted.
 */

import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  date,
  char,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
// Shared provenance enum lives in a leaf module (no intra-schema imports) so it is
// initialized before the recommendations + feasibility_runs tables that use it.
import { triggerSourceEnum } from "./enums";
export * from "./enums";

// ---- Enums ----

// generated_by may be manual/rules/llm; Run 1 only ever writes 'manual'.
export const generatedByEnum = pgEnum("generated_by", ["manual", "rules", "llm"]);
export const recommendationStatusEnum = pgEnum("recommendation_status", [
  "pending",
  "accepted",
  "dismissed",
]);
// Wave 2 lifecycle: 'prepared' = the host physically prepared the item ("Mark as
// ready"), HONESTLY distinct from an outcome. 'done' is the legacy combined state
// (an outcome was logged). Both 'prepared' and 'done' surface to the host as "Completed".
export const hostActionStatusEnum = pgEnum("host_action_status", [
  "planned",
  "prepared",
  "done",
  "cancelled",
]);
export const outcomeResultEnum = pgEnum("outcome_result", [
  "positive",
  "neutral",
  "negative",
  "unknown",
]);
export const stayStatusEnum = pgEnum("stay_status", [
  "upcoming",
  "in_residence",
  "departed",
]);
export const signalTypeEnum = pgEnum("signal_type", [
  "note",
  "email",
  "call",
  "booking",
  "other",
]);
// Wave 1A — idempotency lifecycle for the single transactional creation boundary.
export const preparationIntentStatusEnum = pgEnum("preparation_intent_status", [
  "processing",
  "succeeded",
  "failed",
]);

// ---- Shared column helpers ----

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

// ---- Root table (no tenant_id) ----

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

// tenant_id column shared by every tenant-owned table.
// TODO(RLS): once a production auth provider + DB roles exist, add RLS policies
// keyed on this column and a session-scoped current_tenant_id().
const tenantCol = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

// ---- Tenant-owned tables ----

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("host"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_tenant_email_uq").on(t.tenantId, t.email),
    index("users_tenant_idx").on(t.tenantId),
  ],
);

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    provider: text("provider").notNull(), // e.g. 'mock_pms'
    status: text("status").notNull().default("connected"),
    config: jsonb("config").notNull().default({}),
    ...timestamps,
  },
  (t) => [index("integration_connections_tenant_idx").on(t.tenantId)],
);

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    name: text("name").notNull(),
    location: text("location"),
    ...timestamps,
  },
  (t) => [index("properties_tenant_idx").on(t.tenantId)],
);

export const units = pgTable(
  "units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type"), // e.g. 'cabin', 'villa'
    capacity: integer("capacity").notNull().default(2),
    ...timestamps,
  },
  (t) => [
    index("units_tenant_idx").on(t.tenantId),
    index("units_property_idx").on(t.propertyId),
  ],
);

export const guests = pgTable(
  "guests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    language: text("language"),
    country: text("country"),
    notes: text("notes"),
    // Soft-delete / anonymization columns (GDPR-ready; no workflows in Run 1).
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("guests_tenant_idx").on(t.tenantId)],
);

export const stays = pgTable(
  "stays",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: stayStatusEnum("status").notNull().default("upcoming"),
    visitNumber: integer("visit_number").notNull().default(1),
    // Money is stored as integer cents + ISO currency — never a free numeric field.
    valueAmountCents: integer("value_amount_cents"),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    ...timestamps,
  },
  (t) => [
    index("stays_tenant_idx").on(t.tenantId),
    index("stays_guest_idx").on(t.guestId),
  ],
);

// Consent is schema-only in Run 1 (no consent UI, no GDPR workflows).
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    granted: boolean("granted").notNull().default(false),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("consents_tenant_idx").on(t.tenantId)],
);

export const signals = pgTable(
  "signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    stayId: uuid("stay_id").references(() => stays.id, { onDelete: "set null" }),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: signalTypeEnum("type").notNull().default("note"),
    body: text("body").notNull(),
    // correlation_id ties the whole chain together: signal -> insight -> rec -> action -> outcome.
    correlationId: uuid("correlation_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    index("signals_tenant_idx").on(t.tenantId),
    index("signals_guest_idx").on(t.guestId),
    index("signals_correlation_idx").on(t.correlationId),
  ],
);

export const insights = pgTable(
  "insights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    signalId: uuid("signal_id").references(() => signals.id, {
      onDelete: "set null",
    }),
    summary: text("summary").notNull(),
    detail: text("detail"),
    generatedBy: generatedByEnum("generated_by").notNull().default("manual"),
    correlationId: uuid("correlation_id").notNull(),
    ...timestamps,
  },
  (t) => [
    index("insights_tenant_idx").on(t.tenantId),
    index("insights_guest_idx").on(t.guestId),
    index("insights_correlation_idx").on(t.correlationId),
  ],
);

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    stayId: uuid("stay_id").references(() => stays.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    rationale: text("rationale"),
    effort: text("effort"), // 'low' | 'medium' | 'high' (free text in Run 1)
    status: recommendationStatusEnum("status").notNull().default("pending"),
    generatedBy: generatedByEnum("generated_by").notNull().default("manual"),
    // Provenance (explicit, never inferred from a FK). trigger_source = the human/
    // profile origin; externally_researched = whether the inputs came from an
    // external research path (the only class that needs a consent gate).
    triggerSource: triggerSourceEnum("trigger_source"),
    externallyResearched: boolean("externally_researched").notNull().default(false),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    correlationId: uuid("correlation_id").notNull(),
    ...timestamps,
  },
  (t) => [
    index("recommendations_tenant_idx").on(t.tenantId),
    index("recommendations_guest_idx").on(t.guestId),
    index("recommendations_status_idx").on(t.tenantId, t.status),
  ],
);

// Join table linking recommendations to the insights that justify them.
// Same-tenant consistency is enforced via the tenant_id column + repository validation.
export const recommendationInsights = pgTable(
  "recommendation_insights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    recommendationId: uuid("recommendation_id")
      .notNull()
      .references(() => recommendations.id, { onDelete: "cascade" }),
    insightId: uuid("insight_id")
      .notNull()
      .references(() => insights.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("recommendation_insights_uq").on(t.recommendationId, t.insightId),
    index("recommendation_insights_tenant_idx").on(t.tenantId),
  ],
);

export const hostActions = pgTable(
  "host_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    recommendationId: uuid("recommendation_id").references(
      () => recommendations.id,
      { onDelete: "set null" },
    ),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    // Wave 1A — direct, authoritative operational stay relation. Nullable for now
    // (legacy/quarantined rows may be null); becomes NOT NULL in Wave 2 after legacy
    // cleanup. RESTRICT: a stay with operational work cannot be physically deleted —
    // a cancelled/changed stay is a soft-status record, never a silent disappearance.
    stayId: uuid("stay_id").references(() => stays.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    status: hostActionStatusEnum("status").notNull().default("planned"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    // Wave 1A — legacy isolation. A quarantined/archived row is retained for audit
    // but excluded from every host read model (PreparationWorkItem filters these out).
    // Provenance distinguishes a migration-quarantined row from a host-cancelled one:
    // archived_by = 'system_migration' | <userId>, archive_batch_id = e.g. 'wave1a_0006'.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archiveReason: text("archive_reason"),
    archivedBy: text("archived_by"),
    archiveBatchId: text("archive_batch_id"),
    correlationId: uuid("correlation_id").notNull(),
    ...timestamps,
  },
  (t) => [
    index("host_actions_tenant_idx").on(t.tenantId),
    index("host_actions_guest_idx").on(t.guestId),
    index("host_actions_stay_idx").on(t.tenantId, t.stayId),
    // One Preparation per recommendation — the DB backstop for createOrGetPreparation
    // idempotency. Partial: legacy/rec-less rows are exempt.
    uniqueIndex("host_actions_recommendation_uq")
      .on(t.recommendationId)
      .where(sql`recommendation_id IS NOT NULL`),
  ],
);

export const outcomes = pgTable(
  "outcomes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    hostActionId: uuid("host_action_id").references(() => hostActions.id, {
      onDelete: "set null",
    }),
    // Wave 2 — the exact execution version this outcome refers to (frozen rule: an
    // outcome binds to the immutable snapshot of what was prepared, not the live row).
    executionId: uuid("execution_id").references(() => preparationExecutions.id, {
      onDelete: "set null",
    }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    result: outcomeResultEnum("result").notNull().default("unknown"),
    notes: text("notes"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    index("outcomes_tenant_idx").on(t.tenantId),
    index("outcomes_guest_idx").on(t.guestId),
  ],
);

// Wave 2 — immutable execution snapshot. Written when a host marks a Preparation
// "ready" (planned -> prepared): captures WHAT was prepared at that moment so a later
// edit can never rewrite what an outcome refers to. Append-only (never updated).
export const preparationExecutions = pgTable(
  "preparation_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    hostActionId: uuid("host_action_id")
      .notNull()
      .references(() => hostActions.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    // { title, description, rationale, stayId, guestId, recommendationId }
    snapshot: jsonb("snapshot").notNull().default({}),
    preparedByUserId: uuid("prepared_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    preparedAt: timestamp("prepared_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("preparation_executions_tenant_idx").on(t.tenantId),
    uniqueIndex("preparation_executions_action_version_uq").on(t.hostActionId, t.version),
  ],
);

// Append-only event log. NO updated_at. Never updated or deleted.
// Payloads must avoid unnecessary PII (store ids/types, not free guest text).
export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    type: text("type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    correlationId: uuid("correlation_id"),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("events_tenant_occurred_idx").on(t.tenantId, t.occurredAt),
    index("events_correlation_idx").on(t.correlationId),
    index("events_entity_idx").on(t.entityType, t.entityId),
  ],
);

// Wave 1A — Idempotency boundary for the single transactional creation path.
// One row per logical submission attempt (NOT per form lifetime). The whole
// createOrGetPreparation transaction (validate → recommendation → host_action →
// audit → persist ids → mark succeeded) commits atomically with this row.
export const preparationIntents = pgTable(
  "preparation_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    initiatorUserId: uuid("initiator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    idempotencyKey: text("idempotency_key").notNull(),
    // Hash of the logical request; a same-key/different-fingerprint retry is a conflict.
    requestFingerprint: text("request_fingerprint").notNull(),
    status: preparationIntentStatusEnum("status").notNull().default("processing"),
    recommendationId: uuid("recommendation_id").references(() => recommendations.id, {
      onDelete: "set null",
    }),
    preparationId: uuid("preparation_id").references(() => hostActions.id, {
      onDelete: "set null",
    }),
    stayId: uuid("stay_id").references(() => stays.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    // Same user + same key serialises here; the loser reads the winner's committed result.
    uniqueIndex("preparation_intents_key_uq").on(
      t.tenantId,
      t.initiatorUserId,
      t.idempotencyKey,
    ),
    index("preparation_intents_tenant_idx").on(t.tenantId),
  ],
);

// Wave 2A — Pre-Arrival Intelligence Simulation Lab tables (separate file).
// Re-export must stay last so the base tables above are defined before research.ts
// (which references them) is evaluated.
export * from "./research";

// Wave 2B — Property Intelligence tables (additive; references tenants + properties above).
export * from "./propertyIntelligence";

// Wave 2C — Feasibility Engine tables (additive; references the above + research/PI).
export * from "./feasibility";

// Wave 2D — Outcome → Property Learning Loop (additive; FKs into Run 1 +
// feasibility, so it must be re-exported AFTER the tables it references).
export * from "./learning";
