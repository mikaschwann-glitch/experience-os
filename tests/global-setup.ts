import { prepareTestDatabase } from "./setup/testDb";

// Playwright global setup: build a clean, isolated test DB before the suite.
export default async function globalSetup() {
  await prepareTestDatabase();
}
