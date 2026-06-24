import { randomUUID, createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, type Executor } from "@/db/client";
import {
  feasibilityProposals,
  feasibilityRuns,
  hostActions,
  preparationIntents,
  recommendations,
} from "@/db/schema";
import { emitEvent } from "@/lib/events/events";
import {
  createHostAction,
  createInsightFromSignal,
  createRecommendationFromInsight,
  createSignal,
} from "@/lib/repositories/slice";

/**
 * Wave 1A — the SINGLE transactional creation boundary for a Preparation.
 *
 * Frozen contract:
 *  - One row per logical submission attempt, keyed (tenant, initiator, idempotency_key).
 *  - TRANSACTION BOUNDARY = Option A (fully atomic). The intent row (inserted as
 *    'processing'), the recommendation, the host_action, the audit events, and the
 *    'succeeded' result ALL commit in ONE database transaction. A crash before commit
 *    rolls back EVERYTHING — including the intent row — so there is NO durable
 *    'processing' state and therefore NO stale-recovery path. A retry either finds no
 *    intent (and starts cleanly, creating exactly one Preparation) or a committed
 *    'succeeded' intent (and returns its ids). A committed intent is ALWAYS terminal.
 *  - Same key + DIFFERENT request fingerprint => idempotency conflict (never a silent
 *    wrong result).
 *  - Every Preparation is stay-bound (createHostAction enforces it) and returns its
 *    own preparationId (the host_action id) so the caller can navigate to it.
 *  - The host_actions.recommendation_id partial-unique index is the final DB backstop
 *    against a duplicate Preparation for one recommendation.
 */

export class IdempotencyConflictError extends Error {
  constructor(message = "This idempotency key was already used with a different request.") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export interface PreparationResult {
  recommendationId: string;
  /** The host_action id — the operational Preparation the host is sent to. */
  preparationId: string;
  created: boolean;
}

export type PreparationSource =
  | { kind: "feasibility_proposal"; proposalId: string }
  | { kind: "fallback"; runId: string; title: string; description?: string | null };

/** Deterministic fingerprint of a host-authored fallback submission. */
export function fingerprintFallback(runId: string, title: string, description?: string | null): string {
  return createHash("sha256")
    .update(`fallback|${runId}|${title.trim()}|${(description ?? "").trim()}`)
    .digest("hex");
}

export async function createOrGetPreparation(
  tenantId: string,
  userId: string,
  input: { idempotencyKey: string; requestFingerprint: string; source: PreparationSource },
): Promise<PreparationResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    // ---- 1) Intent: insert-or-lock. Same key serialises here. ----
    const [inserted] = await tx
      .insert(preparationIntents)
      .values({
        tenantId,
        initiatorUserId: userId,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        status: "processing",
      })
      .onConflictDoNothing({
        target: [
          preparationIntents.tenantId,
          preparationIntents.initiatorUserId,
          preparationIntents.idempotencyKey,
        ],
      })
      .returning();

    let intentId: string;
    if (inserted) {
      intentId = inserted.id;
    } else {
      // Conflict: another transaction already inserted this key. The INSERT above
      // blocked until that transaction committed or rolled back; if it rolled back, our
      // insert would have WON (no conflict). So a row we see here is COMMITTED, and —
      // by the single-transaction invariant — always terminal ('succeeded' with ids).
      const [existing] = await tx
        .select()
        .from(preparationIntents)
        .where(
          and(
            eq(preparationIntents.tenantId, tenantId),
            eq(preparationIntents.initiatorUserId, userId),
            eq(preparationIntents.idempotencyKey, input.idempotencyKey),
          ),
        )
        .for("update")
        .limit(1);
      if (!existing) throw new Error("Preparation intent vanished during conflict resolution.");
      if (existing.requestFingerprint !== input.requestFingerprint) {
        throw new IdempotencyConflictError();
      }
      if (existing.status === "succeeded" && existing.preparationId && existing.recommendationId) {
        return {
          recommendationId: existing.recommendationId,
          preparationId: existing.preparationId,
          created: false,
        };
      }
      // A committed intent that is NOT terminal must never happen under Option A. Fail
      // loudly rather than risk creating a duplicate by "resuming" — there is no safe
      // partial-state resume in a fully-atomic design.
      throw new Error(
        `Preparation intent ${existing.id} is committed in a non-terminal state (${existing.status}); refusing to resume.`,
      );
    }

    // ---- 2) Materialise the preparation (source-specific) on THIS tx ----
    const out = await materialise(tx, tenantId, userId, input.source);

    // ---- 3) Persist the result on the intent + audit, then commit ----
    await tx
      .update(preparationIntents)
      .set({
        status: "succeeded",
        recommendationId: out.recommendationId,
        preparationId: out.preparationId,
        stayId: out.stayId,
        updatedAt: new Date(),
      })
      .where(and(eq(preparationIntents.tenantId, tenantId), eq(preparationIntents.id, intentId)));

    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "preparation.created",
      entityType: "host_action",
      entityId: out.preparationId,
      payload: { recommendationId: out.recommendationId, stayId: out.stayId, source: input.source.kind },
    });

    return { recommendationId: out.recommendationId, preparationId: out.preparationId, created: true };
  });
}

async function materialise(
  tx: Executor,
  tenantId: string,
  userId: string,
  source: PreparationSource,
): Promise<{ recommendationId: string; preparationId: string; stayId: string }> {
  if (source.kind === "feasibility_proposal") {
    return materialiseFromProposal(tx, tenantId, userId, source.proposalId);
  }
  return materialiseFallback(tx, tenantId, userId, source);
}

/**
 * Feasibility-originated: accept + convert a proposal into EXACTLY ONE recommendation
 * and ONE host_action. Preserves the proposal row-lock; provenance is copied from the
 * run; the stay is the run's validated stay.
 */
async function materialiseFromProposal(
  tx: Executor,
  tenantId: string,
  userId: string,
  proposalId: string,
): Promise<{ recommendationId: string; preparationId: string; stayId: string }> {
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

  const [run] = await tx
    .select({
      stayId: feasibilityRuns.stayId,
      triggerSource: feasibilityRuns.triggerSource,
      externallyResearched: feasibilityRuns.externallyResearched,
    })
    .from(feasibilityRuns)
    .where(and(eq(feasibilityRuns.tenantId, tenantId), eq(feasibilityRuns.id, p.runId)))
    .limit(1);
  if (!run?.stayId) {
    throw new Error("Cannot confirm: the feasibility run has no stay to bind the preparation to.");
  }

  // Exactly one recommendation (copy provenance explicitly from the run).
  let recommendationId = p.recommendationId;
  if (!recommendationId) {
    const correlationId = randomUUID();
    const [rec] = await tx
      .insert(recommendations)
      .values({
        tenantId,
        guestId: p.guestId,
        stayId: run.stayId,
        title: p.title,
        description: p.description,
        rationale: p.rationale,
        effort: p.hostEffort ?? "low",
        status: "accepted",
        generatedBy: "rules",
        triggerSource: run.triggerSource ?? null,
        externallyResearched: run.externallyResearched ?? false,
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

  // Exactly one host_action for that recommendation (idempotent; DB-backed by the
  // partial-unique index on recommendation_id).
  const [existingHa] = await tx
    .select({ id: hostActions.id })
    .from(hostActions)
    .where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.recommendationId, recommendationId)))
    .limit(1);
  let preparationId: string;
  if (existingHa) {
    preparationId = existingHa.id;
  } else {
    const action = await createHostAction(
      tenantId,
      userId,
      recommendationId,
      { title: p.title, description: p.description },
      tx,
    );
    preparationId = action.id;
  }

  if (p.status !== "converted_to_host_action") {
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
  }

  return { recommendationId, preparationId, stayId: run.stayId };
}

/**
 * Host-authored fallback when the system withholds. Reuses the canonical
 * signal -> insight -> recommendation -> host_action chain (all on ONE tx) so it
 * stays stay-bound + learning-eligible. Clearly HOST-AUTHORED (generated_by='manual').
 */
async function materialiseFallback(
  tx: Executor,
  tenantId: string,
  userId: string,
  source: { runId: string; title: string; description?: string | null },
): Promise<{ recommendationId: string; preparationId: string; stayId: string }> {
  const title = source.title.trim();
  if (!title) throw new Error("A preparation is required.");

  const [run] = await tx
    .select({
      stayId: feasibilityRuns.stayId,
      guestId: feasibilityRuns.guestId,
      sourceSignalId: feasibilityRuns.sourceSignalId,
      triggerSource: feasibilityRuns.triggerSource,
    })
    .from(feasibilityRuns)
    .where(and(eq(feasibilityRuns.tenantId, tenantId), eq(feasibilityRuns.id, source.runId)))
    .limit(1);
  if (!run) throw new Error("Feasibility run not found for this tenant.");
  if (!run.stayId) throw new Error("This run has no stay; a stay-scoped preparation cannot be created.");

  let signalId = run.sourceSignalId;
  if (!signalId) {
    const sig = await createSignal(
      tenantId,
      userId,
      { guestId: run.guestId, stayId: run.stayId, body: title },
      tx,
    );
    signalId = sig.id;
  }
  const insight = await createInsightFromSignal(
    tenantId,
    userId,
    signalId,
    { summary: `Host-authored preparation: ${title}` },
    tx,
  );
  const rec = await createRecommendationFromInsight(
    tenantId,
    userId,
    insight.id,
    {
      title,
      description: source.description ?? null,
      stayId: run.stayId,
      status: "accepted",
      triggerSource: run.triggerSource,
    },
    tx,
  );
  const action = await createHostAction(
    tenantId,
    userId,
    rec.id,
    { title, description: source.description ?? null },
    tx,
  );
  return { recommendationId: rec.id, preparationId: action.id, stayId: run.stayId };
}
