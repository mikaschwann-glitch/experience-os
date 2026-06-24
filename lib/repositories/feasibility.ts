import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  feasibilityProposals,
  feasibilityRuns,
  guests,
  hostActions,
  prearrivalBriefs,
  properties,
  recommendations,
  signals,
  stays,
} from "@/db/schema";
import { emitEvent } from "@/lib/events/events";
import { createHostAction } from "@/lib/repositories/slice";
import {
  createOrGetPreparation,
  fingerprintFallback,
} from "@/lib/repositories/preparations";

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

  // First-party runs carry the original host note / guest request — surface it so
  // the recommendation stays explainable on the result screen.
  let sourceSignal: { id: string; body: string } | null = null;
  if (run.sourceSignalId) {
    const [s] = await db
      .select({ id: signals.id, body: signals.body })
      .from(signals)
      .where(and(eq(signals.tenantId, tenantId), eq(signals.id, run.sourceSignalId)))
      .limit(1);
    sourceSignal = s ?? null;
  }

  // A run is "resolved" once a proposal has been converted into a Preparation. The page
  // then links to that Preparation instead of re-offering the (now set-aside) siblings.
  const converted = proposals.find((p) => p.status === "converted_to_host_action") ?? null;
  let createdPreparationId: string | null = null;
  if (converted?.recommendationId) {
    const [ha] = await db
      .select({ id: hostActions.id })
      .from(hostActions)
      .where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.recommendationId, converted.recommendationId)))
      .limit(1);
    createdPreparationId = ha?.id ?? null;
  }

  return {
    run,
    guest: guest ?? null,
    property: property ?? null,
    sourceSignal,
    // Actionable = still-open suggestions only. Converted + superseded never appear here.
    actionable: proposals.filter((p) => p.status === "proposed" || p.status === "requires_confirmation"),
    withheld: proposals.filter((p) => p.status === "withheld"),
    superseded: proposals.filter((p) => p.status === "superseded"),
    converted,
    createdPreparationId,
  };
}

/**
 * The brief's authoritative property (via its stay), or null if the brief has no
 * assigned property. Feasibility must evaluate against THIS property.
 */
export async function getBriefAuthoritativeProperty(tenantId: string, briefId: string) {
  const db = getDb();
  const [brief] = await db
    .select({ stayId: prearrivalBriefs.stayId })
    .from(prearrivalBriefs)
    .where(and(eq(prearrivalBriefs.tenantId, tenantId), eq(prearrivalBriefs.id, briefId)))
    .limit(1);
  if (!brief?.stayId) return null;
  const [stay] = await db
    .select({ propertyId: stays.propertyId })
    .from(stays)
    .where(and(eq(stays.tenantId, tenantId), eq(stays.id, brief.stayId)))
    .limit(1);
  if (!stay?.propertyId) return null;
  const [p] = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(and(eq(properties.tenantId, tenantId), eq(properties.id, stay.propertyId)))
    .limit(1);
  return p ?? null;
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
      .select({
        stayId: feasibilityRuns.stayId,
        triggerSource: feasibilityRuns.triggerSource,
        externallyResearched: feasibilityRuns.externallyResearched,
      })
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
        // Provenance copied explicitly from the run (never inferred from brief_id).
        triggerSource: run?.triggerSource ?? null,
        externallyResearched: run?.externallyResearched ?? false,
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

/**
 * NORMAL first selection. Run-level serialised inside the creation boundary: exactly
 * one initial Preparation per feasibility run. A stale/second normal confirm (a
 * superseded or otherwise non-actionable proposal, an already-resolved run) returns the
 * EXISTING Preparation with created=false — it never creates a second one. Idempotent
 * per (tenant, user, proposal). Returns { recommendationId, preparationId, created }.
 */
export async function confirmProposal(tenantId: string, userId: string, proposalId: string) {
  return createOrGetPreparation(tenantId, userId, {
    idempotencyKey: `proposal:${proposalId}`,
    requestFingerprint: `proposal:${proposalId}`,
    source: { kind: "feasibility_proposal", proposalId, mode: "normal" },
  });
}

/**
 * EXPLICIT secondary action: "create another preparation from a set-aside alternative".
 * Distinct intent (key `alt:`) so it never collides with the normal confirm of the same
 * proposal. Permits a superseded proposal and creates a DISTINCT additional Preparation
 * through the same stay-bound idempotent boundary; idempotent on retry.
 */
export async function createAnotherFromAlternative(
  tenantId: string,
  userId: string,
  proposalId: string,
) {
  return createOrGetPreparation(tenantId, userId, {
    idempotencyKey: `alt:${proposalId}`,
    requestFingerprint: `alt:${proposalId}`,
    source: { kind: "feasibility_proposal", proposalId, mode: "alternative" },
  });
}

/**
 * Stay-scoped host-authored fallback (the host acts when the system withholds).
 * Routes through the single transactional creation boundary so it is idempotent
 * (per the client idempotency key) and returns the preparationId. The canonical
 * signal -> insight -> recommendation -> host_action chain runs on ONE tx inside
 * createOrGetPreparation; HOST-AUTHORED, never externally researched. No LLM.
 */
export async function createStayScopedFallback(
  tenantId: string,
  userId: string,
  runId: string,
  input: { title: string; description?: string | null; idempotencyKey?: string },
) {
  const title = input.title.trim();
  if (!title) throw new Error("A preparation is required.");
  return createOrGetPreparation(tenantId, userId, {
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
    requestFingerprint: fingerprintFallback(runId, title, input.description ?? null),
    source: { kind: "fallback", runId, title, description: input.description ?? null },
  });
}
