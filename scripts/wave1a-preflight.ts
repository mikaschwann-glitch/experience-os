/**
 * Wave 1A — READ-ONLY live-data preflight (no mutations, no migrations, no seed).
 * Run: tsx scripts/wave1a-preflight.ts
 *
 * Phase 0: classify the DB (existing / empty / inconsistent), inspect the applied
 * migration ledger, then — ONLY if the schema is present — report the data
 * conditions that gate the Wave 1A migration:
 *   - duplicate host_actions per recommendation (survivorship/quarantine input)
 *   - stay-less host_actions (no causal stay via recommendation.stay_id)
 *   - stay-less host_actions that already carry an outcome (must be quarantined)
 *   - tenant / guest mismatch across host_action -> recommendation -> stay
 *   - currently-active learning-derived PI records (matcher-eligible)
 *
 * Reads DATABASE_URL from .env.local; never writes.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // fall back to ambient env
}

import { sql } from "drizzle-orm";
import { getDb, closeDb } from "@/db/client";

type Row = Record<string, unknown>;

async function rows(q: string): Promise<Row[]> {
  const db = getDb();
  const res = await db.execute(sql.raw(q));
  return Array.isArray(res) ? (res as Row[]) : ((res as { rows?: Row[] }).rows ?? []);
}
async function scalar(q: string): Promise<number> {
  const r = await rows(q);
  const v = r[0] ? Object.values(r[0])[0] : 0;
  return Number(v ?? 0);
}
async function tryScalar(q: string): Promise<number | null> {
  try {
    return await scalar(q);
  } catch {
    return null;
  }
}

const EXPECTED_TABLES = [
  "tenants", "users", "properties", "units", "guests", "stays", "signals", "insights",
  "recommendations", "recommendation_insights", "host_actions", "outcomes", "events",
  "prearrival_briefs", "evidence_items", "property_capabilities", "local_insights",
  "property_constraints", "preparation_playbook_actions", "feasibility_runs",
  "feasibility_proposals", "feasibility_proposal_evidence", "property_learning_drafts",
];

async function main() {
  console.log("=== Wave 1A live-data preflight (READ-ONLY) ===\n");

  // ---- (A) connectivity ----
  const ping = await tryScalar(`SELECT 1`);
  if (ping === null) {
    console.log("DB STATE: UNREACHABLE (connection failed)");
    return;
  }
  const dbName = (await rows(`SELECT current_database() AS d`))[0]?.d;
  console.log(`Connected to database: ${dbName}\n`);

  // ---- (B) applied migration ledger (drizzle.__drizzle_migrations) ----
  let ledgerCount: number | null = await tryScalar(
    `SELECT count(*) FROM drizzle.__drizzle_migrations`,
  );
  if (ledgerCount === null) {
    // some setups put it in public
    ledgerCount = await tryScalar(`SELECT count(*) FROM __drizzle_migrations`);
  }
  if (ledgerCount === null) {
    console.log("Migration ledger: NONE (drizzle.__drizzle_migrations does not exist)");
  } else {
    console.log(`Migration ledger: ${ledgerCount} migration(s) applied`);
    const led = await tryScalar(
      `SELECT max(created_at) FROM drizzle.__drizzle_migrations`,
    );
    if (led !== null && led > 0) {
      const when = new Date(Number(led)).toISOString();
      console.log(`  latest applied at: ${when} (epoch ${led})`);
    }
  }

  // ---- (C) which expected tables exist ----
  const present = (
    await rows(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    )
  ).map((r) => String(r.table_name));
  const presentSet = new Set(present);
  const missing = EXPECTED_TABLES.filter((t) => !presentSet.has(t));
  const found = EXPECTED_TABLES.filter((t) => presentSet.has(t));
  console.log(`\nExpected tables present: ${found.length}/${EXPECTED_TABLES.length}`);
  if (missing.length) console.log(`  MISSING: ${missing.join(", ")}`);

  // ---- (D) classify state ----
  let state: "EMPTY" | "EXISTING" | "INCONSISTENT";
  if (found.length === 0) state = "EMPTY";
  else if (missing.length === 0) state = "EXISTING";
  else state = "INCONSISTENT";
  console.log(`\nDB STATE: ${state}`);

  if (state !== "EXISTING") {
    console.log(
      "\nSchema is not fully present — STOPPING before data-condition queries.\n" +
        "(No migrations or seed were run. Report this state to decide next steps.)",
    );
    return;
  }

  // Row volume snapshot
  const totalHa = await scalar(`SELECT count(*) FROM host_actions`);
  const totalRec = await scalar(`SELECT count(*) FROM recommendations`);
  const totalStays = await scalar(`SELECT count(*) FROM stays`);
  const totalOutcomes = await scalar(`SELECT count(*) FROM outcomes`);
  const totalProposals = await scalar(`SELECT count(*) FROM feasibility_proposals`);
  console.log(
    `\nRow volume: host_actions=${totalHa}  recommendations=${totalRec}  stays=${totalStays}  outcomes=${totalOutcomes}  feasibility_proposals=${totalProposals}`,
  );
  if (totalHa === 0 && totalRec === 0) {
    console.log("\nSchema present but NO operational rows — database is migrated but UNSEEDED.");
    console.log("(No data-integrity remediation needed yet; report and await go-ahead.)");
    return;
  }

  console.log("\n--- Data conditions ---");

  // 1) duplicate host_actions per recommendation
  const dups = await rows(`
    SELECT tenant_id, recommendation_id, count(*) AS n
    FROM host_actions
    WHERE recommendation_id IS NOT NULL
    GROUP BY tenant_id, recommendation_id
    HAVING count(*) > 1
    ORDER BY n DESC`);
  console.log(`\n1) Duplicate host_actions per recommendation: ${dups.length}`);
  for (const d of dups) console.log(`     rec=${d.recommendation_id} n=${d.n}`);

  // 2) host_actions with NULL recommendation_id
  const noRec = await scalar(`SELECT count(*) FROM host_actions WHERE recommendation_id IS NULL`);
  console.log(`\n2) host_actions with NULL recommendation_id: ${noRec}`);

  // 3) stay-less host_actions
  const stayless = await rows(`
    SELECT ha.id, ha.status, ha.recommendation_id, r.stay_id
    FROM host_actions ha
    LEFT JOIN recommendations r ON r.id = ha.recommendation_id
    WHERE ha.recommendation_id IS NULL OR r.stay_id IS NULL
    ORDER BY ha.created_at`);
  console.log(`\n3) stay-less host_actions (no causal stay via recommendation.stay_id): ${stayless.length}`);
  for (const s of stayless) console.log(`     ha=${s.id} status=${s.status} rec=${s.recommendation_id} rec.stay_id=${s.stay_id}`);

  // 4) stay-less host_actions WITH an outcome
  const staylessWithOutcome = await rows(`
    SELECT DISTINCT ha.id, ha.status
    FROM host_actions ha
    LEFT JOIN recommendations r ON r.id = ha.recommendation_id
    JOIN outcomes o ON o.host_action_id = ha.id
    WHERE ha.recommendation_id IS NULL OR r.stay_id IS NULL`);
  console.log(`\n4) stay-less host_actions WITH an outcome (quarantine, never auto-archive): ${staylessWithOutcome.length}`);
  for (const s of staylessWithOutcome) console.log(`     ha=${s.id} status=${s.status}`);

  // 5) guest mismatch
  const guestMismatch = await scalar(`
    SELECT count(*) FROM host_actions ha
    JOIN recommendations r ON r.id = ha.recommendation_id
    JOIN stays s ON s.id = r.stay_id
    WHERE ha.guest_id <> s.guest_id`);
  console.log(`\n5) guest mismatch (host_action vs stay): ${guestMismatch}`);

  // 6) tenant mismatch
  const tenantMismatch = await scalar(`
    SELECT count(*) FROM host_actions ha
    JOIN recommendations r ON r.id = ha.recommendation_id
    JOIN stays s ON s.id = r.stay_id
    WHERE ha.tenant_id <> r.tenant_id OR r.tenant_id <> s.tenant_id`);
  console.log(`6) tenant mismatch across host_action/recommendation/stay: ${tenantMismatch}`);

  // 7) cleanly backfillable
  const backfillable = await scalar(`
    SELECT count(*) FROM host_actions ha
    JOIN recommendations r ON r.id = ha.recommendation_id
    JOIN stays s ON s.id = r.stay_id
    WHERE ha.tenant_id = r.tenant_id AND r.tenant_id = s.tenant_id AND ha.guest_id = s.guest_id`);
  console.log(`\n7) cleanly backfillable host_actions (stay_id <- recommendation.stay_id): ${backfillable}`);

  // 8) promoted learning drafts
  const promoted = await rows(`
    SELECT promoted_item_type, count(*) AS n
    FROM property_learning_drafts
    WHERE status = 'promoted'
    GROUP BY promoted_item_type`);
  console.log(`\n8) promoted learning drafts (forward links into PI tables):`);
  if (promoted.length === 0) console.log(`     (none)`);
  for (const p of promoted) console.log(`     type=${p.promoted_item_type} n=${p.n}`);

  // 8b) currently active / matcher-eligible learning-derived records
  const activeLearned = await rows(`
    SELECT 'local_insight' AS kind, count(*) AS n
      FROM property_learning_drafts d JOIN local_insights li ON li.id = d.promoted_item_id
      WHERE d.status='promoted' AND d.promoted_item_type='local_insight' AND li.status='active'
    UNION ALL
    SELECT 'capability', count(*)
      FROM property_learning_drafts d JOIN property_capabilities c ON c.id = d.promoted_item_id
      WHERE d.status='promoted' AND d.promoted_item_type='capability' AND c.status='active'
    UNION ALL
    SELECT 'playbook', count(*)
      FROM property_learning_drafts d JOIN preparation_playbook_actions pb ON pb.id = d.promoted_item_id
      WHERE d.status='promoted' AND d.promoted_item_type='playbook' AND pb.status='active'
    UNION ALL
    SELECT 'constraint', count(*)
      FROM property_learning_drafts d JOIN property_constraints pc ON pc.id = d.promoted_item_id
      WHERE d.status='promoted' AND d.promoted_item_type='constraint' AND pc.active = true`);
  console.log(`\n8b) currently ACTIVE / matcher-eligible learning-derived records:`);
  for (const a of activeLearned) console.log(`     ${a.kind}: ${a.n}`);

  console.log("\n=== end preflight ===");
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("preflight crashed:", e);
    await closeDb();
    process.exit(1);
  });
