import { test, expect } from "@playwright/test";

// End-to-end through the visible UI: a Greta feasibility proposal is confirmed into a
// Preparation; the host logs the outcome and captures a property-learning DRAFT. Wave 1
// learning-safety: the draft is REVIEW-ONLY (promotion to active knowledge is not
// available yet) and is property-private (appears under Atlantic Hideaway, never under
// Pine Ridge Cabins).

const JOB_URL = /\/dashboard\/research-lab\/[0-9a-f-]{36}/;
const FEAS_URL = /\/dashboard\/feasibility\/[0-9a-f-]{36}/;
const GUEST_URL = /\/dashboard\/guests\/[0-9a-f-]{36}/;
const PREP_URL = /\/dashboard\/preparations\/[0-9a-f-]{36}/;

// Distinct from every form placeholder so text assertions are unambiguous.
const NOTE = "Sunrise terrace coffee is a reliable winner for early risers.";

test.describe("Outcome → Property Learning Loop acceptance", () => {
  test("Greta: capture from an outcome → review-only draft → property-private in PI", async ({ page }) => {
    // 1–2. Feasibility: run → approve → evaluate → accept → convert to host action.
    await page.goto("/dashboard/research-lab");
    await page.getByTestId("run-actionable_preparation").click();
    await expect(page).toHaveURL(JOB_URL);
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByTestId("evaluate-feasibility").click();
    await expect(page).toHaveURL(FEAS_URL);
    await page.getByRole("button", { name: /Create preparation/ }).first().click();
    await expect(page).toHaveURL(PREP_URL);

    // 3. Open Greta's guest page and log the outcome on the converted host action.
    await page.goto("/dashboard/guests");
    await page.getByRole("link", { name: /Greta Hofer/ }).click();
    await expect(page).toHaveURL(GUEST_URL);
    await page.getByRole("button", { name: "Log outcome" }).first().click();

    // 4. Capture a property learning from the new outcome. Scope to the capture form:
    // the guest page also has a "Plan a preparation" note field, so an unscoped
    // textarea[name="note"] would fill the wrong one (empty capture note → no draft).
    const capture = page.getByTestId("capture-learning");
    await expect(capture.getByText("Capture a property learning")).toBeVisible();
    await capture.getByText("Capture a property learning").click();
    await capture.locator('textarea[name="note"]').fill(NOTE);
    await capture.locator('select[name="learningType"]').selectOption("capability");
    await capture.getByRole("button", { name: "Save learning draft" }).click();
    // Wait for the capture to actually PERSIST: on success the capture form is replaced
    // by the saved-draft state. (The form's helper text also contains "saved as a draft",
    // so asserting that text would pass before the server action commits and race the
    // navigation below.)
    await expect(page.getByTestId("capture-learning")).toHaveCount(0);

    // 5. Property Intelligence (Atlantic is the default property): the captured draft is
    // REVIEW-ONLY — present, property-scoped, and explicitly not promotable yet.
    await page.goto("/dashboard/property-intelligence");
    await expect(page.getByTestId("learning-drafts")).toBeVisible();
    await expect(page.getByText(NOTE).first()).toBeVisible();
    await expect(page.getByTestId("promote-disabled").first()).toBeVisible();

    // 6. Property-private: switch to Pine Ridge Cabins → the draft must NOT appear.
    await page.getByRole("link", { name: "Pine Ridge Cabins" }).click();
    await expect(page.getByText(NOTE)).toHaveCount(0);
  });
});
