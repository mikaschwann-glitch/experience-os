import { test, expect } from "@playwright/test";

// Exercises the real Property Intelligence forms: adaptive disclosure, create
// via Server Action + revalidate, persistence across refresh, property
// isolation in the rendered UI, and the status lifecycle.

const PI = "/dashboard/property-intelligence";
const insightSection = (page: import("@playwright/test").Page) =>
  page.locator("section").filter({ hasText: "Local knowledge only you have" });

test.describe("Property Intelligence acceptance", () => {
  test("B1 populated section is compact, then create insight persists across refresh", async ({ page }) => {
    await page.goto(PI);
    const section = insightSection(page);
    // Populated (seeded) section → add form collapsed behind the CTA.
    await expect(section.getByPlaceholder("Insight title")).toBeHidden();
    await section.locator("summary", { hasText: "Add local insight" }).click();
    await expect(section.getByPlaceholder("Insight title")).toBeVisible();

    const title = "E2E coastal viewpoint insight";
    await section.getByPlaceholder("Insight title").fill(title);
    await section.getByPlaceholder("In your own words…").fill("Fictional E2E insight.");
    await section.getByRole("button", { name: "Add local insight" }).click();

    await expect(page.getByText(title)).toBeVisible();
    await page.reload();
    await expect(page.getByText(title)).toBeVisible(); // persisted in DB
  });

  test("B2 property isolation: Atlantic-only knowledge not visible on the other property", async ({ page }) => {
    await page.goto(PI);
    await expect(page.getByText("Quiet coastal route (good weather only)")).toBeVisible();
    await page.getByRole("link", { name: "Research Lab (Simulation)" }).click();
    await expect(page.getByText("Quiet coastal route (good weather only)")).toHaveCount(0);
  });

  test("B3 empty property opens its add forms by default", async ({ page }) => {
    await page.goto(PI);
    await page.getByRole("link", { name: "Research Lab (Simulation)" }).click();
    await expect(insightSection(page).getByPlaceholder("Insight title")).toBeVisible();
  });

  test("B4 lifecycle: create then pause shows a visible status change", async ({ page }) => {
    await page.goto(PI);
    const section = insightSection(page);
    await section.locator("summary", { hasText: "Add local insight" }).click();
    const title = "E2E lifecycle item";
    await section.getByPlaceholder("Insight title").fill(title);
    await section.getByPlaceholder("In your own words…").fill("Fictional lifecycle item.");
    await section.getByRole("button", { name: "Add local insight" }).click();

    const card = page.locator("div.rounded-xl").filter({ hasText: title });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Pause" }).click();
    await expect(card.getByText("paused")).toBeVisible();
  });
});
