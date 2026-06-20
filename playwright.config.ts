import { defineConfig, devices } from "@playwright/test";
import { TEST_DATABASE_URL } from "./tests/setup/testDb";

// Acceptance tests run against a production server (`next start`) bound to the
// ISOLATED test database, exercising the real browser → form → Server Action →
// DB → redirect path. Single worker + clean-seeded DB keeps runs deterministic
// and order-independent. Health-check on "/" (static, no DB) so the server is
// considered ready independent of seeding order.
const PORT = 3100;

export default defineConfig({
  testDir: "./tests/acceptance",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: TEST_DATABASE_URL },
  },
});
