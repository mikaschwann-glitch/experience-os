"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/devAuth";
import { markPrepared } from "@/lib/repositories/slice";

/**
 * Wave 2 — "Mark as ready": the host physically prepared this item. Transitions
 * planned -> prepared and writes the immutable execution snapshot (idempotent).
 * Recoverable everywhere, so revalidate Today, Preparations, and the guest record.
 */
export async function markPreparedAction(preparationId: string, guestId: string) {
  const { tenantId, userId } = await getAuthContext();
  await markPrepared(tenantId, userId, preparationId);
  revalidatePath(`/dashboard/preparations/${preparationId}`);
  revalidatePath("/dashboard/preparations");
  revalidatePath("/dashboard");
  if (guestId) revalidatePath(`/dashboard/guests/${guestId}`);
}
