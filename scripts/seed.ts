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
  consentGrants,
  consents,
  guests,
  integrationConnections,
  localInsights,
  preparationPlaybookActions,
  properties,
  propertyCapabilities,
  propertyConstraints,
  stays,
  tenants,
  units,
  users,
} from "@/db/schema";
import { allSubjects } from "@/lib/research/fixtures";
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

  // ---- Wave 2A: Pre-Arrival Intelligence Simulation Lab fixtures ----
  // Fictional guests for the research lab. Stays are set in the PAST (departed) so
  // they never appear on the Today dashboard and do not disturb Run 1 demo numbers.
  const [simProperty] = await db
    .insert(properties)
    .values({ tenantId, name: "Research Lab (Simulation)", location: "Fixtures · not a real place" })
    .returning();
  const [simUnit] = await db
    .insert(units)
    .values({ tenantId, propertyId: simProperty.id, name: "Sim Cabin", type: "simulation", capacity: 2 })
    .returning();

  let labGuestCount = 0;
  for (const { subject } of allSubjects()) {
    const [g] = await db
      .insert(guests)
      .values({
        tenantId,
        fullName: subject.profile.fullName,
        email: subject.profile.email,
        language: subject.profile.language,
        country: subject.profile.country,
      })
      .returning();
    labGuestCount += 1;

    await db.insert(stays).values({
      tenantId,
      guestId: g.id,
      unitId: simUnit.id,
      propertyId: simProperty.id,
      startDate: fmt(addDays(today, -40)),
      endDate: fmt(addDays(today, -35)),
      status: "departed",
      visitNumber: 1,
      valueAmountCents: 120000,
      currency: "EUR",
    });

    // Consent grant per scenario state. 'none' => no row at all.
    if (subject.consent === "granted") {
      await db.insert(consentGrants).values({
        tenantId,
        guestId: g.id,
        scope: "prearrival_research",
        status: "granted",
        grantedAt: new Date(),
      });
    } else if (subject.consent === "withdrawn") {
      await db.insert(consentGrants).values({
        tenantId,
        guestId: g.id,
        scope: "prearrival_research",
        status: "withdrawn",
        grantedAt: addDays(today, -2),
        withdrawnAt: new Date(),
      });
    }
  }

  // ---- Wave 2B: Property Intelligence demo (Atlantic Hideaway property only) ----
  // Fictional simulation content. No real businesses, partners, or live claims.
  // Attached to the real Atlantic Hideaway property so the other (simulation)
  // property stays empty — demonstrating property-scoped isolation.
  await db.insert(propertyCapabilities).values({
    tenantId,
    propertyId: property.id,
    title: "Early breakfast from 06:30",
    description: "Breakfast can be prepared and served from 06:30 if arranged the evening before.",
    categoryTags: ["food"],
    suitableFor: ["sunrise", "quiet"],
    leadTime: "evening before",
    hostEffort: "low",
    costLevel: "low",
  });
  await db.insert(propertyCapabilities).values({
    tenantId,
    propertyId: property.id,
    title: "Hand-drawn route card",
    description: "A simple hand-drawn map to a quiet local route can be left in the cabin.",
    categoryTags: ["nature", "hiking"],
    suitableFor: ["quiet"],
    hostEffort: "low",
    costLevel: "none",
  });

  await db.insert(localInsights).values({
    tenantId,
    propertyId: property.id,
    title: "Quiet coastal route (good weather only)",
    description:
      "The coastal route is calm and beautiful before 08:00, but only in good weather. Avoid Saturday mornings.",
    categoryTags: ["nature", "hiking"],
    suitableFor: ["quiet", "sunrise"],
    bestTimeOfDay: "before 08:00",
    weatherDependency: "good weather only",
    freshness: "verify_before_use",
  });

  await db.insert(propertyConstraints).values([
    {
      tenantId,
      propertyId: property.id,
      title: "Avoid Saturday-morning crowds on the coastal route",
      description: "Do not suggest the coastal route on Saturday mornings — it gets crowded.",
      ruleType: "timing",
      severity: "soft",
      applicabilityTags: ["nature"],
    },
    {
      tenantId,
      propertyId: property.id,
      title: "No car-dependent suggestions without a transfer",
      description: "Never suggest anything requiring a car unless a transfer option is confirmed.",
      ruleType: "mobility",
      severity: "hard",
    },
  ]);

  await db.insert(preparationPlaybookActions).values([
    {
      tenantId,
      propertyId: property.id,
      title: "Prepare a local craft note",
      description: "Leave a short handwritten note about a local craftsperson.",
      suitableFor: ["quiet"],
      hostEffort: "low",
      costLevel: "low",
    },
    {
      tenantId,
      propertyId: property.id,
      title: "Arrange transfer (after partner confirmation)",
      description: "Coordinate a transfer only once a partner has confirmed availability.",
      linkedCapabilityId: null,
      hostEffort: "medium",
      costLevel: "medium",
    },
  ]);

  console.log("Seed complete:");
  console.log("  tenant:", tenant.slug, tenantId);
  console.log("  user:  ", user.email);
  console.log("  guests: Maria & Tom, The Lunds, The Aaltos");
  console.log("  slice:  signal -> insight -> recommendation -> accepted -> host action -> outcome");
  console.log(`  research-lab subjects seeded: ${labGuestCount} (consent grants per scenario)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
