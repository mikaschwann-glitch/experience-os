import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  hostActions,
  insights,
  outcomes,
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
 */

export async function createSignal(
  tenantId: string,
  userId: string,
  input: { guestId: string; stayId?: string | null; body: string },
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const correlationId = randomUUID();
    const [signal] = await tx
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

    await emitEvent(tx, {
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
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [signal] = await tx
      .select()
      .from(signals)
      .where(and(eq(signals.tenantId, tenantId), eq(signals.id, signalId)))
      .limit(1);
    if (!signal) throw new Error("Signal not found for tenant.");

    const [insight] = await tx
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

    await emitEvent(tx, {
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
    // Defaults preserve the generic manual path (stayId null, status pending,
    // trigger_source null, externally_researched false).
    stayId?: string | null;
    status?: "pending" | "accepted";
    triggerSource?: "guest_stated" | "host_noted" | "system_profile_match" | null;
  },
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [insight] = await tx
      .select()
      .from(insights)
      .where(and(eq(insights.tenantId, tenantId), eq(insights.id, insightId)))
      .limit(1);
    if (!insight) throw new Error("Insight not found for tenant.");

    const [recommendation] = await tx
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
    await tx.insert(recommendationInsights).values({
      tenantId,
      recommendationId: recommendation.id,
      insightId: insight.id,
    });

    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "recommendation.created",
      entityType: "recommendation",
      entityId: recommendation.id,
      correlationId: insight.correlationId,
      payload: { guestId: recommendation.guestId, insightId: insight.id, status: "pending" },
    });

    return recommendation;
  });
}

export async function setRecommendationStatus(
  tenantId: string,
  userId: string,
  recommendationId: string,
  status: "accepted" | "dismissed",
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [updated] = await tx
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

    await emitEvent(tx, {
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
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [recommendation] = await tx
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

    const [action] = await tx
      .insert(hostActions)
      .values({
        tenantId,
        recommendationId: recommendation.id,
        guestId: recommendation.guestId,
        title: input.title,
        description: input.description ?? null,
        status: "planned",
        correlationId: recommendation.correlationId,
      })
      .returning();

    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "host_action.created",
      entityType: "host_action",
      entityId: action.id,
      correlationId: recommendation.correlationId,
      payload: { guestId: action.guestId, recommendationId: recommendation.id, status: "planned" },
    });

    return action;
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

    const [outcome] = await tx
      .insert(outcomes)
      .values({
        tenantId,
        hostActionId: action.id,
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
