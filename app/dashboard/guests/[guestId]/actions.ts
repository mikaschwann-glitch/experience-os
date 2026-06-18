"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/devAuth";
import {
  createHostAction,
  createInsightFromSignal,
  createRecommendationFromInsight,
  createSignal,
  logOutcome,
  setRecommendationStatus,
} from "@/lib/repositories/slice";

/**
 * Server actions for the manual vertical slice. Each one resolves tenant/user
 * from the server-side dev-auth stub (never trusts the client) and delegates to
 * the tenant-aware repository, then revalidates the affected views.
 */
function revalidateGuest(guestId: string) {
  revalidatePath(`/dashboard/guests/${guestId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/recommendations");
}

export async function createSignalAction(guestId: string, formData: FormData) {
  const { tenantId, userId } = await getAuthContext();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await createSignal(tenantId, userId, { guestId, body });
  revalidateGuest(guestId);
}

export async function createInsightAction(
  signalId: string,
  guestId: string,
  formData: FormData,
) {
  const { tenantId, userId } = await getAuthContext();
  const summary = String(formData.get("summary") ?? "").trim();
  if (!summary) return;
  await createInsightFromSignal(tenantId, userId, signalId, { summary });
  revalidateGuest(guestId);
}

export async function createRecommendationAction(
  insightId: string,
  guestId: string,
  formData: FormData,
) {
  const { tenantId, userId } = await getAuthContext();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title) return;
  await createRecommendationFromInsight(tenantId, userId, insightId, {
    title,
    description: description || null,
  });
  revalidateGuest(guestId);
}

export async function acceptRecommendationAction(
  recommendationId: string,
  guestId: string,
) {
  const { tenantId, userId } = await getAuthContext();
  await setRecommendationStatus(tenantId, userId, recommendationId, "accepted");
  revalidateGuest(guestId);
}

export async function dismissRecommendationAction(
  recommendationId: string,
  guestId: string,
) {
  const { tenantId, userId } = await getAuthContext();
  await setRecommendationStatus(tenantId, userId, recommendationId, "dismissed");
  revalidateGuest(guestId);
}

export async function createHostActionAction(
  recommendationId: string,
  guestId: string,
  formData: FormData,
) {
  const { tenantId, userId } = await getAuthContext();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await createHostAction(tenantId, userId, recommendationId, { title });
  revalidateGuest(guestId);
}

export async function logOutcomeAction(
  hostActionId: string,
  guestId: string,
  formData: FormData,
) {
  const { tenantId, userId } = await getAuthContext();
  const result = String(formData.get("result") ?? "unknown") as
    | "positive"
    | "neutral"
    | "negative"
    | "unknown";
  const notes = String(formData.get("notes") ?? "").trim();
  await logOutcome(tenantId, userId, hostActionId, { result, notes: notes || null });
  revalidateGuest(guestId);
}
