import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  events,
  guests,
  recommendations,
  stays,
  units,
} from "@/db/schema";

/** Tenant-aware read model for the Today Dashboard. */

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodaySnapshot(tenantId: string) {
  const db = getDb();
  const today = todayIso();

  const [stayRows, pendingRecs, recentEvents] = await Promise.all([
    db
      .select({
        id: stays.id,
        guestId: stays.guestId,
        guestName: guests.fullName,
        unitName: units.name,
        startDate: stays.startDate,
        endDate: stays.endDate,
        status: stays.status,
        visitNumber: stays.visitNumber,
      })
      .from(stays)
      .innerJoin(guests, eq(guests.id, stays.guestId))
      .leftJoin(units, eq(units.id, stays.unitId))
      .where(eq(stays.tenantId, tenantId))
      .orderBy(stays.startDate),
    db
      .select({ id: recommendations.id })
      .from(recommendations)
      .where(
        and(
          eq(recommendations.tenantId, tenantId),
          eq(recommendations.status, "pending"),
        ),
      ),
    db
      .select()
      .from(events)
      .where(eq(events.tenantId, tenantId))
      .orderBy(desc(events.occurredAt))
      .limit(8),
  ]);

  const arrivingToday = stayRows.filter((s) => s.startDate === today);
  const inResidence = stayRows.filter(
    (s) => s.startDate <= today && s.endDate >= today,
  );

  return {
    counts: {
      arrivingToday: arrivingToday.length,
      inResidence: inResidence.length,
      needApproval: pendingRecs.length,
    },
    arrivals: stayRows.filter((s) => s.startDate >= today).slice(0, 4),
    recentEvents,
  };
}
