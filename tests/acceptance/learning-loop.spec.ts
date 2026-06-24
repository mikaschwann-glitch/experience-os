import { test, expect } from "@playwright/test";

// Wave 2D end-to-end through the visible UI: a Greta feasibility proposal is
// accepted and converted to a host action; the host logs the outcome, captures a
// property learning, and promotes it; the new item is property-private (appears
// under Atlantic Hideaway, never under Pine Ridge Cabins).

const JOB_URL = /\/dashboard\/research-lab\/[0-9a-f-]{36}/;
const FEAS_URL = /\/dashboard\/feasibility\/[0-9a-f-]{36}/;
const GUEST_URL = /\/dashboard\/guests\/[0-9a-f-]{36}/;

// Distinct from every form placeholder so text assertions are unambiguous.
const NOTE = "Sunrise terrace coffee is a reliable winner for early risers.";

test.describe("Outcome → Property Learning Loop acceptance", () => {
  test("Greta: capture from an outcome → promote → property-private in PI", async ({ page }) => {
    // 1–2. Feasibility: run → approve → evaluate → accept → convert to host action.
    await page.goto("/dashboard/research-lab");
    await page.getByTestId("run-actionable_preparation").click();
    await expect(page).toHaveURL(JOB_URL);
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByTestId("evaluate-feasibility").click();
    await expect(page).toHaveURL(FEAS_URL);
    await page.getByRole("button", { name: /Confirm/ }).first().click();
    await expect(page.getByText(/Added to the host/).first()).toBeVisible();

    // 3. Open Greta's guest page and log the outcome on the converted host action.
    await page.goto("/dashboard/guests");
    await page.getByRole("link", { name: /Greta Hofer/ }).click();
    await expect(page).toHaveURL(GUEST_URL);
    await page.getByRole("button", { name: "Log outcome" }).first().click();

    // 4. Capture a property learning from the new outcome.
    await expect(page.getByText("Capture a property learning")).toBeVisible();
    await page.getByText("Capture a property learning").click();
    await page.locator('textarea[name="note"]').first().fill(NOTE);
    await page.locator('select[name="learningType"]').first().selectOption("capability");
    await page.getByRole("button", { name: "Save learning draft" }).click();
    await expect(page.getByText(/saved as a draft/)).toBeVisible();

    // 5–6. Property Intelligence (Atlantic is the default property): promote the draft.
    await page.goto("/dashboard/property-intelligence");
    await expect(page.getByTestId("learning-drafts")).toBeVisible();
    await page.getByText("Review and promote").first().click();
    await page.getByRole("button", { name: /Promote to/ }).first().click();

    // 7. The promoted capability is now visible under Atlantic Hideaway.
    await expect(page.getByText(NOTE).first()).toBeVisible();

    // 8. Switch to Pine Ridge Cabins → the learning must NOT appear (property-private).
    await page.getByRole("link", { name: "Pine Ridge Cabins" }).click();
    await expect(page.getByText(NOTE)).toHaveCount(0);
  });
});
