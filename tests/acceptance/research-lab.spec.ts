import { test, expect } from "@playwright/test";

// Exercises the REAL path: rendered page → form submit → Server Action →
// DB write → redirect → result page. (This is the layer the prior origin and
// missing-redirect bugs lived in — invisible to the repo-level verify scripts.)

const JOB_URL = /\/dashboard\/research-lab\/[0-9a-f-]{36}/;

test.describe("Research Lab acceptance", () => {
  test("A1 high-confidence (Greta) → redirect, High confidence, brief exists", async ({ page }) => {
    await page.goto("/dashboard/research-lab");
    await page.getByTestId("run-actionable_preparation").click();
    await expect(page).toHaveURL(JOB_URL);
    await expect(page.getByText("confidence: high")).toBeVisible();
    // brief contains an actionable preparation derived from allowed evidence
    await expect(page.getByText(/quiet sunrise hiking/i)).toBeVisible();
  });

  test("A2 medium (Aiko) → redirect, medium/pending, no brief, no preparation", async ({ page }) => {
    await page.goto("/dashboard/research-lab");
    await page.getByTestId("run-medium_ambiguous").click();
    await expect(page).toHaveURL(JOB_URL);
    await expect(page.getByText("No brief generated")).toBeVisible();
    await expect(page.getByText("medium · pending")).toBeVisible();
    // no fabricated high-confidence brief
    await expect(page.getByText("confidence: high")).toHaveCount(0);
  });

  test("A3 withdrawn consent (Nadia) cannot run; blocked state visible", async ({ page }) => {
    await page.goto("/dashboard/research-lab");
    await expect(page.getByTestId("run-consent_withdrawn_before")).toHaveCount(0);
    await expect(page.getByText("Consent withdrawn — simulation blocked")).toBeVisible();
  });

  test("A4 prohibited content (Sofia) is not exposed in the brief", async ({ page }) => {
    await page.goto("/dashboard/research-lab");
    await page.getByTestId("run-prohibited_content_trap").click();
    await expect(page).toHaveURL(JOB_URL);
    // a brief is still produced from allowed evidence...
    await expect(page.getByText("confidence: high")).toBeVisible();
    // ...but sensitive content is blocked and never rendered
    await expect(page.getByText("Blocked — sensitive", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("[sensitive trap]")).toHaveCount(0);
  });
});
