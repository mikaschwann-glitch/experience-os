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
import {
  createHostAction,
  createInsightFromSignal,
  createRecommendationFromInsight,
  createSignal,
} from "@/lib/repositories/slice";

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

  return {
    run,
    guest: guest ?? null,
    property: property ?? null,
    sourceSignal,
    actionable: proposals.filter((p) => p.status !== "withheld"),
    withheld: proposals.filter((p) => p.status === "withheld"),
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
 * Reactive one-step confirm: accept + convert a proposal into EXACTLY ONE canonical
 * recommendation and EXACTLY ONE host action, atomically and idempotently. Repeated
 * submission is a no-op (guarded by the proposal status + a host-action existence
 * check). Composes the existing canonical models — no second task model. Provenance
 * is copied from the run onto the recommendation.
 */
export async function confirmProposal(tenantId: string, userId: string, proposalId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    // Row-level lock (SELECT ... FOR UPDATE) is the FIRST read and gates the whole
    // critical section. Concurrent confirms for the same proposal serialize here:
    // the loser blocks until the winner commits, then re-reads the now-terminal
    // state below and returns the idempotent no-op. Everything that follows runs on
    // this same `tx`, so exactly one recommendation + one host action result.
    const [p] = await tx
      .select()
      .from(feasibilityProposals)
      .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, proposalId)))
      .for("update")
      .limit(1);
    if (!p) throw new Error("Proposal not found for this tenant.");
    if (p.status === "withheld" || p.status === "rejected" || p.status === "not_useful") {
      throw new Error("This proposal cannot be confirmed.");
    }
    // Idempotent: already confirmed → return the existing recommendation, create nothing.
    if (p.status === "converted_to_host_action") {
      return { recommendationId: p.recommendationId, created: false };
    }

    // Ensure exactly one recommendation (copy provenance explicitly from the run).
    let recommendationId = p.recommendationId;
    if (!recommendationId) {
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
          triggerSource: run?.triggerSource ?? null,
          externallyResearched: run?.externallyResearched ?? false,
          correlationId,
        })
        .returning();
      recommendationId = rec.id;
      await tx
        .update(feasibilityProposals)
        .set({ recommendationId, updatedAt: new Date() })
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
    }

    // Ensure exactly one host action for that recommendation (no duplicate path).
    const [existingHa] = await tx
      .select({ id: hostActions.id })
      .from(hostActions)
      .where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.recommendationId, recommendationId)))
      .limit(1);
    if (!existingHa) {
      const [rec] = await tx
        .select({ guestId: recommendations.guestId, correlationId: recommendations.correlationId })
        .from(recommendations)
        .where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.id, recommendationId)))
        .limit(1);
      const [action] = await tx
        .insert(hostActions)
        .values({
          tenantId,
          recommendationId,
          guestId: rec.guestId,
          title: p.title,
          description: p.description,
          status: "planned",
          correlationId: rec.correlationId,
        })
        .returning();
      await emitEvent(tx, {
        tenantId,
        actorUserId: userId,
        type: "host_action.created",
        entityType: "host_action",
        entityId: action.id,
        correlationId: rec.correlationId,
        payload: { guestId: action.guestId, recommendationId, status: "planned" },
      });
    }

    // Mark converted — idempotency gate for repeated submission.
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
      payload: { recommendationId },
    });

    return { recommendationId, created: true };
  });
}

/**
 * Stay-scoped free-form fallback (the host acts when the system withholds). Reuses
 * the canonical signal → insight → recommendation → host_action chain so it stays
 * learning-eligible via recommendation.stayId. Clearly HOST-AUTHORED
 * (generated_by='manual'); never a system recommendation; never externally
 * researched. No LLM, no classification.
 */
export async function createStayScopedFallback(
  tenantId: string,
  userId: string,
  runId: string,
  input: { title: string; description?: string | null },
) {
  const title = input.title.trim();
  if (!title) throw new Error("A preparation is required.");

  const db = getDb();
  const [run] = await db
    .select({
      stayId: feasibilityRuns.stayId,
      guestId: feasibilityRuns.guestId,
      sourceSignalId: feasibilityRuns.sourceSignalId,
      triggerSource: feasibilityRuns.triggerSource,
    })
    .from(feasibilityRuns)
    .where(and(eq(feasibilityRuns.tenantId, tenantId), eq(feasibilityRuns.id, runId)))
    .limit(1);
  if (!run) throw new Error("Feasibility run not found for this tenant.");
  if (!run.stayId) throw new Error("This run has no stay; a stay-scoped preparation cannot be created.");

  // Reuse the original first-party signal where present; otherwise record one so the
  // signal → insight → recommendation trace is preserved.
  let signalId = run.sourceSignalId;
  if (!signalId) {
    const sig = await createSignal(tenantId, userId, { guestId: run.guestId, stayId: run.stayId, body: title });
    signalId = sig.id;
  }
  const insight = await createInsightFromSignal(tenantId, userId, signalId, {
    summary: `Host-authored preparation: ${title}`,
  });
  const rec = await createRecommendationFromInsight(tenantId, userId, insight.id, {
    title,
    description: input.description ?? null,
    stayId: run.stayId,
    status: "accepted",
    triggerSource: run.triggerSource,
  });
  const action = await createHostAction(tenantId, userId, rec.id, {
    title,
    description: input.description ?? null,
  });
  return { recommendationId: rec.id, hostActionId: action.id };
}
