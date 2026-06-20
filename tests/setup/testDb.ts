/**
 * Test-database isolation for the acceptance + integration harness.
 *
 * Guarantees:
 *  - Uses a SEPARATE database (TEST_DATABASE_URL), never the demo DB.
 *  - Refuses to run unless the URL clearly targets a test DB (safety guard).
 *  - Each prepare() yields a known clean state (migrate + truncate + seed),
 *    so tests are repeatable and order-independent without manual db:seed.
 *
 * Importing this module routes all getDb()-based code in THIS process at the
 * test DB (sets process.env.DATABASE_URL before anything calls getDb()).
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

function resolveTestUrl(): string {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    try {
      const txt = readFileSync(".env.test", "utf8");
      const m = txt.match(/^TEST_DATABASE_URL=(.+)$/m);
      if (m) url = m[1].trim();
    } catch {
      /* fall through to default */
    }
  }
  url = url ?? "postgres://postgres:postgres@localhost:5432/experience_os_test";
  // Safety: never let the harness point at a non-test database.
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`Refusing to use a non-test database for tests: ${url}`);
  }
  return url;
}

export const TEST_DATABASE_URL = resolveTestUrl();

// Route getDb() (used by seed + repositories) at the test DB for this process.
process.env.DATABASE_URL = TEST_DATABASE_URL;

function dbName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}
function adminUrl(url: string): string {
  const u = new URL(url);
  u.pathname = "/postgres";
  return u.toString();
}

/** Create the test database if it does not exist (idempotent). */
export async function ensureTestDatabase(): Promise<void> {
  const admin = postgres(adminUrl(TEST_DATABASE_URL), { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${dbName(TEST_DATABASE_URL)}"`);
  } catch (e) {
    if (!/already exists/i.test((e as Error).message ?? "")) throw e;
  } finally {
    await admin.end({ timeout: 5 });
  }
}

/** Migrate (idempotent), truncate all public tables, then seed a clean fixture. */
export async function resetAndSeedTestDatabase(): Promise<void> {
  const sql = postgres(TEST_DATABASE_URL, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "db/migrations" });
    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'
    `;
    if (tables.length > 0) {
      const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
      await sql.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  // Seed via the CLI in a subprocess so tsx resolves the @/ path aliases of the
  // app graph. The explicit DATABASE_URL keeps it on the test DB (the CLI skips
  // .env.local whenever DATABASE_URL is already set).
  const res = spawnSync("npx tsx scripts/seed.ts", {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
  if (res.status !== 0) {
    throw new Error(`Test seed failed (exit code ${res.status}).`);
  }
}

export async function prepareTestDatabase(): Promise<void> {
  await ensureTestDatabase();
  await resetAndSeedTestDatabase();
}
