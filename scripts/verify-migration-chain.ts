/**
 * Wave 2 completion — migration-chain integrity + clean-database reproducibility.
 * Run: npm run verify:migration-chain
 *
 * Two guarantees:
 *  1. The tracked chain is internally consistent — every .sql file is journalled, the
 *     journal indexes are contiguous and ordered, and nothing is applied-without-tracked.
 *  2. A BRAND-NEW database can apply the COMPLETE sequence from scratch and then seed.
 *     This is the real proof that a fresh clone reproduces the schema deterministically.
 *
 * Creates and DROPS a throwaway database (experience_os_migcheck); never touches the
 * dev or test databases.
 */
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const BASE =
  process.env.MIGCHECK_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/experience_os_migcheck";

function adminUrl(url: string): string {
  const u = new URL(url);
  u.pathname = "/postgres";
  return u.toString();
}
function dbName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? (pass += 1) : (fail += 1);
}

async function main() {
  // ---- 1) File ↔ journal integrity (no DB needed) ----
  const files = readdirSync("db/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""))
    .sort();
  const journal = JSON.parse(readFileSync("db/migrations/meta/_journal.json", "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);

  check("(1) journal entry count == migration file count", entries.length === files.length);
  check("(1) journal indexes are contiguous from 0", entries.every((e, i) => e.idx === i));
  check("(1) every journal tag has a matching .sql file (in order)", entries.every((e, i) => e.tag === files[i]));
  // Hard-stop guard: 0007 must exist as a tracked file, not applied-only.
  check("(1) migration 0007 is present AND tracked", files.includes("0007_nervous_puff_adder") && entries.some((e) => e.tag === "0007_nervous_puff_adder"));

  // ---- 2) Clean-database reproducibility ----
  const admin = postgres(adminUrl(BASE), { max: 1 });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName(BASE)}"`);
    await admin.unsafe(`CREATE DATABASE "${dbName(BASE)}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  let ok = false;
  const sql = postgres(BASE, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "db/migrations" });
    const seed = spawnSync("npx tsx scripts/seed.ts", {
      shell: true,
      stdio: "ignore",
      env: { ...process.env, DATABASE_URL: BASE },
    });
    check("(2) clean DB seeds successfully", seed.status === 0);

    const [m] = await sql<{ n: number }[]>`select count(*)::int n from drizzle.__drizzle_migrations`;
    check("(2) applied-migration count == tracked file count", m.n === files.length);
    const [en] = await sql<{ n: number }[]>`
      select count(*)::int n from pg_enum e join pg_type ty on ty.oid = e.enumtypid
      where ty.typname = 'feasibility_proposal_status' and e.enumlabel = 'superseded'`;
    check("(2) latest schema object present ('superseded' enum value)", en.n === 1);
    const [pe] = await sql<{ n: number }[]>`
      select count(*)::int n from information_schema.tables where table_name = 'preparation_executions'`;
    check("(2) Wave 2 table present (preparation_executions)", pe.n === 1);
    const [g] = await sql<{ n: number }[]>`select count(*)::int n from properties where name = 'Atlantic Hideaway'`;
    check("(2) seed fixture present on the fresh DB", g.n >= 1);
    ok = pass > 0;
  } finally {
    await sql.end({ timeout: 5 });
    const admin2 = postgres(adminUrl(BASE), { max: 1 });
    try {
      await admin2.unsafe(`DROP DATABASE IF EXISTS "${dbName(BASE)}"`);
    } finally {
      await admin2.end({ timeout: 5 });
    }
  }
  void ok;

  console.log(`\nMigration-chain verification: ${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Migration-chain verification crashed:", e);
  process.exit(1);
});
