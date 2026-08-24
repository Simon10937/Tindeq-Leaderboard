import { expect, test } from "@playwright/test";

test("home renders the personal tracker", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /track grip progress\./i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /0 \/ 3 sessions/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /over time/i })).toBeVisible();
  await expect(page.getByText("Choose Tindeq ZIP or CSVs")).toBeHidden();
  await expect(page.getByText("Import new data")).toBeHidden();
  await expect(page.getByText("View progress")).toBeHidden();
  await expect(page.getByText("Session history")).toBeHidden();

  await page.getByRole("link", { name: /^Import$/i }).first().click();
  await expect(page).toHaveURL(/\/import$/);
  await expect(page.getByRole("heading", { name: /^Import data$/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /track grip progress\./i })).toBeHidden();
  await expect(page.getByText("Choose Tindeq ZIP or CSVs")).toBeVisible();
  await expect(page.getByRole("button", { name: /import from clipboard/i })).toBeVisible();
  await expect(page.getByText("Local tracker ready.")).toBeHidden();
  await expect(page.getByRole("heading", { name: /local browser mode/i })).toBeHidden();

  await page.getByRole("link", { name: /^History$/i }).first().click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("heading", { name: /^Session history$/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /sessions/i })).toBeVisible();
  await expect(page.getByText("Choose Tindeq ZIP or CSVs")).toBeHidden();
  await expect(page.getByText("Local tracker ready.")).toBeHidden();
  await expect(page.getByRole("heading", { name: /local browser mode/i })).toBeHidden();
});

test("opens directly to URL-backed tracker views", async ({ page }) => {
  await page.goto("/import");
  await expect(page.getByRole("heading", { name: /^Import data$/i })).toBeVisible();
  await expect(page.getByText("Choose Tindeq ZIP or CSVs")).toBeVisible();

  await page.goto("/history");
  await expect(page.getByRole("heading", { name: /^Session history$/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /sessions/i })).toBeVisible();
  await expect(page.getByText("Choose Tindeq ZIP or CSVs")).toBeHidden();
});

test("imports an endurance file and keeps import output dismissible", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^Import$/i }).first().click();
  await page.locator("input[type=file]").setInputFiles("tests/fixtures/tindeq/critical-force/critical-force.csv");

  await expect(page.getByRole("heading", { name: /critical-force\.csv/i })).toBeVisible();
  await page.getByRole("button", { name: "half crimp", exact: true }).click();
  await page.getByRole("button", { name: /save local session/i }).click();
  await expect(page.getByText(/saved locally/i)).toBeVisible();

  await page.getByRole("button", { name: /dismiss saved imports/i }).click();
  await expect(page.getByRole("heading", { name: /critical-force\.csv/i })).toBeHidden();

  await page.getByRole("link", { name: /^Progress$/i }).first().click();
  await expect(page.locator("body")).toContainText("Endurance avg force");
  await expect(page.locator("body")).toContainText("Max force");
});
