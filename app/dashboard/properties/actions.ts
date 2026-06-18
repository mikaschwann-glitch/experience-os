"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/devAuth";
import { createProperty, createUnit } from "@/lib/repositories/properties";

export async function createPropertyAction(formData: FormData) {
  const { tenantId } = await getAuthContext();
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  if (!name) return;
  await createProperty(tenantId, { name, location: location || null });
  revalidatePath("/dashboard/properties");
}

export async function createUnitAction(formData: FormData) {
  const { tenantId } = await getAuthContext();
  const propertyId = String(formData.get("propertyId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityRaw ? Number(capacityRaw) : undefined;
  if (!propertyId || !name) return;
  await createUnit(tenantId, {
    propertyId,
    name,
    type: type || null,
    capacity: Number.isFinite(capacity) ? capacity : undefined,
  });
  revalidatePath("/dashboard/properties");
}
