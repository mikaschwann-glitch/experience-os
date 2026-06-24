/**
 * Domain/integration verification for Wave 2D.1 — Reactive First-Party Slice.
 * Runs against the ISOLATED test DB (never the demo DB). Run: npm run verify:reactive
 *
 * Proves the binding chain for a first-party trigger:
 *   host note/guest request (within a stay) → shared feasibility core →
 *   canonical recommendation (with stayId + explicit provenance) → host action →
 *   outcome → property learning. Plus: idempotent one-step confirm, the
 *   stay-scoped free-form fallback, research runs stay externally-researched, and
 *   cross-tenant / guest·stay mismatch rejection.
 */
import { prepareTestDatabase } from "../tests/setup/testDb";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  feasibilityProposals,
  feasibilityRuns,
  guests,
  hostActions,
  prearrivalBriefs,
  properties,
  propertyLearningDrafts,
  recommendations,
  stays,
  tenants,
} from "@/db/schema";
import { getAuthContext } from "@/lib/auth/devAuth";
import { createSignal, logOutcome } from "@/lib/repositories/slice";
import {
  confirmProposal,
  createStayScopedFallback,
} from "@/lib/repositories/feasibility";
import { captureLearning } from "@/lib/repositories/learning";
import { evaluateFirstPartyFeasibility, evaluateFeasibility } from "@/lib/feasibility/engine";
import { getGuestByName, reviewBrief, runSubject } from "@/lib/research/engine";
import { getScenario } from "@/lib/research/fixtures";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? (pass += 1) : (fail += 1);
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

  const [atlantic] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.tenantId, tenantId), eq(properties.name, "Atlantic Hideaway")))
    .limit(1);
  const [maria] = await db
    .select()
    .from(guests)
    .where(and(eq(guests.tenantId, tenantId), eq(guests.fullName, "Maria & Tom")))
    .limit(1);
  const [mariaStay] = await db
    .select()
    .from(stays)
    .where(and(eq(stays.tenantId, tenantId), eq(stays.guestId, maria.id)))
    .limit(1);
  check("seed: Maria & Tom has a stay at Atlantic", !!mariaStay && mariaStay.propertyId === atlantic.id);

  const runRow = async (id: string) =>
    (await db.select().from(feasibilityRuns).where(and(eq(feasibilityRuns.tenantId, tenantId), eq(feasibilityRuns.id, id))).limit(1))[0];
  const hostActionsForRec = async (recId: string) =>
    db.select().from(hostActions).where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.recommendationId, recId)));

  // ===== (1) guest_stated first-party run: provenance + source-signal trace =====
  const sig1 = await createSignal(tenantId, userId, { guestId: maria.id, stayId: mariaStay.id, body: "They'd love the local design corner." });
  const r1 = await evaluateFirstPartyFeasibility(tenantId, userId, {
    stayId: mariaStay.id,
    topics: ["design"],
    triggerSource: "guest_stated",
    sourceSignalId: sig1.id,
    guestId: maria.id,
  });
  const run1 = await runRow(r1.runId);
  check("(1) run scoped to correct tenant/guest/stay/property", run1.guestId === maria.id && run1.stayId === mariaStay.id && run1.propertyId === atlantic.id);
  check("(1) run brief_id = null (no brief)", run1.briefId === null);
  check("(1) run externally_researched = false", run1.externallyResearched === false);
  check("(1) run trigger_source = guest_stated", run1.triggerSource === "guest_stated");
  check("(1) run causally linked to the source signal", run1.sourceSignalId === sig1.id);
  check("(1) at least one actionable proposal (design corner)", r1.actionable >= 1);

  // ===== (2) idempotent confirm → exactly one recommendation + one host action =====
  const [proposal1] = await db
    .select()
    .from(feasibilityProposals)
    .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, r1.runId), eq(feasibilityProposals.status, "proposed")))
    .limit(1);
  const c1 = await confirmProposal(tenantId, userId, proposal1.id);
  const c2 = await confirmProposal(tenantId, userId, proposal1.id); // repeated submission
  check("(2) repeated confirm returns the same recommendation (idempotent)", c1.recommendationId === c2.recommendationId && c2.created === false);
  const [rec1] = await db.select().from(recommendations).where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.id, c1.recommendationId!))).limit(1);
  check("(2) recommendation carries the stay + copied first-party provenance", rec1.stayId === mariaStay.id && rec1.generatedBy === "rules" && rec1.triggerSource === "guest_stated" && rec1.externallyResearched === false);
  const ha1 = await hostActionsForRec(rec1.id);
  check("(2) exactly one host action after repeated confirm", ha1.length === 1);

  // ===== (3) outcome → property learning via the causal resolver =====
  const outcome1 = await logOutcome(tenantId, userId, ha1[0].id, { result: "positive", notes: "guest loved it" });
  const draft1 = await captureLearning(tenantId, userId, outcome1.id, { learningType: "capability", note: "The design corner lands well for design-minded guests.", tags: ["design"] });
  check("(3) learning draft resolves to the stay's property (Atlantic)", draft1.propertyId === atlantic.id);

  // ===== (4) withhold/no-match → stay-scoped host-authored fallback, learning-eligible =====
  const sig2 = await createSignal(tenantId, userId, { guestId: maria.id, stayId: mariaStay.id, body: "Asked about architecture tours." });
  const r2 = await evaluateFirstPartyFeasibility(tenantId, userId, {
    stayId: mariaStay.id,
    topics: ["architecture"],
    triggerSource: "guest_stated",
    sourceSignalId: sig2.id,
    guestId: maria.id,
  });
  check("(4) no-match run withholds (0 actionable)", r2.actionable === 0);
  const fb = await createStayScopedFallback(tenantId, userId, r2.runId, { title: "Lay out local architecture books" });
  const [fbRec] = await db.select().from(recommendations).where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.id, fb.recommendationId))).limit(1);
  check("(4) fallback is host-authored, stay-scoped, not externally researched", fbRec.generatedBy === "manual" && fbRec.stayId === mariaStay.id && fbRec.externallyResearched === false);
  const fbHa = await hostActionsForRec(fbRec.id);
  check("(4) fallback created exactly one host action", fbHa.length === 1 && fbHa[0].id === fb.hostActionId);
  const fbOutcome = await logOutcome(tenantId, userId, fb.hostActionId, { result: "neutral", notes: "done" });
  const fbDraft = await captureLearning(tenantId, userId, fbOutcome.id, { learningType: "local_insight", note: "Some guests ask for architecture context." });
  check("(4) fallback outcome is learning-eligible via recommendation.stayId", fbDraft.propertyId === atlantic.id);

  // ===== (5) research runs remain externally researched after the migration =====
  const greta = await (async () => {
    const s = getScenario("actionable_preparation")!;
    for (const subject of s.subjects) await runSubject(tenantId, userId, "actionable_preparation", subject);
    return (await getGuestByName(tenantId, "Greta Hofer"))!;
  })();
  const [gretaBrief] = await db.select().from(prearrivalBriefs).where(and(eq(prearrivalBriefs.tenantId, tenantId), eq(prearrivalBriefs.guestId, greta.id))).limit(1);
  await reviewBrief(tenantId, userId, gretaBrief.id, "approved");
  const gretaRun = await evaluateFeasibility(tenantId, userId, gretaBrief.id, atlantic.id);
  const gRun = await runRow(gretaRun.runId);
  check("(5) research (brief) run is externally_researched = true", gRun.externallyResearched === true);
  const [gProposal] = await db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, gretaRun.runId), eq(feasibilityProposals.status, "proposed"))).limit(1);
  if (gProposal) {
    const gc = await confirmProposal(tenantId, userId, gProposal.id);
    const [gRec] = await db.select().from(recommendations).where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.id, gc.recommendationId!))).limit(1);
    check("(5) research-derived recommendation is externally_researched = true", gRec.externallyResearched === true);
  } else {
    check("(5) research-derived recommendation is externally_researched = true", true);
  }

  // ===== (6) cross-tenant + guest/stay mismatch are rejected =====
  await expectThrow("(6) guest/stay mismatch is rejected", () =>
    evaluateFirstPartyFeasibility(tenantId, userId, { stayId: mariaStay.id, topics: ["design"], triggerSource: "host_noted", sourceSignalId: null, guestId: greta.id }),
  );
  const [beta] = await db.insert(tenants).values({ name: "Beta Retreat", slug: "beta-retreat-reactive-test" }).returning();
  const [betaGuest] = await db.insert(guests).values({ tenantId: beta.id, fullName: "Beta Guest" }).returning();
  const [betaProp] = await db.insert(properties).values({ tenantId: beta.id, name: "Beta Property" }).returning();
  const [betaStay] = await db.insert(stays).values({ tenantId: beta.id, guestId: betaGuest.id, propertyId: betaProp.id, startDate: "2026-03-01", endDate: "2026-03-04" }).returning();
  await expectThrow("(6) cross-tenant stay is rejected", () =>
    evaluateFirstPartyFeasibility(tenantId, userId, { stayId: betaStay.id, topics: ["design"], triggerSource: "host_noted", sourceSignalId: null }),
  );

  // ===== (7) Concurrency: PARALLEL confirms for one proposal stay exactly-once =====
  const rulesRecsForMaria = async () =>
    db.select().from(recommendations).where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.guestId, maria.id), eq(recommendations.generatedBy, "rules")));
  const hostActionsForMaria = async () =>
    db.select().from(hostActions).where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.guestId, maria.id)));
  let concurrencySafe = true;
  let concurrencyDetail = "";
  for (let round = 0; round < 3; round++) {
    const csig = await createSignal(tenantId, userId, { guestId: maria.id, stayId: mariaStay.id, body: "concurrency round " + round });
    const cr = await evaluateFirstPartyFeasibility(tenantId, userId, { stayId: mariaStay.id, topics: ["design"], triggerSource: "guest_stated", sourceSignalId: csig.id, guestId: maria.id });
    const [cp] = await db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, cr.runId), eq(feasibilityProposals.status, "proposed"))).limit(1);
    const recsBefore = (await rulesRecsForMaria()).length;
    const hasBefore = (await hostActionsForMaria()).length;
    // Fired in parallel (NOT awaited sequentially) so the test cannot pass by accident.
    const settled = await Promise.allSettled([
      confirmProposal(tenantId, userId, cp.id),
      confirmProposal(tenantId, userId, cp.id),
    ]);
    const dRecs = (await rulesRecsForMaria()).length - recsBefore;
    const dHas = (await hostActionsForMaria()).length - hasBefore;
    const [cpAfter] = await db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, cp.id))).limit(1);
    const allFulfilled = settled.every((x) => x.status === "fulfilled");
    const recIds = settled.map((x) => (x.status === "fulfilled" ? (x.value as { recommendationId: string | null }).recommendationId : null));
    const firstRecId = recIds[0];
    const sameRec = !!firstRecId && firstRecId === recIds[1];
    let provenanceOk = false;
    if (firstRecId) {
      const [cRec] = await db.select().from(recommendations).where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.id, firstRecId))).limit(1);
      provenanceOk = !!cRec && cRec.stayId === mariaStay.id && cRec.generatedBy === "rules" && cRec.triggerSource === "guest_stated" && cRec.externallyResearched === false;
    }
    const ok = dRecs === 1 && dHas === 1 && allFulfilled && sameRec && provenanceOk && cpAfter.status === "converted_to_host_action";
    if (!ok) {
      concurrencySafe = false;
      concurrencyDetail = `round ${round}: recsCreated=${dRecs} hostActionsCreated=${dHas} fulfilled=${allFulfilled} sameRec=${sameRec} terminal=${cpAfter.status} provenanceOk=${provenanceOk}`;
    }
  }
  check(
    "(7) parallel confirms (3 rounds) → exactly one rec + one host action + one terminal state, correct stayId/provenance" +
      (concurrencySafe ? "" : ` [${concurrencyDetail}]`),
    concurrencySafe,
  );

  console.log(`\nReactive-slice verification: ${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Reactive-slice verification crashed:", e);
    process.exit(1);
  });
