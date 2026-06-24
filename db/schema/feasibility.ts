/**
 * Wave 2C — Capability-First Feasibility Engine schema (additive).
 *
 * Turns an APPROVED pre-arrival brief + this property's private knowledge into a
 * small number of feasible host preparations — or deliberately withholds.
 *
 * Provenance is explicit and queryable: a proposal links to the brief (via run),
 * the local insight, the capability, the (Run 1) recommendation it converts to,
 * and to the guest evidence it was built from (feasibility_proposal_evidence).
 * Sensitive/blocked evidence never reaches here (the engine only reads allowed,
 * brief-included evidence).
 *
 * Accepted proposals REUSE the Run 1 recommendations → host_actions → outcomes
 * lifecycle; this file adds no parallel action/outcome model.
 */
import { pgEnum, pgTable, uuid, text, integer, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import {
  tenants,
  properties,
  guests,
  stays,
  signals,
  users,
  prearrivalBriefs,
  localInsights,
  propertyCapabilities,
  preparationPlaybookActions,
  recommendations,
  evidenceItems,
  piEffortEnum,
  piCostEnum,
} from "./index";
import { triggerSourceEnum } from "./enums";

export const feasibilityRunStatusEnum = pgEnum("feasibility_run_status", [
  "completed",
  "refused",
]);

export const feasibilityProposalStatusEnum = pgEnum("feasibility_proposal_status", [
  "proposed",
  "requires_confirmation",
  "withheld",
  "accepted",
  "rejected",
  "not_useful",
  "converted_to_host_action",
  // Wave 2 completion: a SIBLING alternative from the same run, set aside because the
  // host chose another proposal for this one guest need. NOT rejected / not_useful /
  // deleted — auditable, non-actionable, shown only under "Other ideas considered".
  "superseded",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};
const tenantCol = () =>
  uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" });

export const feasibilityRuns = pgTable(
  "feasibility_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    // Nullable: a first-party (host-note / guest-request) run has no brief.
    briefId: uuid("brief_id").references(() => prearrivalBriefs.id, {
      onDelete: "cascade",
    }),
    jobId: uuid("job_id"),
    stayId: uuid("stay_id").references(() => stays.id, { onDelete: "set null" }),
    // Wave 2D.1 — first-party reactive provenance + traceability. Set explicitly
    // by each adapter; never inferred from brief_id. For research/brief runs:
    // externally_researched=true, trigger_source=null, source_signal_id=null.
    triggerSource: triggerSourceEnum("trigger_source"),
    externallyResearched: boolean("externally_researched").notNull().default(false),
    // Causal link back to the originating first-party signal (host note / guest
    // request). Null for research and future profile-match runs.
    sourceSignalId: uuid("source_signal_id").references(() => signals.id, {
      onDelete: "set null",
    }),
    status: feasibilityRunStatusEnum("status").notNull().default("completed"),
    refusedReason: text("refused_reason"),
    // Simulated, clearly-labelled context (no live sources). e.g. { weather, transport }.
    simContext: jsonb("sim_context").notNull().default({}),
    proposalCount: integer("proposal_count").notNull().default(0),
    actionableCount: integer("actionable_count").notNull().default(0),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("feasibility_runs_tenant_idx").on(t.tenantId),
    index("feasibility_runs_property_idx").on(t.tenantId, t.propertyId),
    index("feasibility_runs_brief_idx").on(t.tenantId, t.briefId),
  ],
);

export const feasibilityProposals = pgTable(
  "feasibility_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    runId: uuid("run_id")
      .notNull()
      .references(() => feasibilityRuns.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull(),
    guestId: uuid("guest_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    rationale: text("rationale"),
    status: feasibilityProposalStatusEnum("status").notNull().default("proposed"),
    // For withheld/confirmation: a machine-readable reason (queryable).
    reasonCode: text("reason_code"),
    withheldReason: text("withheld_reason"),
    confirmationRequired: boolean("confirmation_required").notNull().default(false),
    freshness: text("freshness"),
    priority: integer("priority").notNull().default(0),
    leadTime: text("lead_time"),
    hostEffort: piEffortEnum("host_effort"),
    costLevel: piCostEnum("cost_level"),
    // Provenance (explicit FK references, queryable).
    linkedLocalInsightId: uuid("linked_local_insight_id").references(() => localInsights.id, {
      onDelete: "set null",
    }),
    linkedCapabilityId: uuid("linked_capability_id").references(() => propertyCapabilities.id, {
      onDelete: "set null",
    }),
    linkedPlaybookActionId: uuid("linked_playbook_action_id").references(
      () => preparationPlaybookActions.id,
      { onDelete: "set null" },
    ),
    recommendationId: uuid("recommendation_id").references(() => recommendations.id, {
      onDelete: "set null",
    }),
    matchedTags: jsonb("matched_tags").notNull().default([]),
    constraintsChecked: jsonb("constraints_checked").notNull().default([]),
    ...timestamps,
  },
  (t) => [
    index("feasibility_proposals_tenant_idx").on(t.tenantId),
    index("feasibility_proposals_run_idx").on(t.runId),
  ],
);

// Guest-evidence basis for each proposal (the brief evidence that justified it).
export const feasibilityProposalEvidence = pgTable(
  "feasibility_proposal_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => feasibilityProposals.id, { onDelete: "cascade" }),
    evidenceItemId: uuid("evidence_item_id").references(() => evidenceItems.id, {
      onDelete: "set null",
    }),
    category: text("category").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("feasibility_proposal_evidence_tenant_idx").on(t.tenantId),
    index("feasibility_proposal_evidence_proposal_idx").on(t.proposalId),
  ],
);
