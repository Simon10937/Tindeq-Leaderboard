import { expect, test } from "@playwright/test";

test("public home renders the product promise", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /finger strength/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
});
