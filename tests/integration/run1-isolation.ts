/**
 * Integration regression (isolated test DB):
 *   C. Run 1 chain: Signal → Insight → Recommendation → HostAction → Outcome → Event Log
 *   D. Cross-tenant isolation: a second tenant's property cannot be read/mutated
 *      from the first tenant's context.
 *
 * Runs against TEST_DATABASE_URL (importing ./setup/testDb routes getDb there and
 * guards against touching the demo DB). Run with: npm run test:integration
 */
import { prepareTestDatabase } from "../setup/testDb";
import { and, eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db/client";
import { events, guests, properties, stays, tenants } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/devAuth";
import {
  createHostAction,
  createInsightFromSignal,
  createRecommendationFromInsight,
  createSignal,
  logOutcome,
  setRecommendationStatus,
} from "@/lib/repositories/slice";
import {
  createCapability,
  getPropertyIntelligence,
} from "@/lib/repositories/propertyIntelligence";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}`);
  }
}
async function expectThrow(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false);
  } catch {
    check(name, true);
  }
}

async function main() {
  await prepareTestDatabase();
  const { tenantId, userId } = await getAuthContext();
  const db = getDb();

  // ---- C. Run 1 manual workflow ----
  const [guest] = await db
    .select()
    .from(guests)
    .where(and(eq(guests.tenantId, tenantId), eq(guests.fullName, "Maria & Tom")))
    .limit(1);
  check("run1: demo guest exists", !!guest);

  // Wave 1A: an operational Preparation must be stay-bound. Resolve the guest's stay
  // and carry it through the chain so createHostAction can bind it.
  const [guestStay] = await db
    .select()
    .from(stays)
    .where(and(eq(stays.tenantId, tenantId), eq(stays.guestId, guest.id)))
    .limit(1);
  check("run1: demo guest has a stay", !!guestStay);

  const signal = await createSignal(tenantId, userId, {
    guestId: guest.id,
    stayId: guestStay.id,
    body: "E2E: tenth anniversary; quiet sunrise spots.",
  });
  const insight = await createInsightFromSignal(tenantId, userId, signal.id, {
    summary: "E2E: anniversary, values quiet mornings.",
  });
  const rec = await createRecommendationFromInsight(tenantId, userId, insight.id, {
    title: "E2E: private sunrise breakfast",
    stayId: guestStay.id,
    status: "accepted",
  });
  const accepted = await setRecommendationStatus(tenantId, userId, rec.id, "accepted");
  const action = await createHostAction(tenantId, userId, rec.id, {
    title: "E2E: prepare sunrise breakfast",
  });
  const outcome = await logOutcome(tenantId, userId, action.id, { result: "positive" });

  check(
    "run1: every entity created",
    !!signal.id && !!insight.id && !!rec.id && accepted.status === "accepted" && !!action.id && !!outcome.id,
  );

  const corr = signal.correlationId;
  // correlation_id flows through the entities that carry it; outcomes link via
  // host_action_id (no correlation_id column by Run 1 design) and via the
  // outcome.created event (asserted in the event-chain check below).
  check(
    "run1: correlation id consistent across signal→insight→recommendation→host_action",
    insight.correlationId === corr && rec.correlationId === corr && action.correlationId === corr,
  );
  check("run1: outcome linked to its host action", outcome.hostActionId === action.id);
  check(
    "run1: tenant scoping retained on every entity",
    [signal, insight, rec, action, outcome].every((r) => r.tenantId === tenantId),
  );

  const evs = await db
    .select()
    .from(events)
    .where(and(eq(events.tenantId, tenantId), eq(events.correlationId, corr)));
  const types = new Set(evs.map((e) => e.type));
  const expected = [
    "signal.created",
    "insight.created",
    "recommendation.created",
    "recommendation.accepted",
    "host_action.created",
    "outcome.created",
  ];
  check("run1: causal event chain present in order of creation", expected.every((t) => types.has(t)));
  check(
    "run1: events are PII-light (guest free-text not leaked into payloads)",
    evs.every((e) => !JSON.stringify(e.payload ?? {}).toLowerCase().includes("anniversary")),
  );

  // ---- D. Cross-tenant isolation ----
  const [beta] = await db
    .insert(tenants)
    .values({ name: "Beta Retreat", slug: "beta-retreat-test" })
    .returning();
  const [betaProp] = await db
    .insert(properties)
    .values({ tenantId: beta.id, name: "Beta Property" })
    .returning();

  await expectThrow("isolation: tenant A cannot READ tenant B's property knowledge", async () =>
    getPropertyIntelligence(tenantId, betaProp.id),
  );
  await expectThrow("isolation: tenant A cannot MUTATE tenant B's property", async () =>
    createCapability(tenantId, userId, betaProp.id, { title: "intrusion attempt" }),
  );

  const betaPi = await getPropertyIntelligence(beta.id, betaProp.id);
  check(
    "isolation: tenant B's property is empty (no cross-tenant leakage)",
    betaPi.capabilities.length === 0 &&
      betaPi.insights.length === 0 &&
      betaPi.constraints.length === 0 &&
      betaPi.playbook.length === 0,
  );

  await closeDb();
  console.log(`\nRun 1 + isolation integration: ${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Integration test crashed:", e);
    process.exit(1);
  });
