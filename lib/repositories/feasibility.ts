import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  feasibilityProposals,
  feasibilityRuns,
  guests,
  properties,
  recommendations,
} from "@/db/schema";
import { emitEvent } from "@/lib/events/events";
import { createHostAction } from "@/lib/repositories/slice";

/** Tenant-aware reads + host-review writes for feasibility. */

export async function getFeasibilityRun(tenantId: string, runId: string) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(feasibilityRuns)
    .where(and(eq(feasibilityRuns.tenantId, tenantId), eq(feasibilityRuns.id, runId)))
    .limit(1);
  if (!run) return null;

  const [[guest], [property], proposals] = await Promise.all([
    db.select().from(guests).where(and(eq(guests.tenantId, tenantId), eq(guests.id, run.guestId))).limit(1),
    db.select().from(properties).where(and(eq(properties.tenantId, tenantId), eq(properties.id, run.propertyId))).limit(1),
    db
      .select()
      .from(feasibilityProposals)
      .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, runId)))
      .orderBy(asc(feasibilityProposals.priority), asc(feasibilityProposals.createdAt)),
  ]);

  return {
    run,
    guest: guest ?? null,
    property: property ?? null,
    actionable: proposals.filter((p) => p.status !== "withheld"),
    withheld: proposals.filter((p) => p.status === "withheld"),
  };
}

/** Latest run for a brief (so the brief page can link straight to a result). */
export async function getLatestRunForBrief(tenantId: string, briefId: string) {
  const db = getDb();
  const [run] = await db
    .select({ id: feasibilityRuns.id })
    .from(feasibilityRuns)
    .where(and(eq(feasibilityRuns.tenantId, tenantId), eq(feasibilityRuns.briefId, briefId)))
    .orderBy(desc(feasibilityRuns.createdAt))
    .limit(1);
  return run ?? null;
}

async function loadProposal(tenantId: string, proposalId: string) {
  const db = getDb();
  const [p] = await db
    .select()
    .from(feasibilityProposals)
    .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, proposalId)))
    .limit(1);
  return p ?? null;
}

/**
 * Accept a proposal → mint a Run 1 recommendation (generated_by='rules', already
 * host-accepted) and back-link it. Reuses the existing recommendation lifecycle.
 */
export async function acceptProposal(tenantId: string, userId: string, proposalId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [p] = await tx
      .select()
      .from(feasibilityProposals)
      .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, proposalId)))
      .limit(1);
    if (!p) throw new Error("Proposal not found for this tenant.");
    if (p.status === "withheld") throw new Error("A withheld proposal cannot be accepted.");

    const [run] = await tx
      .select({ stayId: feasibilityRuns.stayId })
      .from(feasibilityRuns)
      .where(and(eq(feasibilityRuns.tenantId, tenantId), eq(feasibilityRuns.id, p.runId)))
      .limit(1);

    const correlationId = randomUUID();
    const [rec] = await tx
      .insert(recommendations)
      .values({
        tenantId,
        guestId: p.guestId,
        stayId: run?.stayId ?? null,
        title: p.title,
        description: p.description,
        rationale: p.rationale,
        effort: p.hostEffort ?? "low",
        status: "accepted",
        generatedBy: "rules",
        correlationId,
      })
      .returning();

    await tx
      .update(feasibilityProposals)
      .set({ status: "accepted", recommendationId: rec.id, updatedAt: new Date() })
      .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, proposalId)));

    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "recommendation.created",
      entityType: "recommendation",
      entityId: rec.id,
      correlationId,
      payload: { guestId: p.guestId, generatedBy: "rules", source: "feasibility" },
    });
    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "feasibility.proposal_accepted",
      entityType: "feasibility_proposal",
      entityId: proposalId,
      payload: { recommendationId: rec.id },
    });
    return rec;
  });
}

async function setProposalStatus(
  tenantId: string,
  userId: string,
  proposalId: string,
  status: "rejected" | "not_useful",
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [p] = await tx
      .update(feasibilityProposals)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, proposalId)))
      .returning();
    if (!p) throw new Error("Proposal not found for this tenant.");
    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: status === "rejected" ? "feasibility.proposal_rejected" : "feasibility.proposal_not_useful",
      entityType: "feasibility_proposal",
      entityId: proposalId,
      payload: { status },
    });
    return p;
  });
}

export const rejectProposal = (t: string, u: string, id: string) => setProposalStatus(t, u, id, "rejected");
export const markProposalNotUseful = (t: string, u: string, id: string) => setProposalStatus(t, u, id, "not_useful");

/** Convert an accepted proposal into a Run 1 host action (reuses createHostAction). */
export async function convertProposalToHostAction(tenantId: string, userId: string, proposalId: string) {
  const p = await loadProposal(tenantId, proposalId);
  if (!p) throw new Error("Proposal not found for this tenant.");
  if (!p.recommendationId) throw new Error("Accept the proposal before converting it to a host action.");

  await createHostAction(tenantId, userId, p.recommendationId, {
    title: p.title,
    description: p.description,
  });

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(feasibilityProposals)
      .set({ status: "converted_to_host_action", updatedAt: new Date() })
      .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, proposalId)));
    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "feasibility.proposal_converted",
      entityType: "feasibility_proposal",
      entityId: proposalId,
      payload: { recommendationId: p.recommendationId },
    });
  });
}
