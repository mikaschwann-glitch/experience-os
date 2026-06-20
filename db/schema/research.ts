/**
 * Wave 2A — Pre-Arrival Intelligence Simulation Lab schema.
 *
 * SIMULATION ONLY. These tables back a controlled, fixture-driven simulation of
 * the future pre-arrival intelligence pipeline. They never hold live web data or
 * real public profiles. Excerpts stored here come from local controlled fixtures.
 *
 * Tenancy: every table is tenant-owned (tenant_id -> tenants, ON DELETE CASCADE)
 * and follows the existing app-layer scoping pattern. No raw source documents are
 * stored — only short controlled excerpts + fixture/source references.
 */
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants, guests, stays, users } from "./index";

// ---- Enums ----
export const consentStatusEnum = pgEnum("consent_status", ["granted", "withdrawn"]);
export const researchJobStatusEnum = pgEnum("research_job_status", [
  "queued",
  "running",
  "blocked",
  "needs_review",
  "completed",
  "aborted",
]);
export const confidenceLevelEnum = pgEnum("confidence_level", ["high", "medium", "low"]);
export const identityResolutionEnum = pgEnum("identity_resolution", [
  "pending",
  "confirmed",
  "rejected",
]);
export const evidenceClassificationEnum = pgEnum("evidence_classification", [
  "allowed",
  "prohibited_sensitive",
  "irrelevant",
  "disallowed_source",
  "insufficient_confidence",
]);
export const sourcePolicyEnum = pgEnum("source_policy", ["allowed", "disallowed"]);
export const briefStatusEnum = pgEnum("brief_status", [
  "draft",
  "approved",
  "rejected",
  "edited",
  "not_useful",
  "revoked",
]);
export const briefItemKindEnum = pgEnum("brief_item_kind", ["context", "preparation"]);
export const policyIncidentKindEnum = pgEnum("policy_incident_kind", [
  "no_consent_refused",
  "consent_withdrawn_abort",
  "disallowed_source_refused",
  "prohibited_sensitive_blocked",
  "low_confidence_no_brief",
  "no_match",
  "false_match_uncertain",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

const tenantCol = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

// ---- Consent (research-scoped grant; distinct from the generic Run 1 consents) ----
export const consentGrants = pgTable(
  "consent_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("prearrival_research"),
    status: consentStatusEnum("status").notNull().default("granted"),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("consent_grants_tenant_idx").on(t.tenantId),
    index("consent_grants_guest_idx").on(t.guestId),
  ],
);

// ---- Research job (one per guest/run) ----
export const researchJobs = pgTable(
  "research_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    stayId: uuid("stay_id").references(() => stays.id, { onDelete: "set null" }),
    consentGrantId: uuid("consent_grant_id"),
    scenarioKey: text("scenario_key").notNull(),
    status: researchJobStatusEnum("status").notNull().default("queued"),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Plain uuids (no FK) — set after candidate/brief rows are created in the same run.
    bestCandidateId: uuid("best_candidate_id"),
    briefId: uuid("brief_id"),
    abortReason: text("abort_reason"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("research_jobs_tenant_idx").on(t.tenantId),
    index("research_jobs_guest_idx").on(t.guestId),
  ],
);

// ---- Sources considered in a job (fixture refs + short excerpts only) ----
export const researchSources = pgTable(
  "research_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => researchJobs.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id").notNull(),
    fixtureSourceKey: text("fixture_source_key").notNull(),
    kind: text("kind").notNull(), // personal_website | official_bio | interview | article
    title: text("title").notNull(),
    url: text("url"), // fictional
    policyStatus: sourcePolicyEnum("policy_status").notNull().default("allowed"),
    excerpt: text("excerpt"), // short, controlled; omitted for disallowed sources
    ...timestamps,
  },
  (t) => [
    index("research_sources_tenant_idx").on(t.tenantId),
    index("research_sources_job_idx").on(t.jobId),
  ],
);

// ---- Identity candidates with deterministic confidence ----
export const identityCandidates = pgTable(
  "identity_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => researchJobs.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id").notNull(),
    fixtureCandidateKey: text("fixture_candidate_key").notNull(),
    label: text("label").notNull(),
    score: integer("score").notNull().default(0),
    level: confidenceLevelEnum("level").notNull().default("low"),
    resolution: identityResolutionEnum("resolution").notNull().default("pending"),
    signals: jsonb("signals").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("identity_candidates_tenant_idx").on(t.tenantId),
    index("identity_candidates_job_idx").on(t.jobId),
  ],
);

// ---- Evidence ledger (every item classified by the policy engine) ----
export const evidenceItems = pgTable(
  "evidence_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => researchJobs.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => researchSources.id, {
      onDelete: "set null",
    }),
    candidateId: uuid("candidate_id"),
    category: text("category").notNull(),
    excerpt: text("excerpt"), // suppressed for prohibited/disallowed in the UI layer
    classification: evidenceClassificationEnum("classification").notNull(),
    actionable: boolean("actionable").notNull().default(false),
    includedInBrief: boolean("included_in_brief").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("evidence_items_tenant_idx").on(t.tenantId),
    index("evidence_items_job_idx").on(t.jobId),
  ],
);

// ---- Pre-arrival brief draft + items ----
export const prearrivalBriefs = pgTable(
  "prearrival_briefs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    stayId: uuid("stay_id").references(() => stays.id, { onDelete: "set null" }),
    jobId: uuid("job_id").notNull(),
    status: briefStatusEnum("status").notNull().default("draft"),
    confidence: confidenceLevelEnum("confidence").notNull().default("high"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    hostNote: text("host_note"),
    ...timestamps,
  },
  (t) => [
    index("prearrival_briefs_tenant_idx").on(t.tenantId),
    index("prearrival_briefs_guest_idx").on(t.guestId),
  ],
);

export const briefItems = pgTable(
  "brief_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => prearrivalBriefs.id, { onDelete: "cascade" }),
    // Hard gate: every brief item links to an evidence item.
    evidenceItemId: uuid("evidence_item_id").references(() => evidenceItems.id, {
      onDelete: "set null",
    }),
    kind: briefItemKindEnum("kind").notNull().default("context"),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("brief_items_tenant_idx").on(t.tenantId),
    index("brief_items_brief_idx").on(t.briefId),
  ],
);

// ---- Policy incidents / audit of every block or refusal ----
export const policyIncidents = pgTable(
  "policy_incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    jobId: uuid("job_id"),
    guestId: uuid("guest_id"),
    kind: policyIncidentKindEnum("kind").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("policy_incidents_tenant_idx").on(t.tenantId)],
);
