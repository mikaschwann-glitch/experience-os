import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { guests, recommendations } from "@/db/schema";

/** Tenant-aware read repository for recommendations. */

export async function listPendingRecommendations(tenantId: string) {
  const db = getDb();
  return db
    .select({
      id: recommendations.id,
      title: recommendations.title,
      description: recommendations.description,
      rationale: recommendations.rationale,
      effort: recommendations.effort,
      status: recommendations.status,
      createdAt: recommendations.createdAt,
      guestId: recommendations.guestId,
      guestName: guests.fullName,
    })
    .from(recommendations)
    .innerJoin(guests, eq(guests.id, recommendations.guestId))
    .where(
      and(
        eq(recommendations.tenantId, tenantId),
        eq(recommendations.status, "pending"),
      ),
    )
    .orderBy(desc(recommendations.createdAt));
}
