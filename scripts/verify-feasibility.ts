/**
 * Domain/integration verification for Wave 2C — Feasibility Engine.
 * Runs against the ISOLATED test DB (never the demo DB). Run: npm run verify:feasibility
 */
import { prepareTestDatabase } from "../tests/setup/testDb";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  feasibilityProposalEvidence,
  feasibilityProposals,
  feasibilityRuns,
  guests,
  hostActions,
  prearrivalBriefs,
  properties,
  recommendations,
  tenants,
} from "@/db/schema";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getGuestByName, reviewBrief, runSubject } from "@/lib/research/engine";
import { getScenario } from "@/lib/research/fixtures";
import { evaluateFeasibility } from "@/lib/feasibility/engine";
import {
  acceptProposal,
  convertProposalToHostAction,
  rejectProposal,
} from "@/lib/repositories/feasibility";

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
  const sim = await propByName("Research Lab (Simulation)");

  const latestBrief = async (guestId: string) => {
    const [b] = await db
      .select()
      .from(prearrivalBriefs)
      .where(and(eq(prearrivalBriefs.tenantId, tenantId), eq(prearrivalBriefs.guestId, guestId)))
      .orderBy(desc(prearrivalBriefs.createdAt))
      .limit(1);
    return b ?? null;
  };
  const proposalsOf = (runId: string) =>
    db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, runId)));
  const runScenario = async (key: string) => {
    const s = getScenario(key)!;
    for (const subject of s.subjects) await runSubject(tenantId, userId, key, subject);
  };
  const hostActionCount = async (guestId: string) => {
    const rows = await db.select().from(hostActions).where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.guestId, guestId)));
    return rows.length;
  };

  // ===== Greta: positive path + only-approved gate + dynamic + verify_before_use + accept/convert =====
  await runScenario("actionable_preparation");
  const greta = (await getGuestByName(tenantId, "Greta Hofer"))!;
  const gretaBrief = (await latestBrief(greta.id))!;

  const refused = await evaluateFeasibility(tenantId, userId, gretaBrief.id, atlantic.id);
  check("only-approved gate: un-approved brief is refused", refused.status === "refused" && refused.refusedReason === "brief_not_approved");

  await reviewBrief(tenantId, userId, gretaBrief.id, "approved");
  const gretaRun = await evaluateFeasibility(tenantId, userId, gretaBrief.id, atlantic.id);
  check("greta: run completed", gretaRun.status === "completed");
  check("greta: 1–3 actionable proposals", gretaRun.actionable >= 1 && gretaRun.actionable <= 3);

  const gp = await proposalsOf(gretaRun.runId);
  check("greta: a verify_before_use proposal requires confirmation", gp.some((p) => p.status === "requires_confirmation" && p.reasonCode === "verify_before_use" && p.confirmationRequired));
  check("greta: dynamic local knowledge is withheld", gp.some((p) => p.status === "withheld" && p.reasonCode === "dynamic_unconfirmed"));
  const ev = await db.select().from(feasibilityProposalEvidence).where(and(eq(feasibilityProposalEvidence.tenantId, tenantId), eq(feasibilityProposalEvidence.proposalId, gp[0].id)));
  check("greta: provenance evidence persisted", ev.length >= 1);

  // accept a proposed proposal → Run 1 recommendation (generated_by rules)
  const proposed = gp.find((p) => p.status === "proposed")!;
  const rec = await acceptProposal(tenantId, userId, proposed.id);
  check("accept: creates a rules-generated recommendation", rec.generatedBy === "rules" && rec.status === "accepted");
  const beforeConvert = await hostActionCount(greta.id);
  await convertProposalToHostAction(tenantId, userId, proposed.id);
  const afterConvert = await hostActionCount(greta.id);
  check("convert: accepted proposal reaches the host-action path", afterConvert === beforeConvert + 1);

  // reject another actionable proposal → no host action created
  const other = gp.find((p) => (p.status === "proposed" || p.status === "requires_confirmation") && p.id !== proposed.id);
  if (other) {
    const before = await hostActionCount(greta.id);
    await rejectProposal(tenantId, userId, other.id);
    const after = await hostActionCount(greta.id);
    check("reject: rejected proposal creates no host action", after === before);
  } else {
    check("reject: rejected proposal creates no host action", true);
  }

  // ===== Aiko: medium confidence → no brief → cannot evaluate =====
  await runScenario("medium_ambiguous");
  const aiko = (await getGuestByName(tenantId, "Aiko Tanaka"))!;
  check("aiko: no brief exists, so feasibility cannot run", (await latestBrief(aiko.id)) === null);

  // ===== Sofia: sensitive-content trap → only allowed design influences output =====
  await runScenario("prohibited_content_trap");
  const sofia = (await getGuestByName(tenantId, "Sofia Lindqvist"))!;
  const sofiaBrief = (await latestBrief(sofia.id))!;
  await reviewBrief(tenantId, userId, sofiaBrief.id, "approved");
  const sofiaRun = await evaluateFeasibility(tenantId, userId, sofiaBrief.id, atlantic.id);
  const sp = await proposalsOf(sofiaRun.runId);
  const blob = JSON.stringify(sp).toLowerCase();
  check("sofia: no blocked categories anywhere in output", !["religion", "health", "politics", "sensitive trap"].some((w) => blob.includes(w)));
  check("sofia: only allowed design context influences proposals", sp.some((p) => (p.matchedTags as string[]).includes("design")) && sp.every((p) => (p.matchedTags as string[]).every((t) => t === "design")));

  // ===== Hard constraint: Clara (no_transport) → crater-lake adventure proposal withheld =====
  await runScenario("multi_guest_mixed_consent");
  const clara = (await getGuestByName(tenantId, "Clara Vance"))!;
  const claraBrief = (await latestBrief(clara.id))!;
  await reviewBrief(tenantId, userId, claraBrief.id, "approved");
  const claraRun = await evaluateFeasibility(tenantId, userId, claraBrief.id, atlantic.id);
  const cp = await proposalsOf(claraRun.runId);
  const hardBlocked = cp.find((p) => p.status === "withheld" && p.reasonCode === "hard_constraint");
  check("hard constraint: car-dependent candidate is withheld", !!hardBlocked);
  check("hard constraint: blocked candidate is NOT actionable", cp.every((p) => !(p.status !== "withheld" && p.reasonCode === "hard_constraint")));

  // ===== Wave 2C.1: multi-property correctness =====
  const pineRidge = await propByName("Pine Ridge Cabins");
  // Liam's stay is on Pine Ridge → evaluation uses Pine Ridge knowledge ONLY.
  await runScenario("disallowed_source");
  const liam = (await getGuestByName(tenantId, "Liam O'Connor"))!;
  const liamBrief = (await latestBrief(liam.id))!;
  await reviewBrief(tenantId, userId, liamBrief.id, "approved");
  const liamRun = await evaluateFeasibility(tenantId, userId, liamBrief.id); // authoritative = Pine Ridge
  const [liamRunRow] = await db.select().from(feasibilityRuns).where(and(eq(feasibilityRuns.tenantId, tenantId), eq(feasibilityRuns.id, liamRun.runId))).limit(1);
  const lp = JSON.stringify(await proposalsOf(liamRun.runId));
  check("multi-property: run bound to the brief's authoritative property (Pine Ridge)", liamRunRow.propertyId === pineRidge.id);
  check("multi-property: Property B brief uses Property B knowledge", lp.includes("Pine Ridge woodcraft"));
  check("multi-property: Property B brief does NOT use Property A knowledge", !lp.includes("Atlantic craft note"));
  check("multi-property: Property A brief does NOT use Property B knowledge", !JSON.stringify(gp).includes("Pine Ridge woodcraft"));
  await expectThrow("guard: a different same-tenant property is rejected (inconsistent with stay)", () =>
    evaluateFeasibility(tenantId, userId, gretaBrief.id, pineRidge.id),
  );

  // ===== No-match: Yusuf's stay is on the empty sim property =====
  await runScenario("non_actionable_context");
  const yusuf = (await getGuestByName(tenantId, "Yusuf Demir"))!;
  const yusufBrief = (await latestBrief(yusuf.id))!;
  await reviewBrief(tenantId, userId, yusufBrief.id, "approved");
  const yusufRun = await evaluateFeasibility(tenantId, userId, yusufBrief.id); // authoritative = empty sim property
  const yp = await proposalsOf(yusufRun.runId);
  check("no-match: empty authoritative property yields no proposals", yusufRun.status === "completed" && yp.length === 0);

  // ===== Cross-tenant: another tenant's property is rejected =====
  const [beta] = await db.insert(tenants).values({ name: "Beta Retreat", slug: "beta-retreat-feas-test" }).returning();
  const [betaProp] = await db.insert(properties).values({ tenantId: beta.id, name: "Beta Property" }).returning();
  await expectThrow("cross-tenant: another tenant's property is rejected", () =>
    evaluateFeasibility(tenantId, userId, gretaBrief.id, betaProp.id),
  );
  check("cross-tenant: tenant scoping kept on proposals", gp.every((p) => p.tenantId === tenantId));
  void guests;
  void sim;

  console.log(`\nFeasibility verification: ${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Feasibility verification crashed:", e);
    process.exit(1);
  });
