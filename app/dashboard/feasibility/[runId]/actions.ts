"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/devAuth";
import {
  confirmProposal,
  createStayScopedFallback,
  markProposalNotUseful,
  rejectProposal,
} from "@/lib/repositories/feasibility";

// The confirmed recommendation + host action surface on the guest page and Today,
// so revalidate those too (not just the feasibility/recommendations views).
function revalidate(runId: string, guestId?: string) {
  revalidatePath(`/dashboard/feasibility/${runId}`);
  revalidatePath("/dashboard/recommendations");
  revalidatePath("/dashboard");
  if (guestId) revalidatePath(`/dashboard/guests/${guestId}`);
}

/**
 * One-step, idempotent confirm: accept + convert into exactly one recommendation
 * and exactly one host action. Repeated submission is a safe no-op.
 */
export async function confirmProposalAction(runId: string, proposalId: string, guestId?: string) {
  const { tenantId, userId } = await getAuthContext();
  await confirmProposal(tenantId, userId, proposalId);
  revalidate(runId, guestId);
}

export async function rejectProposalAction(runId: string, proposalId: string, guestId?: string) {
  const { tenantId, userId } = await getAuthContext();
  await rejectProposal(tenantId, userId, proposalId);
  revalidate(runId, guestId);
}

export async function notUsefulProposalAction(runId: string, proposalId: string, guestId?: string) {
  const { tenantId, userId } = await getAuthContext();
  await markProposalNotUseful(tenantId, userId, proposalId);
  revalidate(runId, guestId);
}

/**
 * Stay-scoped free-form fallback: the host authors their own preparation when the
 * system withholds. Creates a host-authored recommendation + host action that stays
 * learning-eligible. Not a system recommendation.
 */
export async function createFallbackAction(runId: string, guestId: string, formData: FormData) {
  const { tenantId, userId } = await getAuthContext();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await createStayScopedFallback(tenantId, userId, runId, { title });
  revalidate(runId, guestId);
}
