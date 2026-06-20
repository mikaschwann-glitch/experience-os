/**
 * Wave 2B — Property Intelligence schema.
 *
 * A property-private operational knowledge layer maintained by the owner/host:
 *  - what this property can realistically do (capabilities)
 *  - local insight only this property knows (local_insights)
 *  - what must never be suggested (property_constraints)
 *  - repeatable host preparations (preparation_playbook_actions)
 *
 * Tenancy/scope: EVERY table carries tenant_id AND a mandatory property_id
 * (FK → properties). Knowledge is property-private by default and never shared
 * across tenants or properties. Matchable tags are stored as jsonb arrays of
 * CANONICAL tags (validated at the app layer via lib/domain/vocabulary.ts) so the
 * future Feasibility Engine can match guest context to property knowledge.
 *
 * Run 1 / Wave 2A are untouched; this file is additive.
 */
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants, properties } from "./index";

// ---- Enums ----
export const piStatusEnum = pgEnum("pi_status", ["active", "paused", "archived"]);
export const piEffortEnum = pgEnum("pi_effort", ["low", "medium", "high"]);
export const piCostEnum = pgEnum("pi_cost", ["none", "low", "medium", "high"]);
export const piFreshnessEnum = pgEnum("pi_freshness", [
  "stable",
  "verify_before_use",
  "dynamic",
]);
export const piRuleTypeEnum = pgEnum("pi_rule_type", [
  "exclusion",
  "timing",
  "weather",
  "mobility",
  "suitability",
  "partner",
  "other",
]);
export const piSeverityEnum = pgEnum("pi_severity", ["soft", "hard"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

const tenantCol = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

// property_id is MANDATORY for every Property Intelligence entity.
const propertyCol = () =>
  uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" });

// ---- A. Property Capabilities ----
export const propertyCapabilities = pgTable(
  "property_capabilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    propertyId: propertyCol(),
    title: text("title").notNull(),
    description: text("description"),
    categoryTags: jsonb("category_tags").notNull().default([]),
    suitableFor: jsonb("suitable_for").notNull().default([]),
    unsuitableFor: jsonb("unsuitable_for").notNull().default([]),
    leadTime: text("lead_time"),
    hostEffort: piEffortEnum("host_effort"),
    costLevel: piCostEnum("cost_level"),
    status: piStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("property_capabilities_tenant_idx").on(t.tenantId),
    index("property_capabilities_property_idx").on(t.tenantId, t.propertyId),
  ],
);

// ---- B. Private Local Insights ----
export const localInsights = pgTable(
  "local_insights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    propertyId: propertyCol(),
    title: text("title").notNull(),
    description: text("description"),
    categoryTags: jsonb("category_tags").notNull().default([]),
    suitableFor: jsonb("suitable_for").notNull().default([]),
    unsuitableFor: jsonb("unsuitable_for").notNull().default([]),
    bestTimeOfDay: text("best_time_of_day"),
    seasonalSuitability: text("seasonal_suitability"),
    weatherDependency: text("weather_dependency"),
    distanceDuration: text("distance_duration"),
    reservationRequired: boolean("reservation_required").notNull().default(false),
    hostEffort: piEffortEnum("host_effort"),
    freshness: piFreshnessEnum("freshness").notNull().default("stable"),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    status: piStatusEnum("status").notNull().default("active"),
    // Fixed to property-private; never shared across properties/tenants or to guests.
    visibility: text("visibility").notNull().default("property_private"),
    ...timestamps,
  },
  (t) => [
    index("local_insights_tenant_idx").on(t.tenantId),
    index("local_insights_property_idx").on(t.tenantId, t.propertyId),
  ],
);

// ---- C. Constraints & No-Go Rules ----
export const propertyConstraints = pgTable(
  "property_constraints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    propertyId: propertyCol(),
    title: text("title").notNull(),
    description: text("description"),
    ruleType: piRuleTypeEnum("rule_type").notNull().default("exclusion"),
    severity: piSeverityEnum("severity").notNull().default("soft"),
    applicabilityTags: jsonb("applicability_tags").notNull().default([]),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("property_constraints_tenant_idx").on(t.tenantId),
    index("property_constraints_property_idx").on(t.tenantId, t.propertyId),
  ],
);

// ---- D. Preparation Playbook ----
export const preparationPlaybookActions = pgTable(
  "preparation_playbook_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: tenantCol(),
    propertyId: propertyCol(),
    title: text("title").notNull(),
    description: text("description"),
    // Optional link to a capability that enables this preparation.
    linkedCapabilityId: uuid("linked_capability_id").references(
      () => propertyCapabilities.id,
      { onDelete: "set null" },
    ),
    leadTime: text("lead_time"),
    hostEffort: piEffortEnum("host_effort"),
    costLevel: piCostEnum("cost_level"),
    suitableFor: jsonb("suitable_for").notNull().default([]),
    status: piStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("preparation_playbook_tenant_idx").on(t.tenantId),
    index("preparation_playbook_property_idx").on(t.tenantId, t.propertyId),
  ],
);
