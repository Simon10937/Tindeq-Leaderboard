import { expect, test } from "@playwright/test";

test("home renders the personal tracker", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /track grip progress\./i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /0 \/ 3 sessions/i })).toBeVisible();
  await expect(page.getByText("Choose Tindeq ZIP or CSVs")).toBeVisible();
  await expect(page.getByRole("button", { name: /import from clipboard/i })).toBeVisible();
});
