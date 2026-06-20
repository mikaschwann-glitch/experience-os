import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, type Executor } from "@/db/client";
import {
  localInsights,
  preparationPlaybookActions,
  properties,
  propertyCapabilities,
  propertyConstraints,
} from "@/db/schema";
import { emitEvent, type DomainEventType } from "@/lib/events/events";
import { sanitizeTags } from "@/lib/domain/vocabulary";

/**
 * Tenant- AND property-aware repository for Property Intelligence.
 * Every read/write is scoped by tenantId; every write first verifies the
 * property belongs to the current tenant (client-supplied property_id is never
 * trusted). All matchable tag arrays are sanitized to canonical tokens.
 */

export async function listTenantProperties(tenantId: string) {
  const db = getDb();
  return db
    .select({ id: properties.id, name: properties.name, location: properties.location })
    .from(properties)
    .where(eq(properties.tenantId, tenantId))
    .orderBy(asc(properties.createdAt));
}

/** Throws unless the property exists AND belongs to this tenant. */
async function assertPropertyInTenant(
  exec: Executor,
  tenantId: string,
  propertyId: string,
) {
  const [row] = await exec
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.tenantId, tenantId), eq(properties.id, propertyId)))
    .limit(1);
  if (!row) throw new Error("Property not found for this tenant.");
}

export async function getPropertyIntelligence(tenantId: string, propertyId: string) {
  const db = getDb();
  await assertPropertyInTenant(db, tenantId, propertyId);

  const [capabilities, insights, constraints, playbook] = await Promise.all([
    db
      .select()
      .from(propertyCapabilities)
      .where(and(eq(propertyCapabilities.tenantId, tenantId), eq(propertyCapabilities.propertyId, propertyId)))
      .orderBy(desc(propertyCapabilities.createdAt)),
    db
      .select()
      .from(localInsights)
      .where(and(eq(localInsights.tenantId, tenantId), eq(localInsights.propertyId, propertyId)))
      .orderBy(desc(localInsights.createdAt)),
    db
      .select()
      .from(propertyConstraints)
      .where(and(eq(propertyConstraints.tenantId, tenantId), eq(propertyConstraints.propertyId, propertyId)))
      .orderBy(desc(propertyConstraints.createdAt)),
    db
      .select()
      .from(preparationPlaybookActions)
      .where(and(eq(preparationPlaybookActions.tenantId, tenantId), eq(preparationPlaybookActions.propertyId, propertyId)))
      .orderBy(desc(preparationPlaybookActions.createdAt)),
  ]);
  return { capabilities, insights, constraints, playbook };
}

// Active capability titles for the playbook "linked capability" picker.
export async function listActiveCapabilities(tenantId: string, propertyId: string) {
  const db = getDb();
  return db
    .select({ id: propertyCapabilities.id, title: propertyCapabilities.title })
    .from(propertyCapabilities)
    .where(
      and(
        eq(propertyCapabilities.tenantId, tenantId),
        eq(propertyCapabilities.propertyId, propertyId),
        eq(propertyCapabilities.status, "active"),
      ),
    )
    .orderBy(asc(propertyCapabilities.title));
}

type EntityType = "capability" | "insight" | "constraint" | "playbook";

async function emitPi(
  exec: Executor,
  tenantId: string,
  userId: string,
  type: DomainEventType,
  entity: EntityType,
  entityType: string,
  entityId: string,
  propertyId: string,
  extra: Record<string, unknown> = {},
) {
  await emitEvent(exec, {
    tenantId,
    actorUserId: userId,
    type,
    entityType,
    entityId,
    payload: { entity, propertyId, ...extra },
  });
}

// ---- Create ----

export interface CapabilityInput {
  title: string;
  description?: string | null;
  categoryTags?: string[];
  suitableFor?: string[];
  unsuitableFor?: string[];
  leadTime?: string | null;
  hostEffort?: "low" | "medium" | "high" | null;
  costLevel?: "none" | "low" | "medium" | "high" | null;
}

export async function createCapability(
  tenantId: string,
  userId: string,
  propertyId: string,
  input: CapabilityInput,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await assertPropertyInTenant(tx, tenantId, propertyId);
    const [row] = await tx
      .insert(propertyCapabilities)
      .values({
        tenantId,
        propertyId,
        title: input.title,
        description: input.description ?? null,
        categoryTags: sanitizeTags(input.categoryTags ?? []),
        suitableFor: sanitizeTags(input.suitableFor ?? []),
        unsuitableFor: sanitizeTags(input.unsuitableFor ?? []),
        leadTime: input.leadTime ?? null,
        hostEffort: input.hostEffort ?? null,
        costLevel: input.costLevel ?? null,
      })
      .returning();
    await emitPi(tx, tenantId, userId, "property_intelligence.created", "capability", "property_capability", row.id, propertyId);
    return row;
  });
}

export interface InsightInput {
  title: string;
  description?: string | null;
  categoryTags?: string[];
  suitableFor?: string[];
  unsuitableFor?: string[];
  bestTimeOfDay?: string | null;
  seasonalSuitability?: string | null;
  weatherDependency?: string | null;
  distanceDuration?: string | null;
  reservationRequired?: boolean;
  hostEffort?: "low" | "medium" | "high" | null;
  freshness?: "stable" | "verify_before_use" | "dynamic";
}

export async function createLocalInsight(
  tenantId: string,
  userId: string,
  propertyId: string,
  input: InsightInput,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await assertPropertyInTenant(tx, tenantId, propertyId);
    const [row] = await tx
      .insert(localInsights)
      .values({
        tenantId,
        propertyId,
        title: input.title,
        description: input.description ?? null,
        categoryTags: sanitizeTags(input.categoryTags ?? []),
        suitableFor: sanitizeTags(input.suitableFor ?? []),
        unsuitableFor: sanitizeTags(input.unsuitableFor ?? []),
        bestTimeOfDay: input.bestTimeOfDay ?? null,
        seasonalSuitability: input.seasonalSuitability ?? null,
        weatherDependency: input.weatherDependency ?? null,
        distanceDuration: input.distanceDuration ?? null,
        reservationRequired: input.reservationRequired ?? false,
        hostEffort: input.hostEffort ?? null,
        freshness: input.freshness ?? "stable",
        // visibility defaults to property_private in the schema.
      })
      .returning();
    await emitPi(tx, tenantId, userId, "property_intelligence.created", "insight", "local_insight", row.id, propertyId, {
      freshness: row.freshness,
    });
    return row;
  });
}

export interface ConstraintInput {
  title: string;
  description?: string | null;
  ruleType?: "exclusion" | "timing" | "weather" | "mobility" | "suitability" | "partner" | "other";
  severity?: "soft" | "hard";
  applicabilityTags?: string[];
}

export async function createConstraint(
  tenantId: string,
  userId: string,
  propertyId: string,
  input: ConstraintInput,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await assertPropertyInTenant(tx, tenantId, propertyId);
    const [row] = await tx
      .insert(propertyConstraints)
      .values({
        tenantId,
        propertyId,
        title: input.title,
        description: input.description ?? null,
        ruleType: input.ruleType ?? "exclusion",
        severity: input.severity ?? "soft",
        applicabilityTags: sanitizeTags(input.applicabilityTags ?? []),
      })
      .returning();
    await emitPi(tx, tenantId, userId, "property_intelligence.created", "constraint", "property_constraint", row.id, propertyId, {
      severity: row.severity,
    });
    return row;
  });
}

export interface PlaybookInput {
  title: string;
  description?: string | null;
  linkedCapabilityId?: string | null;
  leadTime?: string | null;
  hostEffort?: "low" | "medium" | "high" | null;
  costLevel?: "none" | "low" | "medium" | "high" | null;
  suitableFor?: string[];
}

export async function createPlaybookAction(
  tenantId: string,
  userId: string,
  propertyId: string,
  input: PlaybookInput,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await assertPropertyInTenant(tx, tenantId, propertyId);
    // If a capability is linked, it must belong to the same tenant+property.
    let linked: string | null = null;
    if (input.linkedCapabilityId) {
      const [cap] = await tx
        .select({ id: propertyCapabilities.id })
        .from(propertyCapabilities)
        .where(
          and(
            eq(propertyCapabilities.tenantId, tenantId),
            eq(propertyCapabilities.propertyId, propertyId),
            eq(propertyCapabilities.id, input.linkedCapabilityId),
          ),
        )
        .limit(1);
      linked = cap?.id ?? null;
    }
    const [row] = await tx
      .insert(preparationPlaybookActions)
      .values({
        tenantId,
        propertyId,
        title: input.title,
        description: input.description ?? null,
        linkedCapabilityId: linked,
        leadTime: input.leadTime ?? null,
        hostEffort: input.hostEffort ?? null,
        costLevel: input.costLevel ?? null,
        suitableFor: sanitizeTags(input.suitableFor ?? []),
      })
      .returning();
    await emitPi(tx, tenantId, userId, "property_intelligence.created", "playbook", "playbook_action", row.id, propertyId);
    return row;
  });
}

// ---- Status lifecycle (edit/pause/archive/restore) ----

function eventForStatus(status: "active" | "paused" | "archived"): DomainEventType {
  if (status === "archived") return "property_intelligence.archived";
  if (status === "active") return "property_intelligence.restored";
  return "property_intelligence.updated";
}

export async function setCapabilityStatus(
  tenantId: string,
  userId: string,
  id: string,
  status: "active" | "paused" | "archived",
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(propertyCapabilities)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(propertyCapabilities.tenantId, tenantId), eq(propertyCapabilities.id, id)))
      .returning();
    if (!row) throw new Error("Capability not found for this tenant.");
    await emitPi(tx, tenantId, userId, eventForStatus(status), "capability", "property_capability", row.id, row.propertyId, { status });
    return row;
  });
}

export async function setInsightStatus(
  tenantId: string,
  userId: string,
  id: string,
  status: "active" | "paused" | "archived",
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(localInsights)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(localInsights.tenantId, tenantId), eq(localInsights.id, id)))
      .returning();
    if (!row) throw new Error("Local insight not found for this tenant.");
    await emitPi(tx, tenantId, userId, eventForStatus(status), "insight", "local_insight", row.id, row.propertyId, { status });
    return row;
  });
}

export async function setPlaybookStatus(
  tenantId: string,
  userId: string,
  id: string,
  status: "active" | "paused" | "archived",
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(preparationPlaybookActions)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(preparationPlaybookActions.tenantId, tenantId), eq(preparationPlaybookActions.id, id)))
      .returning();
    if (!row) throw new Error("Playbook action not found for this tenant.");
    await emitPi(tx, tenantId, userId, eventForStatus(status), "playbook", "playbook_action", row.id, row.propertyId, { status });
    return row;
  });
}

export async function setConstraintActive(
  tenantId: string,
  userId: string,
  id: string,
  active: boolean,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(propertyConstraints)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(propertyConstraints.tenantId, tenantId), eq(propertyConstraints.id, id)))
      .returning();
    if (!row) throw new Error("Constraint not found for this tenant.");
    await emitPi(
      tx,
      tenantId,
      userId,
      active ? "property_intelligence.restored" : "property_intelligence.updated",
      "constraint",
      "property_constraint",
      row.id,
      row.propertyId,
      { active },
    );
    return row;
  });
}
