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
  sql = postgres(url, { max: 10 });
  db = drizzle(sql, { schema });
  return db;
}

export type Database = PostgresJsDatabase<typeof schema>;

// A query executor that is either the root db or an open transaction.
// Repository writes accept this so domain mutations + emitEvent share one tx.
export type Executor =
  | Database
  | Parameters<Parameters<Database["transaction"]>[0]>[0];
