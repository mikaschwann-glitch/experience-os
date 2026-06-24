"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/devAuth";
import {
  confirmProposal,
  createAnotherFromAlternative,
  createStayScopedFallback,
  markProposalNotUseful,
  rejectProposal,
} from "@/lib/repositories/feasibility";
import { IdempotencyConflictError } from "@/lib/repositories/preparations";

// The confirmed Preparation surfaces on Today, Preparations, and the guest page,
// so revalidate those (not just the feasibility view).
function revalidate(runId: string, guestId?: string) {
  revalidatePath(`/dashboard/feasibility/${runId}`);
  revalidatePath("/dashboard/preparations");
  revalidatePath("/dashboard");
  if (guestId) revalidatePath(`/dashboard/guests/${guestId}`);
}

/**
 * NORMAL one-step confirm (first selection). Run-level serialised: creates exactly one
 * initial Preparation per run, or returns the existing one (stale/second confirm), then
 * navigates the host to it. Never creates a duplicate from a stale screen.
 */
export async function confirmProposalAction(runId: string, proposalId: string, guestId?: string) {
  const { tenantId, userId } = await getAuthContext();
  const { preparationId } = await confirmProposal(tenantId, userId, proposalId);
  revalidate(runId, guestId);
  redirect(`/dashboard/preparations/${preparationId}`);
}

/**
 * EXPLICIT "create another preparation from a set-aside idea" (from a created
 * Preparation's "Other ideas considered"). Deliberately creates a DISTINCT additional
 * Preparation through the same stay-bound idempotent boundary.
 */
export async function createAnotherPreparationAction(runId: string, proposalId: string, guestId?: string) {
  const { tenantId, userId } = await getAuthContext();
  const { preparationId } = await createAnotherFromAlternative(tenantId, userId, proposalId);
  revalidate(runId, guestId);
  redirect(`/dashboard/preparations/${preparationId}`);
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
 * Stay-scoped host-authored fallback when the system withholds. The hidden
 * idempotencyKey (minted per form render) makes a double-submit/retry return the
 * SAME Preparation; then navigate straight to it. Host-authored, learning-eligible.
 */
export async function createFallbackAction(runId: string, guestId: string, formData: FormData) {
  const { tenantId, userId } = await getAuthContext();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "") || undefined;
  let preparationId: string;
  try {
    const res = await createStayScopedFallback(tenantId, userId, runId, { title, idempotencyKey });
    preparationId = res.preparationId;
  } catch (e) {
    // Clear recovery path (never a generic failure): a same-key/different-content
    // submission returns the host to the run, where the fallback form re-renders with a
    // fresh key so the edited content can be submitted cleanly.
    if (e instanceof IdempotencyConflictError) {
      redirect(`/dashboard/feasibility/${runId}?retry=conflict`);
    }
    throw e;
  }
  revalidate(runId, guestId);
  redirect(`/dashboard/preparations/${preparationId}`);
}
