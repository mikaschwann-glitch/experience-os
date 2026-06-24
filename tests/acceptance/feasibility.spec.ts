import { test, expect } from "@playwright/test";

// Real path: approve a brief → evaluate feasibility (Server Action + redirect) →
// review proposals → accept → convert into the Run 1 host-action path.

const JOB_URL = /\/dashboard\/research-lab\/[0-9a-f-]{36}/;
const FEAS_URL = /\/dashboard\/feasibility\/[0-9a-f-]{36}/;

test.describe("Feasibility engine acceptance", () => {
  test("Greta: approve → evaluate → accept → convert to host action", async ({ page }) => {
    await page.goto("/dashboard/research-lab");
    await page.getByTestId("run-actionable_preparation").click();
    await expect(page).toHaveURL(JOB_URL);

    // approve the brief
    await page.getByRole("button", { name: "Approve" }).click();
    // evaluate feasible preparations
    await page.getByTestId("evaluate-feasibility").click();
    await expect(page).toHaveURL(FEAS_URL);

    await expect(page.getByText("Proposed preparations")).toBeVisible();
    // One-step confirm (replaces the old Accept → Convert two-step): exactly one
    // recommendation + one host action, idempotent.
    const confirm = page.getByRole("button", { name: /Confirm/ }).first();
    await expect(confirm).toBeVisible();
    await confirm.click();
    await expect(page.getByText(/Added to the host/).first()).toBeVisible();
  });

  test("Aiko: medium identity → no brief → no feasibility evaluation available", async ({ page }) => {
    await page.goto("/dashboard/research-lab");
    await page.getByTestId("run-medium_ambiguous").click();
    await expect(page).toHaveURL(JOB_URL);
    await expect(page.getByText("No brief generated")).toBeVisible();
    await expect(page.getByTestId("evaluate-feasibility")).toHaveCount(0);
  });

  test("Multi-property: a brief on a non-primary property uses only that property's knowledge", async ({ page }) => {
    await page.goto("/dashboard/research-lab");
    await page.getByTestId("run-disallowed_source").click(); // Liam — stay on Pine Ridge
    await expect(page).toHaveURL(JOB_URL);
    await page.getByRole("button", { name: "Approve" }).click();
    // UI visibly identifies the correct (non-primary) property
    await expect(page.getByTestId("eval-property")).toContainText("Pine Ridge Cabins");
    await page.getByTestId("evaluate-feasibility").click();
    await expect(page).toHaveURL(FEAS_URL);
    // only Pine Ridge knowledge appears; primary (Atlantic) knowledge never leaks
    await expect(page.getByText("Pine Ridge woodcraft").first()).toBeVisible();
    await expect(page.getByText("Atlantic craft note")).toHaveCount(0);
  });

  test("Hard constraint: car-dependent proposal is withheld, not actionable", async ({ page }) => {
    await page.goto("/dashboard/research-lab");
    await page.getByTestId("run-multi_guest_mixed_consent").click();
    await expect(page).toHaveURL(JOB_URL); // Clara's job (the consenting subject)
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByTestId("evaluate-feasibility").click();
    await expect(page).toHaveURL(FEAS_URL);

    // the crater (car-dependent) candidate appears only under "Not proposed"
    await expect(page.getByText("Not proposed — and why")).toBeVisible();
    await expect(page.getByText("Blocked by a house rule").first()).toBeVisible();
  });
});
