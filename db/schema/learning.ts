/**
 * Wave 2D — Outcome → Property Learning Loop schema (additive).
 *
 * A learning draft is the host's optional, explicit capture of what a property
 * should remember after a completed action/outcome. It is NOT a second outcome
 * model: outcomes stay immutable terminal nodes of the Run 1 chain; a draft is a
 * separate, human-approved staging row that a host may later PROMOTE into a real
 * Property Intelligence item (capability / local insight / constraint / playbook).
 *
 * Provenance hub: this one table carries every available back-link (outcome,
 * host action, recommendation, feasibility proposal, brief, stay, guest) AND the
 * forward link to the PI item it was promoted into (promoted_item_type/id). So
 * the full chain is queryable from a single row in both directions, without
 * adding columns to the four PI tables.
 *
 * Tenancy/scope: tenant_id + a MANDATORY property_id. Knowledge is property-
 * private; a draft is only ever read/promoted under its own (tenant, property).
 * The natural-language note is host-authored freetext — blocked/sensitive
 * research evidence is never copied into a draft.
 */
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import {
  tenants,
  properties,
  guests,
  stays,
  users,
  outcomes,
  hostActions,
  recommendations,
  prearrivalBriefs,
  feasibilityProposals,
} from "./index";

// The four PI item kinds a draft can become (mirrors the PI repository).
export const learningTypeEnum = pgEnum("learning_type", [
  "local_insight",
  "constraint",
  "capability",
  "playbook",
]);

export const learningDraftStatusEnum = pgEnum("learning_draft_status", [
  "draft",
  "promoted",
  "discarded",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const propertyLearningDrafts = pgTable(
  "property_learning_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Property scope is mandatory: a learning is always about ONE property.
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),

    // Source provenance — kept where available (set null on source deletion so a
    // draft/promoted PI item survives even if the originating row is removed).
    outcomeId: uuid("outcome_id").references(() => outcomes.id, { onDelete: "set null" }),
    hostActionId: uuid("host_action_id").references(() => hostActions.id, { onDelete: "set null" }),
    recommendationId: uuid("recommendation_id").references(() => recommendations.id, {
      onDelete: "set null",
    }),
    feasibilityProposalId: uuid("feasibility_proposal_id").references(
      () => feasibilityProposals.id,
      { onDelete: "set null" },
    ),
    briefId: uuid("brief_id").references(() => prearrivalBriefs.id, { onDelete: "set null" }),
    stayId: uuid("stay_id").references(() => stays.id, { onDelete: "set null" }),
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "set null" }),

    // The captured learning.
    learningType: learningTypeEnum("learning_type").notNull(),
    note: text("note").notNull(),
    tags: jsonb("tags").notNull().default([]),
    status: learningDraftStatusEnum("status").notNull().default("draft"),

    // Forward link to the PI item created on promotion (no FK: it may point at any
    // of the four PI tables; the type discriminates).
    promotedItemType: text("promoted_item_type"),
    promotedItemId: uuid("promoted_item_id"),

    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("property_learning_drafts_tenant_idx").on(t.tenantId),
    index("property_learning_drafts_property_idx").on(t.tenantId, t.propertyId),
    index("property_learning_drafts_status_idx").on(t.tenantId, t.status),
    index("property_learning_drafts_outcome_idx").on(t.tenantId, t.outcomeId),
  ],
);
