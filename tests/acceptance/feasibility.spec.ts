import { test, expect } from "@playwright/test";

// Real path: approve a brief → evaluate feasibility (Server Action + redirect) →
// review proposals → accept → convert into the Run 1 host-action path.

const JOB_URL = /\/dashboard\/research-lab\/[0-9a-f-]{36}/;
const FEAS_URL = /\/dashboard\/feasibility\/[0-9a-f-]{36}/;
const PREP_URL = /\/dashboard\/preparations\/[0-9a-f-]{36}/;
const GUEST_URL = /\/dashboard\/guests\/[0-9a-f-]{36}/;

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

    // Wave 2: one dominant, primary suggestion (not a grid of equal cards).
    await expect(page.getByText(/Suggested preparation/i).first()).toBeVisible();
    // One-step "Create preparation": creates exactly one Preparation and navigates
    // straight to its detail surface (no silent disappearance).
    const create = page.getByRole("button", { name: /Create preparation/ }).first();
    await expect(create).toBeVisible();
    await create.click();
    await expect(page).toHaveURL(PREP_URL);
    // Recoverable from the durable Preparations inventory.
    await page.goto("/dashboard/preparations");
    await expect(page.getByRole("heading", { name: "Preparations" })).toBeVisible();
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

  test("Hard constraint: car-dependent proposal is set aside, not suggested", async ({ page }) => {
    await page.goto("/dashboard/research-lab");
    await page.getByTestId("run-multi_guest_mixed_consent").click();
    await expect(page).toHaveURL(JOB_URL); // Clara's job (the consenting subject)
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByTestId("evaluate-feasibility").click();
    await expect(page).toHaveURL(FEAS_URL);

    // Wave 2: withheld ideas are not prominent — they live behind an optional
    // "Ideas we set aside" disclosure, with a plain-language reason (not engine jargon).
    await page.getByText(/Ideas we set aside/).click();
    await expect(page.getByText("Blocked by a house rule").first()).toBeVisible();
  });

  test("Fallback idempotency: editing the content yields a NEW preparation, not a conflict", async ({ page }) => {
    // Reach a WITHHOLDING run via "Prepare for this stay": a free-text request the
    // property can't safely match → 0 suggestions → the host-authored custom form.
    await page.goto("/dashboard/guests");
    await page.getByRole("link", { name: /Maria & Tom/ }).click();
    await expect(page).toHaveURL(GUEST_URL);
    // Scope to the "Prepare for this stay" field (the guest also has a capture-learning
    // note field once an outcome exists, so a bare textarea[name=note] is ambiguous).
    await page
      .getByRole("textbox", { name: "What would help this guest?" })
      .fill("local architecture and historical buildings");
    await page.getByRole("button", { name: /Prepare for this stay/ }).click();
    await expect(page).toHaveURL(FEAS_URL);
    const feasUrl = page.url();
    // Friendly withhold copy — never a system-failure message.
    await expect(page.getByText(/don.t have a reliable idea/i)).toBeVisible();

    // First fallback submission → one Preparation.
    await page.locator('input[name="title"]').fill("Lay out local architecture books");
    await page.getByRole("button", { name: /Create preparation/ }).click();
    await expect(page).toHaveURL(PREP_URL);
    const url1 = page.url();

    // Return to the SAME withholding run; the form re-renders with a fresh key. Submit
    // DIFFERENT content → a NEW key → a NEW Preparation (no fingerprint conflict banner).
    await page.goto(feasUrl);
    await page.locator('input[name="title"]').fill("Print a quiet city map instead");
    await page.getByRole("button", { name: /Create preparation/ }).click();
    await expect(page).toHaveURL(PREP_URL);
    const url2 = page.url();

    expect(url2).not.toEqual(url1);
    await expect(page.getByTestId("fallback-conflict")).toHaveCount(0);
  });

  test("Sibling suppression: choosing one idea sets the others aside (auditable, not open work)", async ({ page }) => {
    // One guest need with several grounded ideas (Maria's quiet-coastal knowledge).
    await page.goto("/dashboard/guests");
    await page.getByRole("link", { name: /Maria & Tom/ }).click();
    await expect(page).toHaveURL(GUEST_URL);
    await page
      .getByRole("textbox", { name: "What would help this guest?" })
      .fill("a quiet beach walk away from the crowds");
    await page.getByRole("button", { name: /Prepare for this stay/ }).click();
    await expect(page).toHaveURL(FEAS_URL);
    const feasUrl = page.url();

    // One dominant primary + alternatives collapsed under "Other ideas".
    await expect(page.getByText(/Suggested preparation/i).first()).toBeVisible();
    await expect(page.getByText(/Other ideas \(/)).toBeVisible();

    // Choose the primary → exactly one Preparation.
    await page.getByRole("button", { name: /Create preparation/ }).first().click();
    await expect(page).toHaveURL(PREP_URL);
    const url1 = page.url();

    // The alternatives are now auditable on the created Preparation, not open tasks.
    await expect(page.getByTestId("other-ideas-considered")).toBeVisible();

    // The explicit secondary action creates a DISTINCT additional preparation.
    await page.getByText(/Other ideas considered/).click();
    await page
      .getByTestId("other-ideas-considered")
      .getByRole("button", { name: /Create preparation/ })
      .first()
      .click();
    // Wait for the NEW preparation (url1 is already a PREP_URL, so toHaveURL(PREP_URL)
    // would pass without waiting — assert navigation to a DIFFERENT preparation).
    await page.waitForURL((url) => PREP_URL.test(url.href) && url.href !== url1);

    // Revisiting the ORIGINAL run shows the resolved state — siblings are NOT re-offered
    // as normal first-selection work.
    await page.goto(feasUrl);
    await expect(page.getByTestId("run-resolved")).toBeVisible();
    await expect(page.getByRole("button", { name: /Create preparation/ })).toHaveCount(0);
  });
});
