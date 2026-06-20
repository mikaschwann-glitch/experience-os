"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/devAuth";
import {
  acceptProposal,
  convertProposalToHostAction,
  markProposalNotUseful,
  rejectProposal,
} from "@/lib/repositories/feasibility";

function revalidate(runId: string) {
  revalidatePath(`/dashboard/feasibility/${runId}`);
  revalidatePath("/dashboard/recommendations");
}

export async function acceptProposalAction(runId: string, proposalId: string) {
  const { tenantId, userId } = await getAuthContext();
  await acceptProposal(tenantId, userId, proposalId);
  revalidate(runId);
}
export async function rejectProposalAction(runId: string, proposalId: string) {
  const { tenantId, userId } = await getAuthContext();
  await rejectProposal(tenantId, userId, proposalId);
  revalidate(runId);
}
export async function notUsefulProposalAction(runId: string, proposalId: string) {
  const { tenantId, userId } = await getAuthContext();
  await markProposalNotUseful(tenantId, userId, proposalId);
  revalidate(runId);
}
export async function convertProposalAction(runId: string, proposalId: string) {
  const { tenantId, userId } = await getAuthContext();
  await convertProposalToHostAction(tenantId, userId, proposalId);
  revalidate(runId);
}
