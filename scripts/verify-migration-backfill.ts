/**
 * Migration provenance-backfill regression (ISOLATED test DB).
 * Run: npm run verify:migration-backfill
 *
 * The truncate-and-reseed harness migrates an EMPTY database, so the 0005 provenance
 * backfill is never otherwise exercised. This test runs the EXACT backfill UPDATE
 * statements shipped in db/migrations (the ones that touch `externally_researched`)
 * against representative legacy-style rows, then asserts:
 *   - research run + research-derived recommendation become externally_researched=true
 *   - first-party run + manual recommendation stay externally_researched=false
 */
import { readdirSync, readFileSync } from "node:fs";
import { prepareTestDatabase } from "../tests/setup/testDb";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  feasibilityProposals,
  feasibilityRuns,
  guests,
  prearrivalBriefs,
  properties,
  recommendations,
  stays,
} from "@/db/schema";
import { getAuthContext } from "@/lib/auth/devAuth";
import {
  createInsightFromSignal,
  createRecommendationFromInsight,
  createSignal,
} from "@/lib/repositories/slice";
import { confirmProposal } from "@/lib/repositories/feasibility";
import { evaluateFeasibility, evaluateFirstPartyFeasibility } from "@/lib/feasibility/engine";
import { getGuestByName, reviewBrief, runSubject } from "@/lib/research/engine";
import { getScenario } from "@/lib/research/fixtures";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? (pass += 1) : (fail += 1);
}

/** The actual provenance-backfill statements shipped in the migrations. */
function backfillStatements(): string[] {
  const dir = "db/migrations";
  const out: string[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
    const content = readFileSync(`${dir}/${f}`, "utf8");
    for (const raw of content.split("--> statement-breakpoint")) {
      // Drop whole-line SQL comments so a statement preceded by `-- …` notes is still
      // recognised, then keep only the UPDATE statements that touch externally_researched.
      const t = raw
        .split("\n")
        .filter((ln) => !/^\s*--/.test(ln))
        .join("\n")
        .trim()
        .replace(/;\s*$/, "");
      if (/^UPDATE\b/i.test(t) && /externally_researched/i.test(t)) out.push(t);
    }
  }
  return out;
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

  // (A) research run + research-derived recommendation (brief path)
  const s = getScenario("actionable_preparation")!;
  for (const subj of s.subjects) await runSubject(tenantId, userId, "actionable_preparation", subj);
  const greta = (await getGuestByName(tenantId, "Greta Hofer"))!;
  const [gBrief] = await db.select().from(prearrivalBriefs).where(and(eq(prearrivalBriefs.tenantId, tenantId), eq(prearrivalBriefs.guestId, greta.id))).limit(1);
  await reviewBrief(tenantId, userId, gBrief.id, "approved");
  const gRun = await evaluateFeasibility(tenantId, userId, gBrief.id, atlantic.id);
  const [gProp] = await db.select().from(feasibilityProposals).where(and(eq(feasibilityProposals.tenantId, tenantId), eq(feasibilityProposals.runId, gRun.runId), eq(feasibilityProposals.status, "proposed"))).limit(1);
  const gConf = await confirmProposal(tenantId, userId, gProp.id);

  // (B) manual recommendation (first-party, no proposal link)
  const [maria] = await db.select().from(guests).where(and(eq(guests.tenantId, tenantId), eq(guests.fullName, "Maria & Tom"))).limit(1);
  const mSig = await createSignal(tenantId, userId, { guestId: maria.id, body: "manual note" });
  const mIns = await createInsightFromSignal(tenantId, userId, mSig.id, { summary: "manual insight" });
  const mRec = await createRecommendationFromInsight(tenantId, userId, mIns.id, { title: "manual rec" });

  // (C) first-party feasibility run (brief_id null)
  const [mStay] = await db.select().from(stays).where(and(eq(stays.tenantId, tenantId), eq(stays.guestId, maria.id))).limit(1);
  const fpSig = await createSignal(tenantId, userId, { guestId: maria.id, stayId: mStay.id, body: "design" });
  const fpRun = await evaluateFirstPartyFeasibility(tenantId, userId, { stayId: mStay.id, topics: ["design"], triggerSource: "guest_stated", sourceSignalId: fpSig.id, guestId: maria.id });

  // Simulate the pre-backfill legacy state: every provenance flag false.
  await db.update(feasibilityRuns).set({ externallyResearched: false });
  await db.update(recommendations).set({ externallyResearched: false });

  // Apply the EXACT migration backfill statements.
  const stmts = backfillStatements();
  check("found the migration provenance-backfill statements", stmts.length >= 2);
  for (const stmt of stmts) await db.execute(sql.raw(stmt));

  const runById = async (id: string) => (await db.select().from(feasibilityRuns).where(eq(feasibilityRuns.id, id)))[0];
  const recById = async (id: string) => (await db.select().from(recommendations).where(eq(recommendations.id, id)))[0];

  check("legacy research run (brief_id set) → externally_researched = true", (await runById(gRun.runId)).externallyResearched === true);
  check("first-party run (brief_id null) stays externally_researched = false", (await runById(fpRun.runId)).externallyResearched === false);
  check("legacy research-derived rec (via proposal) → externally_researched = true", (await recById(gConf.recommendationId!)).externallyResearched === true);
  check("manual rec (no proposal link) stays externally_researched = false", (await recById(mRec.id)).externallyResearched === false);

  console.log(`\nMigration-backfill verification: ${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration-backfill verification crashed:", e);
    process.exit(1);
  });
