/**
 * Wave 2 — workflow-simplicity lifecycle verification (ISOLATED test DB).
 * Run: npm run verify:wave2
 *
 * Proves:
 *   - deterministic free-text -> canonical concept mapping (no LLM), word-boundary safe;
 *   - grounded clarifications are derived from real property knowledge and capped at 3;
 *   - the honest "Mark as ready" lifecycle (planned -> prepared) with ONE immutable
 *     execution snapshot, idempotent, and distinct from an outcome;
 *   - an outcome binds to the execution snapshot (frozen rule);
 *   - a cancelled preparation cannot be marked ready;
 *   - the concept-mapping audit event is PII-light (no raw host text).
 */
import { prepareTestDatabase } from "../tests/setup/testDb";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  events,
  feasibilityProposals,
  guests,
  hostActions,
  outcomes,
  preparationExecutions,
  properties,
  stays,
} from "@/db/schema";
import { getAuthContext } from "@/lib/auth/devAuth";
import { createSignal, logOutcome, markPrepared } from "@/lib/repositories/slice";
import { confirmProposal, createAnotherFromAlternative } from "@/lib/repositories/feasibility";
import { evaluateFirstPartyFeasibility } from "@/lib/feasibility/engine";
import {
  getOtherIdeasConsidered,
  getPreparationWorkItem,
  listPreparationWorkItems,
} from "@/lib/readmodels/preparations";
import {
  groundedClarifications,
  logConceptMapping,
  mapTextToConcepts,
} from "@/lib/domain/conceptMapping";
import { rankProposals, type RankableProposal } from "@/lib/feasibility/ranking";

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

  // ===== (1) deterministic free-text -> concept mapping (no LLM) =====
  const a = mapTextToConcepts("They'd like a quiet beach walk away from the crowds.");
  check("(1) 'quiet ... away from the crowds' -> includes quiet", a.concepts.includes("quiet"));
  check("(1) outdoor 'beach walk' -> includes hiking or nature", a.concepts.includes("hiking") || a.concepts.includes("nature"));
  check("(1) confident when a concept is found", a.confident === true);
  const b = mapTextToConcepts("local architecture and historical buildings");
  check("(1) 'architecture / historical buildings' -> architecture", b.concepts.includes("architecture"));
  const none = mapTextToConcepts("zzzqqq wibble flimflam");
  check("(1) no concept -> not confident, empty", none.confident === false && none.concepts.length === 0);
  const wb = mapTextToConcepts("we walked along the boardwalk");
  check("(1) word-boundary: 'walked'/'boardwalk' do NOT falsely map to hiking", !wb.concepts.includes("hiking"));

  // ===== (2) grounded clarifications come from real property knowledge =====
  const [atlantic] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.tenantId, tenantId), eq(properties.name, "Atlantic Hideaway")))
    .limit(1);
  const clar = await groundedClarifications(tenantId, atlantic.id);
  check("(2) grounded clarifications: at least one, capped at 3", clar.length >= 1 && clar.length <= 3);
  check("(2) each clarification carries canonical concepts", clar.every((x) => x.concepts.length > 0));

  // ===== build a Preparation (planned) for Maria & Tom at Atlantic =====
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
  const sig = await createSignal(tenantId, userId, { guestId: maria.id, stayId: mariaStay.id, body: "They'd love the local design corner." });
  const r1 = await evaluateFirstPartyFeasibility(tenantId, userId, {
    stayId: mariaStay.id,
    topics: ["design"],
    triggerSource: "guest_stated",
    sourceSignalId: sig.id,
    guestId: maria.id,
  });
  const [proposal] = await db
    .select()
    .from(feasibilityProposals)
    .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, r1.runId), eq(feasibilityProposals.status, "proposed")))
    .limit(1);
  const conf = await confirmProposal(tenantId, userId, proposal.id);
  const prepId = conf.preparationId;

  const wiPlanned = await getPreparationWorkItem(tenantId, prepId);
  check("(3) a new preparation reads as Active + actionable", wiPlanned?.kind === "planned" && wiPlanned?.actionable === true);

  // ===== (4) Mark as ready: planned -> prepared + immutable execution snapshot =====
  const m1 = await markPrepared(tenantId, userId, prepId);
  check("(4) markPrepared performed the transition + wrote an execution", m1.created === true && !!m1.executionId);
  const [haAfter] = await db.select().from(hostActions).where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.id, prepId))).limit(1);
  check("(4) host action status is 'prepared' (NOT 'done')", haAfter.status === "prepared");
  const execs = await db
    .select()
    .from(preparationExecutions)
    .where(and(eq(preparationExecutions.tenantId, tenantId), eq(preparationExecutions.hostActionId, prepId)));
  check("(4) exactly one immutable execution snapshot, version 1", execs.length === 1 && execs[0].version === 1);
  const snap = execs[0].snapshot as Record<string, unknown>;
  check("(4) snapshot captures title + stay + guest", snap.title === haAfter.title && snap.stayId === mariaStay.id && snap.guestId === maria.id);
  check("(4) execution records who prepared it", execs[0].preparedByUserId === userId);

  const m2 = await markPrepared(tenantId, userId, prepId);
  const execs2 = await db
    .select()
    .from(preparationExecutions)
    .where(and(eq(preparationExecutions.tenantId, tenantId), eq(preparationExecutions.hostActionId, prepId)));
  check("(4) markPrepared is idempotent (no second snapshot)", m2.created === false && execs2.length === 1);

  // ===== (5) prepared reads honestly as Completed, not actionable =====
  const wiPrepared = await getPreparationWorkItem(tenantId, prepId);
  check("(5) prepared preparation reads as Completed + not actionable", wiPrepared?.kind === "completed" && wiPrepared?.actionable === false);

  // ===== (6) outcome binds to the execution snapshot (frozen rule) =====
  const outcome = await logOutcome(tenantId, userId, prepId, { result: "positive", notes: "guest loved it" });
  const [outRow] = await db.select().from(outcomes).where(and(eq(outcomes.tenantId, tenantId), eq(outcomes.id, outcome.id))).limit(1);
  check("(6) outcome binds to the execution snapshot (execution_id)", outRow.executionId === execs[0].id);

  // ===== (7) a cancelled preparation cannot be marked ready =====
  const sig2 = await createSignal(tenantId, userId, { guestId: maria.id, stayId: mariaStay.id, body: "Another idea for the design corner." });
  const r2 = await evaluateFirstPartyFeasibility(tenantId, userId, {
    stayId: mariaStay.id,
    topics: ["design"],
    triggerSource: "host_noted",
    sourceSignalId: sig2.id,
    guestId: maria.id,
  });
  const [prop2] = await db
    .select()
    .from(feasibilityProposals)
    .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, r2.runId), eq(feasibilityProposals.status, "proposed")))
    .limit(1);
  const conf2 = await confirmProposal(tenantId, userId, prop2.id);
  await db.update(hostActions).set({ status: "cancelled" }).where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.id, conf2.preparationId)));
  await expectThrow("(7) a cancelled preparation cannot be marked ready", () => markPrepared(tenantId, userId, conf2.preparationId));

  // ===== (8) concept-mapping audit event is PII-light (no raw text) =====
  await logConceptMapping(tenantId, userId, { stayId: mariaStay.id, concepts: a.concepts, outcome: "matched" });
  const [evt] = await db
    .select()
    .from(events)
    .where(and(eq(events.tenantId, tenantId), eq(events.type, "concept_mapping.evaluated")))
    .orderBy(desc(events.createdAt))
    .limit(1);
  const payload = (evt?.payload ?? {}) as Record<string, unknown>;
  check(
    "(8) concept-mapping audit is PII-light (concepts/outcome only, no raw text)",
    !!evt &&
      typeof payload.conceptCount === "number" &&
      Array.isArray(payload.concepts) &&
      !("text" in payload) &&
      !("note" in payload) &&
      !("body" in payload),
  );

  // ===== (9) deterministic primary ranking (pure, grounded in real fields) =====
  const synth: RankableProposal[] = [
    { title: "A", matchedTags: ["nature"], confirmationRequired: false, freshness: null, hostEffort: "low", costLevel: "none", linkedCapabilityId: "c1" },
    { title: "B", matchedTags: ["nature", "quiet"], confirmationRequired: false, freshness: null, hostEffort: "low", costLevel: "none", linkedCapabilityId: "c2" },
    { title: "C", matchedTags: ["nature", "quiet"], confirmationRequired: true, freshness: null, hostEffort: "low", costLevel: "none", linkedCapabilityId: "c3" },
  ];
  const rk1 = rankProposals(synth);
  const rk2 = rankProposals(synth);
  check("(9) ranking: highest coverage is primary", rk1.ranked[0].title === "B");
  check("(9) ranking: deterministic across calls", rk1.ranked.map((x) => x.title).join() === rk2.ranked.map((x) => x.title).join());
  check("(9) ranking: clear winner is NOT flagged ambiguous", rk1.ambiguous === false);
  check("(9) ranking: removing the primary promotes the next eligible", rankProposals(synth.filter((p) => p.title !== "B")).ranked[0].title === "C");
  const tie: RankableProposal[] = [
    { title: "X", matchedTags: ["nature"], confirmationRequired: false, freshness: null, hostEffort: "low", costLevel: "low", linkedCapabilityId: "c1" },
    { title: "Y", matchedTags: ["quiet"], confirmationRequired: false, freshness: null, hostEffort: "low", costLevel: "low", linkedCapabilityId: "c2" },
  ];
  check("(9) ranking: a meaningful top-2 tie is flagged ambiguous", rankProposals(tie).ambiguous === true);
  const stalePair: RankableProposal[] = [
    { title: "Fresh", matchedTags: ["nature"], confirmationRequired: false, freshness: null, hostEffort: "low", costLevel: "low", linkedLocalInsightId: "i1" },
    { title: "Stale", matchedTags: ["nature"], confirmationRequired: false, freshness: "verify_before_use", hostEffort: "low", costLevel: "low", linkedLocalInsightId: "i2" },
  ];
  check("(9) ranking: a stale (verify-before-use) idea ranks below a fresh one", rankProposals(stalePair).ranked[0].title === "Fresh");
  // Validity GATE: a fresh idea must beat a HIGHER-coverage verify-before-use one.
  const validityGate: RankableProposal[] = [
    { title: "FreshLowCoverage", matchedTags: ["nature"], confirmationRequired: false, freshness: null, hostEffort: "low", costLevel: "low", linkedCapabilityId: "c1" },
    { title: "StaleHighCoverage", matchedTags: ["nature", "quiet", "food"], confirmationRequired: false, freshness: "verify_before_use", hostEffort: "low", costLevel: "low", linkedLocalInsightId: "i1" },
  ];
  check("(9) validity gate: a fresh idea beats a HIGHER-coverage verify-before-use one", rankProposals(validityGate).ranked[0].title === "FreshLowCoverage");
  // verify-before-use may be primary ONLY when no fresh alternative exists.
  const allStale: RankableProposal[] = [
    { title: "StaleSmall", matchedTags: ["nature"], confirmationRequired: false, freshness: "verify_before_use", hostEffort: "low", costLevel: "low", linkedLocalInsightId: "i1" },
    { title: "StaleBig", matchedTags: ["nature", "quiet"], confirmationRequired: false, freshness: "verify_before_use", hostEffort: "low", costLevel: "low", linkedLocalInsightId: "i2" },
  ];
  check("(9) when all are verify-before-use, the best one may be primary", rankProposals(allStale).ranked[0].title === "StaleBig");

  // ===== build a run with MULTIPLE actionable proposals (one guest need) =====
  const sigSib = await createSignal(tenantId, userId, { guestId: maria.id, stayId: mariaStay.id, body: "A quiet beach walk away from the crowds." });
  const runA = await evaluateFirstPartyFeasibility(tenantId, userId, {
    stayId: mariaStay.id, topics: ["quiet", "nature", "hiking"], triggerSource: "guest_stated", sourceSignalId: sigSib.id, guestId: maria.id,
  });
  check("(10) the run produced multiple alternatives for one need", runA.actionable >= 2);

  // An INDEPENDENT run for the same stay (separate trigger → separate work).
  const sigB = await createSignal(tenantId, userId, { guestId: maria.id, stayId: mariaStay.id, body: "Separate request." });
  const runB = await evaluateFirstPartyFeasibility(tenantId, userId, {
    stayId: mariaStay.id, topics: ["quiet", "nature", "hiking"], triggerSource: "host_noted", sourceSignalId: sigB.id, guestId: maria.id,
  });
  const propsB = await db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, runB.runId)));
  const propsBOpenBefore = propsB.filter((p) => p.status === "proposed" || p.status === "requires_confirmation").map((p) => p.id);

  // Confirm ONE proposal from run A. Siblings = the OTHER actionable proposals of the
  // same run (proposed/requires_confirmation) — NOT the engine-withheld ones.
  const allABefore = await db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, runA.runId)));
  const actionableBeforeA = allABefore.filter((p) => p.status === "proposed" || p.status === "requires_confirmation");
  const { ranked: rankedA } = rankProposals(actionableBeforeA);
  const chosenA = rankedA[0];
  const expectedSiblingIds = actionableBeforeA.filter((p) => p.id !== chosenA.id).map((p) => p.id);
  const confA = await confirmProposal(tenantId, userId, chosenA.id);

  // ===== (10) siblings of the SAME run are superseded after one is chosen =====
  const allAAfter = await db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, runA.runId)));
  const siblingsAfter = allAAfter.filter((p) => expectedSiblingIds.includes(p.id));
  check("(10) the chosen proposal converted to a host action", allAAfter.find((p) => p.id === chosenA.id)?.status === "converted_to_host_action");
  check("(10) every actionable sibling of the same run is 'superseded'", expectedSiblingIds.length >= 1 && siblingsAfter.every((p) => p.status === "superseded"));

  // siblings disappear from actionable surfaces (Today / Suggested / guest recovery)
  const guestItems = await listPreparationWorkItems(tenantId, { guestId: maria.id });
  const suggestedFromRunA = guestItems.filter((i) => i.kind === "suggested" && i.runId === runA.runId);
  check("(10) superseded siblings are NOT actionable/suggested anywhere", suggestedFromRunA.length === 0);

  // ===== (11) siblings remain auditable + non-actionable (not deleted/rejected) =====
  check("(11) siblings are retained (not deleted)", siblingsAfter.length === expectedSiblingIds.length);
  check("(11) siblings are NOT marked rejected / not_useful", siblingsAfter.every((p) => p.status !== "rejected" && p.status !== "not_useful"));
  const considered = await getOtherIdeasConsidered(tenantId, confA.preparationId);
  check("(11) siblings surface under 'Other ideas considered' on the created Preparation", !!considered && considered.siblings.length === expectedSiblingIds.length && considered.runId === runA.runId);

  const siblingProposalId = considered!.siblings[0].id;

  // ===== (11c) a STALE NORMAL confirm of a superseded proposal creates NO second prep =====
  // (Host B's old tab clicks the normal "Create preparation" on a set-aside proposal.)
  const stale = await confirmProposal(tenantId, userId, siblingProposalId);
  check("(11c) stale normal confirm returns the ORIGINAL preparation (no second)", stale.preparationId === confA.preparationId && stale.created === false);
  const [staleStill] = await db.select({ status: feasibilityProposals.status }).from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, siblingProposalId))).limit(1);
  check("(11c) the stale normal confirm did NOT convert the superseded proposal", staleStill.status === "superseded");

  // ===== (11b) the EXPLICIT "create another from a set-aside idea" action is safe =====
  const another = await createAnotherFromAlternative(tenantId, userId, siblingProposalId);
  check("(11b) explicit create-another makes a DISTINCT preparation", another.preparationId !== confA.preparationId && another.created === true);
  const againAnother = await createAnotherFromAlternative(tenantId, userId, siblingProposalId);
  check("(11b) the explicit create-another path is idempotent (no duplicate)", againAnother.preparationId === another.preparationId && againAnother.created === false);
  const [anotherHa] = await db.select().from(hostActions).where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.id, another.preparationId))).limit(1);
  check("(11b) the new preparation is stay-bound to the same stay", anotherHa.stayId === mariaStay.id);
  const [firstStill] = await db.select().from(hostActions).where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.id, confA.preparationId))).limit(1);
  check("(11b) the first preparation is unaffected", !!firstStill && firstStill.id === confA.preparationId);
  const [sibStatus] = await db.select({ status: feasibilityProposals.status }).from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.id, siblingProposalId))).limit(1);
  check("(11b) the chosen set-aside proposal is now converted (not still superseded)", sibStatus.status === "converted_to_host_action");

  // ===== (12) an independent feasibility run is unaffected =====
  const propsBAfter = await db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, runB.runId)));
  const propsBOpenAfter = propsBAfter.filter((p) => p.status === "proposed" || p.status === "requires_confirmation").map((p) => p.id);
  check("(12) the independent run's proposals are untouched (still open)", propsBOpenAfter.sort().join() === propsBOpenBefore.sort().join() && propsBOpenAfter.length >= 1);

  // ===== (13) integration determinism: same scenario -> same primary every time =====
  const sigD1 = await createSignal(tenantId, userId, { guestId: maria.id, stayId: mariaStay.id, body: "Determinism check one." });
  const runD1 = await evaluateFirstPartyFeasibility(tenantId, userId, { stayId: mariaStay.id, topics: ["quiet", "nature", "hiking"], triggerSource: "host_noted", sourceSignalId: sigD1.id, guestId: maria.id });
  const sigD2 = await createSignal(tenantId, userId, { guestId: maria.id, stayId: mariaStay.id, body: "Determinism check two." });
  const runD2 = await evaluateFirstPartyFeasibility(tenantId, userId, { stayId: mariaStay.id, topics: ["quiet", "nature", "hiking"], triggerSource: "host_noted", sourceSignalId: sigD2.id, guestId: maria.id });
  const pD1 = await db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, runD1.runId), eq(feasibilityProposals.status, "proposed")));
  const pD2 = await db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, runD2.runId), eq(feasibilityProposals.status, "proposed")));
  check("(13) same run + same inputs -> same primary title every time", rankProposals(pD1).ranked[0]?.title === rankProposals(pD2).ranked[0]?.title);

  // ===== (14) concurrent NORMAL confirm of two different siblings → one initial prep =====
  const sigCC = await createSignal(tenantId, userId, { guestId: maria.id, stayId: mariaStay.id, body: "Concurrent confirm scenario." });
  const runCC = await evaluateFirstPartyFeasibility(tenantId, userId, { stayId: mariaStay.id, topics: ["quiet", "nature", "hiking"], triggerSource: "host_noted", sourceSignalId: sigCC.id, guestId: maria.id });
  const ccProps = await db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, runCC.runId), inArray(feasibilityProposals.status, ["proposed", "requires_confirmation"])));
  check("(14) the concurrency run has at least two siblings to race", ccProps.length >= 2);
  // Fire both normal confirms at once on DIFFERENT siblings of the same run.
  const settled = await Promise.allSettled([
    confirmProposal(tenantId, userId, ccProps[0].id),
    confirmProposal(tenantId, userId, ccProps[1].id),
  ]);
  const ccAfter = await db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, runCC.runId)));
  const ccConverted = ccAfter.filter((p) => p.status === "converted_to_host_action").length;
  const ccSuperseded = ccAfter.filter((p) => p.status === "superseded").length;
  check("(14) exactly ONE proposal converted (one initial Preparation per run)", ccConverted === 1);
  check("(14) all other actionable siblings are superseded", ccSuperseded === ccProps.length - 1);
  const ccPrepIds = settled
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<{ preparationId: string }>).value.preparationId);
  check("(14) both concurrent confirms resolve to the SAME single Preparation", ccPrepIds.length === 2 && ccPrepIds[0] === ccPrepIds[1]);
  const ccSuggested = (await listPreparationWorkItems(tenantId, { guestId: maria.id })).filter((i) => i.kind === "suggested" && i.runId === runCC.runId);
  check("(14) no leftover suggested/actionable work from the concurrent run", ccSuggested.length === 0);

  console.log(`\nWave 2 lifecycle verification: ${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Wave 2 lifecycle verification crashed:", e);
  process.exit(1);
});
