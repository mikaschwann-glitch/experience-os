import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  guests,
  hostActions,
  insights,
  outcomes,
  recommendations,
  signals,
  stays,
  units,
  events,
} from "@/db/schema";

/**
 * Tenant-aware read repository for guests. Every query is scoped by tenantId.
 * Read models are assembled here so that pages/components never touch Drizzle.
 */

export async function listGuestsWithSummary(tenantId: string) {
  const db = getDb();

  const guestRows = await db
    .select()
    .from(guests)
    .where(and(eq(guests.tenantId, tenantId), isNull(guests.deletedAt)))
    .orderBy(desc(guests.createdAt));

  const [stayRows, insightRows, recRows] = await Promise.all([
    db
      .select({
        id: stays.id,
        guestId: stays.guestId,
        unitName: units.name,
        startDate: stays.startDate,
        endDate: stays.endDate,
        status: stays.status,
        visitNumber: stays.visitNumber,
      })
      .from(stays)
      .leftJoin(units, eq(units.id, stays.unitId))
      .where(eq(stays.tenantId, tenantId)),
    db
      .select({ id: insights.id, guestId: insights.guestId })
      .from(insights)
      .where(eq(insights.tenantId, tenantId)),
    db
      .select({
        id: recommendations.id,
        guestId: recommendations.guestId,
        status: recommendations.status,
      })
      .from(recommendations)
      .where(eq(recommendations.tenantId, tenantId)),
  ]);

  return guestRows.map((g) => {
    const guestStays = stayRows.filter((s) => s.guestId === g.id);
    const currentStay =
      guestStays.find((s) => s.status === "in_residence") ??
      guestStays.find((s) => s.status === "upcoming") ??
      guestStays[0] ??
      null;
    return {
      ...g,
      currentStay,
      insightCount: insightRows.filter((i) => i.guestId === g.id).length,
      openRecommendationCount: recRows.filter(
        (r) => r.guestId === g.id && r.status === "pending",
      ).length,
    };
  });
}

export async function getGuestMemory(tenantId: string, guestId: string) {
  const db = getDb();

  const [guest] = await db
    .select()
    .from(guests)
    .where(and(eq(guests.tenantId, tenantId), eq(guests.id, guestId)))
    .limit(1);

  if (!guest) return null;

  const guestScope = and(
    eq(signals.tenantId, tenantId),
    eq(signals.guestId, guestId),
  );

  const [
    stayRows,
    signalRows,
    insightRows,
    recommendationRows,
    hostActionRows,
    outcomeRows,
    eventRows,
  ] = await Promise.all([
    db
      .select({
        id: stays.id,
        unitName: units.name,
        startDate: stays.startDate,
        endDate: stays.endDate,
        status: stays.status,
        visitNumber: stays.visitNumber,
        valueAmountCents: stays.valueAmountCents,
        currency: stays.currency,
      })
      .from(stays)
      .leftJoin(units, eq(units.id, stays.unitId))
      .where(and(eq(stays.tenantId, tenantId), eq(stays.guestId, guestId)))
      .orderBy(desc(stays.startDate)),
    db.select().from(signals).where(guestScope).orderBy(desc(signals.occurredAt)),
    db
      .select()
      .from(insights)
      .where(and(eq(insights.tenantId, tenantId), eq(insights.guestId, guestId)))
      .orderBy(desc(insights.createdAt)),
    db
      .select()
      .from(recommendations)
      .where(
        and(
          eq(recommendations.tenantId, tenantId),
          eq(recommendations.guestId, guestId),
        ),
      )
      .orderBy(desc(recommendations.createdAt)),
    db
      .select()
      .from(hostActions)
      .where(
        and(eq(hostActions.tenantId, tenantId), eq(hostActions.guestId, guestId)),
      )
      .orderBy(desc(hostActions.createdAt)),
    db
      .select()
      .from(outcomes)
      .where(and(eq(outcomes.tenantId, tenantId), eq(outcomes.guestId, guestId)))
      .orderBy(desc(outcomes.occurredAt)),
    db
      .select()
      .from(events)
      .where(eq(events.tenantId, tenantId))
      .orderBy(desc(events.occurredAt)),
  ]);

  // Build the set of identifiers and correlation ids that belong to this guest,
  // then filter the tenant's events down to this guest's timeline. (Events carry
  // no guest_id by design; PII-light payloads + correlation_id link the chain.)
  const correlationIds = new Set(signalRows.map((s) => s.correlationId));
  const entityIds = new Set<string>([
    guest.id,
    ...stayRows.map((s) => s.id),
    ...signalRows.map((s) => s.id),
    ...insightRows.map((i) => i.id),
    ...recommendationRows.map((r) => r.id),
    ...hostActionRows.map((h) => h.id),
    ...outcomeRows.map((o) => o.id),
  ]);

  const guestEvents = eventRows.filter(
    (e) =>
      (e.correlationId && correlationIds.has(e.correlationId)) ||
      entityIds.has(e.entityId),
  );

  return {
    guest,
    stays: stayRows,
    signals: signalRows,
    insights: insightRows,
    recommendations: recommendationRows,
    hostActions: hostActionRows,
    outcomes: outcomeRows,
    events: guestEvents,
  };
}
