import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, type Executor } from "@/db/client";
import {
  hostActions,
  insights,
  outcomes,
  preparationExecutions,
  recommendationInsights,
  recommendations,
  signals,
} from "@/db/schema";
import { emitEvent } from "@/lib/events/events";

/**
 * Tenant-aware write repository for the manual vertical slice:
 *   Signal -> Insight -> Recommendation -> HostAction -> Outcome -> Event log
 *
 * Every function requires tenantId (first arg) and scopes all reads/writes by it.
 * Every mutation runs inside a transaction together with emitEvent(), so the
 * domain write and its event commit or roll back atomically. The chain is tied
 * together by a single correlationId minted when the signal is created.
 *
 * Wave 1A — each write accepts an optional Executor (tx) so several writes can be
 * composed onto ONE transaction by the createOrGetPreparation boundary. With no
 * executor the write opens its own transaction (unchanged standalone behaviour).
 */

/** Run `fn` on the given executor, or open a fresh transaction when none is given. */
async function run<T>(tx: Executor | undefined, fn: (db: Executor) => Promise<T>): Promise<T> {
  if (tx) return fn(tx);
  return getDb().transaction((t) => fn(t));
}

export async function createSignal(
  tenantId: string,
  userId: string,
  input: { guestId: string; stayId?: string | null; body: string },
  tx?: Executor,
) {
  return run(tx, async (db) => {
    const correlationId = randomUUID();
    const [signal] = await db
      .insert(signals)
      .values({
        tenantId,
        guestId: input.guestId,
        stayId: input.stayId ?? null,
        authorUserId: userId,
        type: "note",
        body: input.body,
        correlationId,
      })
      .returning();

    await emitEvent(db, {
      tenantId,
      actorUserId: userId,
      type: "signal.created",
      entityType: "signal",
      entityId: signal.id,
      correlationId,
      payload: { guestId: signal.guestId, type: signal.type },
    });

    return signal;
  });
}

export async function createInsightFromSignal(
  tenantId: string,
  userId: string,
  signalId: string,
  input: { summary: string; detail?: string | null },
  tx?: Executor,
) {
  return run(tx, async (db) => {
    const [signal] = await db
      .select()
      .from(signals)
      .where(and(eq(signals.tenantId, tenantId), eq(signals.id, signalId)))
      .limit(1);
    if (!signal) throw new Error("Signal not found for tenant.");

    const [insight] = await db
      .insert(insights)
      .values({
        tenantId,
        guestId: signal.guestId,
        signalId: signal.id,
        summary: input.summary,
        detail: input.detail ?? null,
        generatedBy: "manual",
        correlationId: signal.correlationId,
      })
      .returning();

    await emitEvent(db, {
      tenantId,
      actorUserId: userId,
      type: "insight.created",
      entityType: "insight",
      entityId: insight.id,
      correlationId: signal.correlationId,
      payload: { guestId: insight.guestId, signalId: signal.id, generatedBy: "manual" },
    });

    return insight;
  });
}

export async function createRecommendationFromInsight(
  tenantId: string,
  userId: string,
  insightId: string,
  input: {
    title: string;
    description?: string | null;
    rationale?: string | null;
    effort?: string | null;
    // Optional stay scope + provenance (used by the reactive first-party fallback).
    // A stay-less recommendation can never become operational work (createHostAction
    // refuses it) — it remains a non-operational suggestion only.
    stayId?: string | null;
    status?: "pending" | "accepted";
    triggerSource?: "guest_stated" | "host_noted" | "system_profile_match" | null;
  },
  tx?: Executor,
) {
  return run(tx, async (db) => {
    const [insight] = await db
      .select()
      .from(insights)
      .where(and(eq(insights.tenantId, tenantId), eq(insights.id, insightId)))
      .limit(1);
    if (!insight) throw new Error("Insight not found for tenant.");

    const [recommendation] = await db
      .insert(recommendations)
      .values({
        tenantId,
        guestId: insight.guestId,
        stayId: input.stayId ?? null,
        title: input.title,
        description: input.description ?? null,
        rationale: input.rationale ?? null,
        effort: input.effort ?? "low",
        status: input.status ?? "pending",
        generatedBy: "manual",
        // First-party host-authored fallback is never externally researched.
        triggerSource: input.triggerSource ?? null,
        externallyResearched: false,
        correlationId: insight.correlationId,
      })
      .returning();

    // Same-tenant consistency: both rows are already tenant-scoped above, so the
    // join row can only ever link a recommendation and insight of this tenant.
    await db.insert(recommendationInsights).values({
      tenantId,
      recommendationId: recommendation.id,
      insightId: insight.id,
    });

    await emitEvent(db, {
      tenantId,
      actorUserId: userId,
      type: "recommendation.created",
      entityType: "recommendation",
      entityId: recommendation.id,
      correlationId: insight.correlationId,
      payload: { guestId: recommendation.guestId, insightId: insight.id, status: recommendation.status },
    });

    return recommendation;
  });
}

export async function setRecommendationStatus(
  tenantId: string,
  userId: string,
  recommendationId: string,
  status: "accepted" | "dismissed",
  tx?: Executor,
) {
  return run(tx, async (db) => {
    const [updated] = await db
      .update(recommendations)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(recommendations.tenantId, tenantId),
          eq(recommendations.id, recommendationId),
        ),
      )
      .returning();
    if (!updated) throw new Error("Recommendation not found for tenant.");

    await emitEvent(db, {
      tenantId,
      actorUserId: userId,
      type: status === "accepted" ? "recommendation.accepted" : "recommendation.dismissed",
      entityType: "recommendation",
      entityId: updated.id,
      correlationId: updated.correlationId,
      payload: { guestId: updated.guestId, status },
    });

    return updated;
  });
}

export async function createHostAction(
  tenantId: string,
  userId: string,
  recommendationId: string,
  input: { title: string; description?: string | null },
  tx?: Executor,
) {
  return run(tx, async (db) => {
    const [recommendation] = await db
      .select()
      .from(recommendations)
      .where(
        and(
          eq(recommendations.tenantId, tenantId),
          eq(recommendations.id, recommendationId),
        ),
      )
      .limit(1);
    if (!recommendation) throw new Error("Recommendation not found for tenant.");
    // Wave 1A invariant (server backstop): an operational Preparation MUST be
    // stay-bound. The stay is copied from its provenance recommendation, which is
    // authoritative. A stay-less recommendation can never become operational work —
    // this isolates the legacy stay-less manual path regardless of which UI calls it.
    if (!recommendation.stayId) {
      throw new Error(
        "Cannot create a stay-less operational preparation: the recommendation has no stay.",
      );
    }

    const [action] = await db
      .insert(hostActions)
      .values({
        tenantId,
        recommendationId: recommendation.id,
        guestId: recommendation.guestId,
        // Direct, authoritative operational stay relation (Wave 1A).
        stayId: recommendation.stayId,
        title: input.title,
        description: input.description ?? null,
        status: "planned",
        correlationId: recommendation.correlationId,
      })
      .returning();

    await emitEvent(db, {
      tenantId,
      actorUserId: userId,
      type: "host_action.created",
      entityType: "host_action",
      entityId: action.id,
      correlationId: recommendation.correlationId,
      payload: {
        guestId: action.guestId,
        recommendationId: recommendation.id,
        stayId: action.stayId,
        status: "planned",
      },
    });

    return action;
  });
}

/**
 * Wave 2 — "Mark as ready": the host physically prepared the item.
 * Transition planned -> prepared and write ONE immutable execution snapshot of what
 * was prepared (frozen rule: a later edit can never rewrite what an outcome refers to).
 * Idempotent: already-prepared / already-done returns without a second snapshot.
 * A cancelled Preparation cannot be marked ready. 'prepared' is HONESTLY distinct from
 * an outcome — it never asserts how the stay went.
 */
export async function markPrepared(
  tenantId: string,
  userId: string,
  preparationId: string,
  tx?: Executor,
): Promise<{ preparationId: string; executionId: string | null; created: boolean }> {
  return run(tx, async (db) => {
    // Lock the row so concurrent "Mark as ready" clicks can't both write a snapshot.
    const [action] = await db
      .select()
      .from(hostActions)
      .where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.id, preparationId)))
      .for("update")
      .limit(1);
    if (!action) throw new Error("Preparation not found for tenant.");
    if (action.status === "prepared" || action.status === "done") {
      return { preparationId, executionId: null, created: false };
    }
    if (action.status === "cancelled") {
      throw new Error("A cancelled preparation cannot be marked ready.");
    }

    // Best-effort rationale from the provenance recommendation (for the snapshot only).
    let rationale: string | null = null;
    if (action.recommendationId) {
      const [rec] = await db
        .select({ rationale: recommendations.rationale })
        .from(recommendations)
        .where(
          and(
            eq(recommendations.tenantId, tenantId),
            eq(recommendations.id, action.recommendationId),
          ),
        )
        .limit(1);
      rationale = rec?.rationale ?? null;
    }

    await db
      .update(hostActions)
      .set({ status: "prepared", updatedAt: new Date() })
      .where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.id, preparationId)));

    const [execution] = await db
      .insert(preparationExecutions)
      .values({
        tenantId,
        hostActionId: action.id,
        version: 1,
        preparedByUserId: userId,
        snapshot: {
          title: action.title,
          description: action.description,
          rationale,
          stayId: action.stayId,
          guestId: action.guestId,
          recommendationId: action.recommendationId,
        },
      })
      .returning();

    await emitEvent(db, {
      tenantId,
      actorUserId: userId,
      type: "preparation.marked_ready",
      entityType: "host_action",
      entityId: action.id,
      correlationId: action.correlationId,
      payload: { executionId: execution.id, stayId: action.stayId, version: 1 },
    });

    return { preparationId, executionId: execution.id, created: true };
  });
}

export async function logOutcome(
  tenantId: string,
  userId: string,
  hostActionId: string,
  input: {
    result: "positive" | "neutral" | "negative" | "unknown";
    notes?: string | null;
  },
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [action] = await tx
      .select()
      .from(hostActions)
      .where(
        and(eq(hostActions.tenantId, tenantId), eq(hostActions.id, hostActionId)),
      )
      .limit(1);
    if (!action) throw new Error("Host action not found for tenant.");

    // Frozen rule: bind the outcome to the exact prepared snapshot, when one exists.
    const [execution] = await tx
      .select({ id: preparationExecutions.id })
      .from(preparationExecutions)
      .where(
        and(
          eq(preparationExecutions.tenantId, tenantId),
          eq(preparationExecutions.hostActionId, action.id),
        ),
      )
      .orderBy(desc(preparationExecutions.version))
      .limit(1);

    const [outcome] = await tx
      .insert(outcomes)
      .values({
        tenantId,
        hostActionId: action.id,
        executionId: execution?.id ?? null,
        guestId: action.guestId,
        result: input.result,
        notes: input.notes ?? null,
      })
      .returning();

    // Mark the action done in the same transaction and record that change.
    await tx
      .update(hostActions)
      .set({ status: "done", updatedAt: new Date() })
      .where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.id, action.id)));

    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "host_action.updated",
      entityType: "host_action",
      entityId: action.id,
      correlationId: action.correlationId,
      payload: { status: "done" },
    });

    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "outcome.created",
      entityType: "outcome",
      entityId: outcome.id,
      correlationId: action.correlationId,
      payload: { guestId: outcome.guestId, hostActionId: action.id, result: outcome.result },
    });

    return outcome;
  });
}
