import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

/**
 * Lazily-initialized Drizzle client.
 *
 * The connection is created on first use (not at import time) so that
 * `next build` and any module import do not require a live database or a
 * DATABASE_URL to be present. Server code (pages, server actions, repositories)
 * calls getDb() at request time; dashboard routes are force-dynamic.
 */
let sql: ReturnType<typeof postgres> | undefined;
let db: PostgresJsDatabase<typeof schema> | undefined;

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and set it.",
    );
  }
  // Serverless-aware connection config. Anything that isn't localhost is treated
  // as managed/cloud Postgres reached through a transaction-mode pooler
  // (Neon / Supabase :6543 / PgBouncer), which does NOT support prepared
  // statements and where each function instance should hold few connections.
  // Local Docker keeps the original pooled, prepared behavior unchanged.
  // TLS is taken from the connection string (managed URLs must include
  // ?sslmode=require) — see docs/cloud-preview.md.
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  sql = postgres(url, {
    max: isLocal ? 10 : 1,
    prepare: isLocal,
  });
  db = drizzle(sql, { schema });
  return db;
}

// Close the lazily-created pool (used by test setup so processes don't hang).
export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = undefined;
    db = undefined;
  }
}

export type Database = PostgresJsDatabase<typeof schema>;

// A query executor that is either the root db or an open transaction.
// Repository writes accept this so domain mutations + emitEvent share one tx.
export type Executor =
  | Database
  | Parameters<Parameters<Database["transaction"]>[0]>[0];
