/**
 * CLI seed entry: loads .env.local then runs the seed. The seed logic lives in
 * db/seed.ts (a side-effect-free module) so tests can import it directly.
 * Run with: npm run db:seed
 */
import { seedDatabase } from "@/db/seed";

// Only auto-load .env.local when DATABASE_URL isn't already provided. Test setup
// passes an explicit test DATABASE_URL and must never be redirected to the demo DB.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local — rely on the ambient environment.
  }
}

seedDatabase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
