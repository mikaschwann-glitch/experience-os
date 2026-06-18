import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { properties, units } from "@/db/schema";

/** Tenant-aware repository for properties & units (basic CRUD in Run 1). */

export async function listPropertiesWithUnits(tenantId: string) {
  const db = getDb();

  const [propertyRows, unitRows] = await Promise.all([
    db
      .select()
      .from(properties)
      .where(eq(properties.tenantId, tenantId))
      .orderBy(asc(properties.name)),
    db
      .select()
      .from(units)
      .where(eq(units.tenantId, tenantId))
      .orderBy(asc(units.name)),
  ]);

  return propertyRows.map((p) => ({
    ...p,
    units: unitRows.filter((u) => u.propertyId === p.id),
  }));
}

export async function createProperty(
  tenantId: string,
  input: { name: string; location?: string | null },
) {
  const db = getDb();
  const [row] = await db
    .insert(properties)
    .values({
      tenantId,
      name: input.name,
      location: input.location ?? null,
    })
    .returning();
  return row;
}

export async function createUnit(
  tenantId: string,
  input: {
    propertyId: string;
    name: string;
    type?: string | null;
    capacity?: number;
  },
) {
  const db = getDb();

  // Tenant safety: only allow attaching a unit to a property of THIS tenant.
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(eq(properties.tenantId, tenantId), eq(properties.id, input.propertyId)),
    )
    .limit(1);
  if (!property) throw new Error("Property not found for tenant.");

  const [row] = await db
    .insert(units)
    .values({
      tenantId,
      propertyId: property.id,
      name: input.name,
      type: input.type ?? null,
      capacity: input.capacity ?? 2,
    })
    .returning();
  return row;
}
