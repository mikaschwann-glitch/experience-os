import { randomUUID, createHash } from "node:crypto";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
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

// Two explicit feasibility intents (never one broad path):
//  - "normal"      = the FIRST selection for a guest need. Run-level serialised: exactly
//                    one initial Preparation per run; a stale/second normal confirm
//                    returns the existing one (no duplicate).
//  - "alternative" = the DELIBERATE secondary "create another from a set-aside idea"
//                    action: permits a superseded proposal and creates a DISTINCT prep.
export type PreparationSource =
  | { kind: "feasibility_proposal"; proposalId: string; mode: "normal" | "alternative" }
  | { kind: "fallback"; runId: string; title: string; description?: string | null };

type MaterialiseResult = {
  recommendationId: string;
  preparationId: string;
  stayId: string;
  /** True only when a NEW Preparation was actually created (false on a resolved return). */
  created: boolean;
};

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

    // Emit "preparation.created" ONLY when a new Preparation was actually created — a
    // resolved return (e.g. a stale normal confirm of an already-resolved run) creates
    // nothing and must not fabricate a creation event.
    if (out.created) {
      await emitEvent(tx, {
        tenantId,
        actorUserId: userId,
        type: "preparation.created",
        entityType: "host_action",
        entityId: out.preparationId,
        payload: { recommendationId: out.recommendationId, stayId: out.stayId, source: input.source.kind },
      });
    }

    return { recommendationId: out.recommendationId, preparationId: out.preparationId, created: out.created };
  });
}

async function materialise(
  tx: Executor,
  tenantId: string,
  userId: string,
  source: PreparationSource,
): Promise<MaterialiseResult> {
  if (source.kind === "feasibility_proposal") {
    return materialiseFromProposal(tx, tenantId, userId, source.proposalId, source.mode);
  }
  return materialiseFallback(tx, tenantId, userId, source);
}

/**
 * Feasibility-originated creation.
 *
 * Concurrency model:
 *  - mode "normal": RUN-LEVEL SERIALISATION. We lock the feasibility_run row FOR UPDATE
 *    BEFORE locking the chosen proposal, so two concurrent normal confirms of DIFFERENT
 *    siblings order here. The first creates exactly one Preparation and supersedes the
 *    rest; the second sees the run already resolved and RETURNS THE EXISTING Preparation
 *    (created=false) — no duplicate initial work, even from a stale screen or old link.
 *    Locking the run before any proposal also avoids a deadlock with the sibling-supersede
 *    UPDATE (the blocked transaction holds no proposal lock).
 *  - mode "alternative": the deliberate "create another from a set-aside idea" action.
 *    Permits a 'superseded' proposal and creates a DISTINCT additional Preparation;
 *    idempotent if that alternative was already turned into a Preparation.
 */
async function materialiseFromProposal(
  tx: Executor,
  tenantId: string,
  userId: string,
  proposalId: string,
  mode: "normal" | "alternative",
): Promise<MaterialiseResult> {
  // Find the run without locking the proposal yet (lock ordering is run -> proposal).
  const [p0] = await tx
    .select({ runId: feasibilityProposals.runId })
    .from(feasibilityProposals)
    .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, proposalId)))
    .limit(1);
  if (!p0) throw new Error("Proposal not found for this tenant.");

  // Lock the run row. For a normal first selection this is THE serialisation point.
  const [run] = await tx
    .select({
      id: feasibilityRuns.id,
      stayId: feasibilityRuns.stayId,
      triggerSource: feasibilityRuns.triggerSource,
      externallyResearched: feasibilityRuns.externallyResearched,
    })
    .from(feasibilityRuns)
    .where(and(eq(feasibilityRuns.tenantId, tenantId), eq(feasibilityRuns.id, p0.runId)))
    .for("update")
    .limit(1);
  if (!run?.stayId) {
    throw new Error("Cannot confirm: the feasibility run has no stay to bind the preparation to.");
  }

  // Is this run already resolved (a proposal already converted into a Preparation)?
  const [already] = await tx
    .select({ recommendationId: feasibilityProposals.recommendationId })
    .from(feasibilityProposals)
    .where(
      and(
        eq(feasibilityProposals.tenantId, tenantId),
        eq(feasibilityProposals.runId, run.id),
        eq(feasibilityProposals.status, "converted_to_host_action"),
      ),
    )
    .orderBy(asc(feasibilityProposals.createdAt))
    .limit(1);

  async function existingFor(recommendationId: string): Promise<MaterialiseResult | null> {
    const [ha] = await tx
      .select({ id: hostActions.id })
      .from(hostActions)
      .where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.recommendationId, recommendationId)))
      .limit(1);
    return ha ? { recommendationId, preparationId: ha.id, stayId: run!.stayId as string, created: false } : null;
  }

  if (mode === "normal") {
    // Stale / second normal confirm of an already-resolved run → return the existing
    // initial Preparation. Never creates a second one.
    if (already?.recommendationId) {
      const existing = await existingFor(already.recommendationId);
      if (existing) return existing;
    }
    // First selection: lock the chosen proposal and require it still be ACTIONABLE.
    const [p] = await tx
      .select()
      .from(feasibilityProposals)
      .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, proposalId)))
      .for("update")
      .limit(1);
    if (!p) throw new Error("Proposal not found for this tenant.");
    if (p.status !== "proposed" && p.status !== "requires_confirmation") {
      // Not an actionable first-selection (superseded/converted/withheld/etc.). A normal
      // confirm must not create a second Preparation; surface the resolved one if any.
      if (already?.recommendationId) {
        const existing = await existingFor(already.recommendationId);
        if (existing) return existing;
      }
      throw new Error("This proposal can no longer be selected as a first preparation.");
    }
    return convertAndSupersede(tx, tenantId, userId, p, run);
  }

  // mode === "alternative": deliberate secondary creation from a set-aside idea.
  const [p] = await tx
    .select()
    .from(feasibilityProposals)
    .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, proposalId)))
    .for("update")
    .limit(1);
  if (!p) throw new Error("Proposal not found for this tenant.");
  if (p.status === "converted_to_host_action" && p.recommendationId) {
    const existing = await existingFor(p.recommendationId);
    if (existing) return existing; // idempotent: this alternative already became a prep
  }
  if (p.status !== "superseded" && p.status !== "converted_to_host_action") {
    throw new Error("Only a set-aside alternative can be turned into another preparation.");
  }
  return convertAndSupersede(tx, tenantId, userId, p, run);
}

/**
 * Convert one proposal into EXACTLY ONE recommendation + ONE host_action (idempotent,
 * DB-backed by the partial-unique index on recommendation_id), then set the proposal
 * 'converted' and supersede the run's remaining actionable siblings. Provenance is copied
 * from the run; the stay is the run's validated stay. Returns created=true.
 */
async function convertAndSupersede(
  tx: Executor,
  tenantId: string,
  userId: string,
  p: typeof feasibilityProposals.$inferSelect,
  run: { id: string; stayId: string | null; triggerSource: string | null; externallyResearched: boolean | null },
): Promise<MaterialiseResult> {
  const stayId = run.stayId as string;
  let recommendationId = p.recommendationId;
  if (!recommendationId) {
    const correlationId = randomUUID();
    const [rec] = await tx
      .insert(recommendations)
      .values({
        tenantId,
        guestId: p.guestId,
        stayId,
        title: p.title,
        description: p.description,
        rationale: p.rationale,
        effort: p.hostEffort ?? "low",
        status: "accepted",
        generatedBy: "rules",
        triggerSource: (run.triggerSource as "guest_stated" | "host_noted" | null) ?? null,
        externallyResearched: run.externallyResearched ?? false,
        correlationId,
      })
      .returning();
    recommendationId = rec.id;
    await tx
      .update(feasibilityProposals)
      .set({ recommendationId, updatedAt: new Date() })
      .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, p.id)));
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
      entityId: p.id,
      payload: { recommendationId: rec.id },
    });
  }

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
      .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, p.id)));
    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "feasibility.proposal_converted",
      entityType: "feasibility_proposal",
      entityId: p.id,
      payload: { recommendationId },
    });

    // The chosen proposal answers ONE guest need; the run's remaining actionable siblings
    // are alternatives, not separate tasks — set them aside (auditable, non-actionable).
    // Never deletes / rejects them, never touches another run.
    const setAside = await tx
      .update(feasibilityProposals)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(
        and(
          eq(feasibilityProposals.tenantId, tenantId),
          eq(feasibilityProposals.runId, p.runId),
          ne(feasibilityProposals.id, p.id),
          inArray(feasibilityProposals.status, ["proposed", "requires_confirmation"]),
        ),
      )
      .returning({ id: feasibilityProposals.id });
    if (setAside.length > 0) {
      await emitEvent(tx, {
        tenantId,
        actorUserId: userId,
        type: "feasibility.siblings_superseded",
        entityType: "feasibility_run",
        entityId: p.runId,
        payload: { chosenProposalId: p.id, supersededCount: setAside.length },
      });
    }
  }

  return { recommendationId, preparationId, stayId, created: true };
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
): Promise<MaterialiseResult> {
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
  return { recommendationId: rec.id, preparationId: action.id, stayId: run.stayId, created: true };
}
