/**
 * Domain/integration verification for Wave 2D — Outcome → Property Learning Loop.
 * Runs against the ISOLATED test DB (never the demo DB). Run: npm run verify:learning-loop
 *
 * Covers the Wave 2D property-scope correctness fix: property is resolved ONLY
 * from an authoritative, causally-linked source (feasibility proposal, or the
 * stay linked through the recommendation / feasibility run). The unsafe
 * "guest's most recent stay" fallback is gone — an outcome with no causal
 * property is refused and creates no draft.
 *
 * Proves: feasibility-derived resolution, manual resolution via an explicit
 * linked stay, the repeat-guest leak is closed (older linked stay wins; an
 * unlinked outcome is refused, never attached to a newer unrelated stay),
 * refusal-without-property, promotion, discard, no-learning, cross-tenant
 * isolation, no sensitive content, and Wave 2C intact.
 */
import { prepareTestDatabase } from "../tests/setup/testDb";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  feasibilityProposals,
  guests,
  hostActions,
  outcomes,
  prearrivalBriefs,
  preparationPlaybookActions,
  properties,
  propertyCapabilities,
  propertyConstraints,
  propertyLearningDrafts,
  recommendations,
  stays,
  tenants,
} from "@/db/schema";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getGuestByName, reviewBrief, runSubject } from "@/lib/research/engine";
import { getScenario } from "@/lib/research/fixtures";
import { evaluateFeasibility } from "@/lib/feasibility/engine";
import { acceptProposal, convertProposalToHostAction } from "@/lib/repositories/feasibility";
import {
  createHostAction,
  createInsightFromSignal,
  createRecommendationFromInsight,
  createSignal,
  logOutcome,
  setRecommendationStatus,
} from "@/lib/repositories/slice";
import {
  captureLearning,
  discardLearningDraft,
  listLearningDrafts,
  promoteLearningDraft,
} from "@/lib/repositories/learning";

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

  const propByName = async (name: string) => {
    const [p] = await db
      .select()
      .from(properties)
      .where(and(eq(properties.tenantId, tenantId), eq(properties.name, name)))
      .limit(1);
    return p;
  };
  const atlantic = await propByName("Atlantic Hideaway");
  const pineRidge = await propByName("Pine Ridge Cabins");

  const latestBrief = async (guestId: string) => {
    const [b] = await db
      .select()
      .from(prearrivalBriefs)
      .where(and(eq(prearrivalBriefs.tenantId, tenantId), eq(prearrivalBriefs.guestId, guestId)))
      .orderBy(desc(prearrivalBriefs.createdAt))
      .limit(1);
    return b ?? null;
  };
  const runScenario = async (key: string) => {
    const s = getScenario(key)!;
    for (const subject of s.subjects) await runSubject(tenantId, userId, key, subject);
  };
  const makeGuest = async (fullName: string) => {
    const [g] = await db.insert(guests).values({ tenantId, fullName }).returning();
    return g;
  };
  const makeStay = async (guestId: string, propertyId: string, startDate: string, endDate: string) => {
    const [s] = await db.insert(stays).values({ tenantId, guestId, propertyId, startDate, endDate }).returning();
    return s;
  };
  // Build a manual-chain outcome. linkedStayId !== null causally links the
  // recommendation to a stay (authoritative); null leaves it unlinked.
  const makeOutcome = async (
    guestId: string,
    linkedStayId: string | null,
    result: "positive" | "neutral" | "negative" | "unknown",
    notes: string,
  ) => {
    const sig = await createSignal(tenantId, userId, { guestId, body: "probe signal" });
    const ins = await createInsightFromSignal(tenantId, userId, sig.id, { summary: "probe insight" });
    const rec = await createRecommendationFromInsight(tenantId, userId, ins.id, { title: "probe rec" });
    if (linkedStayId) {
      await db
        .update(recommendations)
        .set({ stayId: linkedStayId })
        .where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.id, rec.id)));
    }
    await setRecommendationStatus(tenantId, userId, rec.id, "accepted");
    const ha = await createHostAction(tenantId, userId, rec.id, { title: "probe action" });
    return logOutcome(tenantId, userId, ha.id, { result, notes });
  };
  const draftsForOutcome = async (outcomeId: string) =>
    db
      .select()
      .from(propertyLearningDrafts)
      .where(and(eq(propertyLearningDrafts.tenantId, tenantId), eq(propertyLearningDrafts.outcomeId, outcomeId)));

  // ===== (1) Feasibility-derived: proposal property is authoritative =====
  await runScenario("actionable_preparation");
  const greta = (await getGuestByName(tenantId, "Greta Hofer"))!;
  const gretaBrief = (await latestBrief(greta.id))!;
  await reviewBrief(tenantId, userId, gretaBrief.id, "approved");
  const gretaRun = await evaluateFeasibility(tenantId, userId, gretaBrief.id, atlantic.id);
  check("wave 2C intact: Greta run completes with 1–3 actionable proposals", gretaRun.status === "completed" && gretaRun.actionable >= 1 && gretaRun.actionable <= 3);

  const gretaProposals = await db
    .select()
    .from(feasibilityProposals)
    .where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, gretaRun.runId)));
  const proposed = gretaProposals.find((p) => p.status === "proposed")!;
  const rec = await acceptProposal(tenantId, userId, proposed.id);
  await convertProposalToHostAction(tenantId, userId, proposed.id);
  const [gretaAction] = await db
    .select()
    .from(hostActions)
    .where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.recommendationId, rec.id)))
    .limit(1);
  const gretaOutcome = await logOutcome(tenantId, userId, gretaAction.id, { result: "positive", notes: "guest delighted" });

  const gretaDraft = await captureLearning(tenantId, userId, gretaOutcome.id, {
    learningType: "capability",
    note: "Early breakfast works well when arranged the evening before.",
    tags: ["food"],
  });
  check("(1) feasibility-derived outcome resolves to the proposal property (Atlantic)", gretaDraft.propertyId === atlantic.id);
  check("traceability: draft → outcome / host action / recommendation / proposal", gretaDraft.outcomeId === gretaOutcome.id && gretaDraft.hostActionId === gretaAction.id && gretaDraft.recommendationId === rec.id && gretaDraft.feasibilityProposalId === proposed.id);
  check("traceability: draft → guest + brief", gretaDraft.guestId === greta.id && gretaDraft.briefId === gretaBrief.id);

  const atlanticDrafts = await listLearningDrafts(tenantId, atlantic.id);
  const pineDrafts = await listLearningDrafts(tenantId, pineRidge.id);
  check("isolation: draft appears under its own property (Atlantic)", atlanticDrafts.some((d) => d.id === gretaDraft.id));
  check("isolation: draft does NOT appear under another property (Pine Ridge)", !pineDrafts.some((d) => d.id === gretaDraft.id));

  const capsBefore = (await db.select().from(propertyCapabilities).where(and(eq(propertyCapabilities.tenantId, tenantId), eq(propertyCapabilities.propertyId, atlantic.id)))).length;
  const promoted = await promoteLearningDraft(tenantId, userId, gretaDraft.id, {});
  const [newCap] = await db.select().from(propertyCapabilities).where(and(eq(propertyCapabilities.tenantId, tenantId), eq(propertyCapabilities.id, promoted.itemId))).limit(1);
  check("promote: capability created on the SAME property (Atlantic), carrying the note", !!newCap && newCap.propertyId === atlantic.id && newCap.description === "Early breakfast works well when arranged the evening before.");
  const capsAfter = (await db.select().from(propertyCapabilities).where(and(eq(propertyCapabilities.tenantId, tenantId), eq(propertyCapabilities.propertyId, atlantic.id)))).length;
  check("promote: exactly one new capability (no overwrite/auto-merge)", capsAfter === capsBefore + 1);
  check("promote: a promoted draft leaves the open-drafts queue", !(await listLearningDrafts(tenantId, atlantic.id)).some((d) => d.id === gretaDraft.id));
  await expectThrow("promote: a promoted draft cannot be re-promoted", () => promoteLearningDraft(tenantId, userId, gretaDraft.id, {}));

  // ===== (2)+(3) Repeat guest: older LINKED stay wins; unlinked is refused =====
  // Repeat visitor with an OLD Atlantic stay and a NEWER Pine Ridge stay. The
  // removed fallback would have used the most-recent (Pine Ridge) stay.
  const repeat = await makeGuest("Repeat Visitor");
  const stayOld = await makeStay(repeat.id, atlantic.id, "2026-01-10", "2026-01-15");
  await makeStay(repeat.id, pineRidge.id, "2026-09-10", "2026-09-15"); // newer, UNRELATED

  const linkedOutcome = await makeOutcome(repeat.id, stayOld.id, "positive", "from the January Atlantic stay");
  const linkedDraft = await captureLearning(tenantId, userId, linkedOutcome.id, {
    learningType: "local_insight",
    note: "A manual learning tied to the older Atlantic stay.",
  });
  check("(2) manual outcome with an authoritative linked stay resolves correctly (Atlantic)", linkedDraft.propertyId === atlantic.id);
  check("(2) manual draft carries the causal stay and no proposal link", linkedDraft.stayId === stayOld.id && linkedDraft.feasibilityProposalId === null);
  check("(3) older LINKED stay wins — NOT the guest's newer Pine Ridge stay", linkedDraft.propertyId !== pineRidge.id);

  const unlinkedOutcome = await makeOutcome(repeat.id, null, "neutral", "no causal stay link");
  await expectThrow("(3) an unlinked outcome is REFUSED (never attached to the newer stay)", () =>
    captureLearning(tenantId, userId, unlinkedOutcome.id, { learningType: "local_insight", note: "must be refused" }),
  );
  check("(3) refused unlinked outcome created no draft", (await draftsForOutcome(unlinkedOutcome.id)).length === 0);
  check("(3) no Pine Ridge draft leaked for the repeat guest", !(await listLearningDrafts(tenantId, pineRidge.id)).some((d) => d.guestId === repeat.id));

  // ===== (4) No authoritative property at all → refused, no draft =====
  const noStayGuest = await makeGuest("No-Stay Guest");
  const orphanOutcome = await makeOutcome(noStayGuest.id, null, "unknown", "guest has no stays");
  await expectThrow("(4) outcome with no authoritative property is refused", () =>
    captureLearning(tenantId, userId, orphanOutcome.id, { learningType: "capability", note: "must be refused" }),
  );
  check("(4) refused capture created no draft", (await draftsForOutcome(orphanOutcome.id)).length === 0);

  // ===== Constraint promote + feasibility readability (via an authoritative stay) =====
  await runScenario("multi_guest_mixed_consent");
  const clara = (await getGuestByName(tenantId, "Clara Vance"))!;
  const claraStay = await makeStay(clara.id, atlantic.id, "2026-02-01", "2026-02-05");
  const claraOutcome = await makeOutcome(clara.id, claraStay.id, "negative", "transfer was unavailable");
  const claraDraft = await captureLearning(tenantId, userId, claraOutcome.id, {
    learningType: "constraint",
    note: "Do not suggest car-dependent outings unless transfer is confirmed.",
    tags: ["adventure"],
  });
  check("constraint capture resolves to the linked stay's property (Atlantic)", claraDraft.propertyId === atlantic.id);
  const promotedConstraint = await promoteLearningDraft(tenantId, userId, claraDraft.id, { severity: "hard" });
  const [newRule] = await db.select().from(propertyConstraints).where(and(eq(propertyConstraints.tenantId, tenantId), eq(propertyConstraints.id, promotedConstraint.itemId))).limit(1);
  check("promote: a hard constraint is created on Atlantic", !!newRule && newRule.propertyId === atlantic.id && newRule.severity === "hard");
  const activeRules = await db.select().from(propertyConstraints).where(and(eq(propertyConstraints.tenantId, tenantId), eq(propertyConstraints.propertyId, atlantic.id), eq(propertyConstraints.active, true)));
  check("readable: promoted constraint is now ACTIVE property knowledge", activeRules.some((r) => r.id === promotedConstraint.itemId));

  // ===== No-learning path: a capturable outcome with no capture creates no draft =====
  const noLearnOutcome = await makeOutcome(repeat.id, stayOld.id, "neutral", "nothing notable");
  check("no-learning: skipping capture creates no draft", (await draftsForOutcome(noLearnOutcome.id)).length === 0);

  // ===== Discard: a discarded draft never becomes Property Intelligence =====
  const discardOutcome = await makeOutcome(repeat.id, stayOld.id, "neutral", "minor note");
  const discardDraft = await captureLearning(tenantId, userId, discardOutcome.id, { learningType: "playbook", note: "Throwaway note." });
  const playbookBefore = (await db.select().from(preparationPlaybookActions).where(and(eq(preparationPlaybookActions.tenantId, tenantId), eq(preparationPlaybookActions.propertyId, atlantic.id)))).length;
  const discarded = await discardLearningDraft(tenantId, userId, discardDraft.id);
  check("discard: status becomes 'discarded' with no promoted item", discarded.status === "discarded" && !discarded.promotedItemId);
  const playbookAfter = (await db.select().from(preparationPlaybookActions).where(and(eq(preparationPlaybookActions.tenantId, tenantId), eq(preparationPlaybookActions.propertyId, atlantic.id)))).length;
  check("discard: no playbook action is created", playbookAfter === playbookBefore);
  await expectThrow("discard: a discarded draft cannot be promoted", () => promoteLearningDraft(tenantId, userId, discardDraft.id, {}));

  // ===== (5) Cross-tenant: another tenant cannot read / promote / discard a draft =====
  const [beta] = await db.insert(tenants).values({ name: "Beta Retreat", slug: "beta-retreat-learning-test" }).returning();
  const xOutcome = await makeOutcome(repeat.id, stayOld.id, "positive", "cross-tenant probe");
  const xDraft = await captureLearning(tenantId, userId, xOutcome.id, { learningType: "capability", note: "Tenant-private learning." });
  check("(5) cross-tenant: another tenant cannot read the draft", (await listLearningDrafts(beta.id, atlantic.id)).length === 0);
  await expectThrow("(5) cross-tenant: another tenant cannot promote the draft", () => promoteLearningDraft(beta.id, userId, xDraft.id, {}));
  await expectThrow("(5) cross-tenant: another tenant cannot discard the draft", () => discardLearningDraft(beta.id, userId, xDraft.id));

  // ===== Sensitive content never enters a draft (host freetext only) =====
  await runScenario("prohibited_content_trap");
  const allDrafts = await db.select().from(propertyLearningDrafts).where(eq(propertyLearningDrafts.tenantId, tenantId));
  const blob = JSON.stringify(allDrafts).toLowerCase();
  check("safety: no blocked/sensitive category text in any draft", !["religion", "health", "politics", "sensitive trap"].some((w) => blob.includes(w)));

  // ===== Wave 2C still intact after all learning writes =====
  const sofia = (await getGuestByName(tenantId, "Sofia Lindqvist"))!;
  const sofiaBrief = (await latestBrief(sofia.id))!;
  await reviewBrief(tenantId, userId, sofiaBrief.id, "approved");
  const sofiaRun = await evaluateFeasibility(tenantId, userId, sofiaBrief.id, atlantic.id);
  check("wave 2C intact: a fresh feasibility run still completes after learning writes", sofiaRun.status === "completed");
  void outcomes;

  console.log(`\nLearning-loop verification: ${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Learning-loop verification crashed:", e);
    process.exit(1);
  });
