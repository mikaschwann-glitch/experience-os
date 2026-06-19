/**
 * Run 1 seed — builds the demo tenant and the full vertical-slice scenario:
 *   Maria & Tom anniversary -> signal -> insight -> recommendation
 *   -> accepted -> host action -> outcome -> event timeline.
 *
 * Idempotent: deletes the demo tenant first (FKs cascade), then recreates it.
 * Requires DATABASE_URL. Run with: npm run db:seed
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  consents,
  guests,
  integrationConnections,
  properties,
  stays,
  tenants,
  units,
  users,
} from "@/db/schema";
import { emitEvent } from "@/lib/events/events";
import {
  createHostAction,
  createInsightFromSignal,
  createRecommendationFromInsight,
  createSignal,
  logOutcome,
  setRecommendationStatus,
} from "@/lib/repositories/slice";
import { DEMO_TENANT_SLUG, DEMO_USER_EMAIL } from "@/lib/auth/devAuth";

// tsx does not auto-load .env.local; load it before any DB access (dev only).
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — rely on the ambient environment otherwise.
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  const db = getDb();
  const today = new Date();

  // Clean slate for the demo tenant (cascades to all tenant-owned rows).
  await db.delete(tenants).where(eq(tenants.slug, DEMO_TENANT_SLUG));

  // Tenant + dev user + mock PMS connection.
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Atlantic Hideaway", slug: DEMO_TENANT_SLUG })
    .returning();
  const tenantId = tenant.id;

  const [user] = await db
    .insert(users)
    .values({
      tenantId,
      email: DEMO_USER_EMAIL,
      name: "Sofia Medeiros",
      role: "host",
    })
    .returning();
  const userId = user.id;

  await db.insert(integrationConnections).values({
    tenantId,
    provider: "mock_pms",
    status: "connected",
  });

  // Property + units.
  const [property] = await db
    .insert(properties)
    .values({ tenantId, name: "Atlantic Hideaway", location: "São Miguel, Azores" })
    .returning();

  const unitRows = await db
    .insert(units)
    .values([
      { tenantId, propertyId: property.id, name: "Ocean Cabin 02", type: "cabin", capacity: 2 },
      { tenantId, propertyId: property.id, name: "Villa Basalt 03", type: "villa", capacity: 4 },
      { tenantId, propertyId: property.id, name: "Pine Cabin 01", type: "cabin", capacity: 2 },
    ])
    .returning();
  const ocean = unitRows[0];
  const villa = unitRows[1];
  const pine = unitRows[2];

  // Guests + stays (+ a guest.created / stay.created event each, in one tx).
  async function seedGuestWithStay(input: {
    fullName: string;
    email: string;
    language: string;
    country: string;
    unitId: string;
    start: Date;
    end: Date;
    status: "upcoming" | "in_residence" | "departed";
    visitNumber: number;
    valueAmountCents: number;
  }) {
    return db.transaction(async (tx) => {
      const [guest] = await tx
        .insert(guests)
        .values({
          tenantId,
          fullName: input.fullName,
          email: input.email,
          language: input.language,
          country: input.country,
        })
        .returning();

      await emitEvent(tx, {
        tenantId,
        actorUserId: userId,
        type: "guest.created",
        entityType: "guest",
        entityId: guest.id,
        payload: { country: input.country },
      });

      const [stay] = await tx
        .insert(stays)
        .values({
          tenantId,
          guestId: guest.id,
          unitId: input.unitId,
          propertyId: property.id,
          startDate: fmt(input.start),
          endDate: fmt(input.end),
          status: input.status,
          visitNumber: input.visitNumber,
          valueAmountCents: input.valueAmountCents,
          currency: "EUR",
        })
        .returning();

      await emitEvent(tx, {
        tenantId,
        actorUserId: userId,
        type: "stay.created",
        entityType: "stay",
        entityId: stay.id,
        payload: { unitId: input.unitId, status: input.status },
      });

      // Consent rows are schema-only in Run 1 (no UI / workflows).
      await tx.insert(consents).values({
        tenantId,
        guestId: guest.id,
        type: "data_processing",
        granted: true,
        occurredAt: new Date(),
      });

      return { guest, stay };
    });
  }

  const mariaTom = await seedGuestWithStay({
    fullName: "Maria & Tom",
    email: "maria.tom@example.com",
    language: "en",
    country: "PT",
    unitId: ocean.id,
    start: today,
    end: addDays(today, 4),
    status: "upcoming",
    visitNumber: 2,
    valueAmountCents: 168000,
  });

  await seedGuestWithStay({
    fullName: "The Lunds",
    email: "lunds@example.com",
    language: "sv",
    country: "SE",
    unitId: villa.id,
    start: addDays(today, -3),
    end: addDays(today, 6),
    status: "in_residence",
    visitNumber: 1,
    valueAmountCents: 305000,
  });

  await seedGuestWithStay({
    fullName: "The Aaltos",
    email: "aaltos@example.com",
    language: "fi",
    country: "FI",
    unitId: pine.id,
    start: addDays(today, -7),
    end: addDays(today, -1),
    status: "departed",
    visitNumber: 1,
    valueAmountCents: 142000,
  });

  // ---- The vertical slice for Maria & Tom (uses the real repository writes) ----
  const guestId = mariaTom.guest.id;
  const stayId = mariaTom.stay.id;

  const signal = await createSignal(tenantId, userId, {
    guestId,
    stayId,
    body: "Booking note: “It’s our tenth anniversary.” Also asked about quiet sunrise spots.",
  });

  const insight = await createInsightFromSignal(tenantId, userId, signal.id, {
    summary: "Celebrating 10-year anniversary; values quiet, understated moments.",
    detail:
      "No alcohol (both guests). Prefers understated to a surprise. Declined the wine welcome on the 2023 stay.",
  });

  const recommendation = await createRecommendationFromInsight(
    tenantId,
    userId,
    insight.id,
    {
      title: "Private sunrise breakfast on the deck",
      description:
        "A quiet anniversary-morning gesture set just for the two of them. Alcohol-free local drink, fresh bread and island fruit, a short handwritten note.",
      rationale:
        "Built from what they told us: the anniversary note, the sunrise question, and a clear preference for quiet, alcohol-free gestures.",
      effort: "low",
    },
  );

  await setRecommendationStatus(tenantId, userId, recommendation.id, "accepted");

  const action = await createHostAction(tenantId, userId, recommendation.id, {
    title: "Prepare private sunrise breakfast (Ocean Cabin 02)",
    description: "Confirm 06:30 setup with the kitchen by 18:00. Keep it private and understated.",
  });

  await logOutcome(tenantId, userId, action.id, {
    result: "positive",
    notes: "Set up quietly at first light. They loved it — no fuss, exactly their style.",
  });

  // A second, still-pending recommendation for The Lunds (populates the queue).
  const lundsSignal = await createSignal(tenantId, userId, {
    guestId: (
      await db.select().from(guests).where(eq(guests.tenantId, tenantId))
    ).find((g) => g.fullName === "The Lunds")!.id,
    body: "Asked twice about hiking routes near the lakes.",
  });
  const lundsInsight = await createInsightFromSignal(tenantId, userId, lundsSignal.id, {
    summary: "Active guests; keen on hiking the crater lakes.",
  });
  await createRecommendationFromInsight(tenantId, userId, lundsInsight.id, {
    title: "Hand-drawn map of the Lagoa do Fogo trail",
    description: "Leave a simple route card with timing and the quiet entrance.",
    rationale: "They asked about hiking routes more than once.",
    effort: "low",
  });

  console.log("Seed complete:");
  console.log("  tenant:", tenant.slug, tenantId);
  console.log("  user:  ", user.email);
  console.log("  guests: Maria & Tom, The Lunds, The Aaltos");
  console.log("  slice:  signal -> insight -> recommendation -> accepted -> host action -> outcome");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
