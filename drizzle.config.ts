import { defineConfig } from "drizzle-kit";

// drizzle-kit (CLI) does not auto-load .env.local the way Next.js does, so load
// it here for migrate/generate/studio. Dev-only; harmless if the file is absent.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — fall back to whatever is already in the environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/experience_os",
  },
  strict: true,
  verbose: true,
});
