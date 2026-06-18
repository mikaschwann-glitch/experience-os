"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/devAuth";
import { setRecommendationStatus } from "@/lib/repositories/slice";

export async function approveAction(recommendationId: string) {
  const { tenantId, userId } = await getAuthContext();
  await setRecommendationStatus(tenantId, userId, recommendationId, "accepted");
  revalidatePath("/dashboard/recommendations");
  revalidatePath("/dashboard");
}

export async function dismissAction(recommendationId: string) {
  const { tenantId, userId } = await getAuthContext();
  await setRecommendationStatus(tenantId, userId, recommendationId, "dismissed");
  revalidatePath("/dashboard/recommendations");
  revalidatePath("/dashboard");
}
