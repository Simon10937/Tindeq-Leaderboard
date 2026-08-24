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

test("imports endurance and repeater files, keeps history independent, and exposes clean metric plots", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^Import$/i }).first().click();
  await page.locator("input[type=file]").setInputFiles("tests/fixtures/tindeq/critical-force/critical-force.csv");

  await expect(page.getByRole("heading", { name: /critical-force\.csv/i })).toBeVisible();
  await page.getByRole("button", { name: "20mm edge", exact: true }).click();
  await page.getByRole("button", { name: /save local session/i }).click();
  await expect(page.getByText("Saved locally.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /dismiss saved imports/i }).click();
  await expect(page.getByRole("heading", { name: /critical-force\.csv/i })).toBeHidden();

  await page.locator("input[type=file]").setInputFiles("tests/fixtures/tindeq/repeaters/partial-two-reps.csv");
  await expect(page.getByRole("heading", { name: /partial-two-reps\.csv/i })).toBeVisible();
  await page.getByRole("button", { name: "half crimp", exact: true }).click();
  await page.getByRole("button", { name: /save local session/i }).click();
  await expect(page.getByText("Saved locally.", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /^Progress$/i }).first().click();
  const metricFilter = page.locator(".filters label").filter({ hasText: "Metric" }).locator("select");
  const modeFilter = page.locator(".filters label").filter({ hasText: "Mode" }).locator("select");
  const gripFilter = page.locator(".filters label").filter({ hasText: "Grip" }).locator("select");
  await expect(metricFilter).toHaveValue("repeaterAverageForceN");
  await expect(page.locator(".chart-key")).toContainText(/avg repeater force/i);
  await expect(page.locator(".chart-key")).not.toContainText("Max force");
  await expect(page.getByText(/trace-only for this metric/i)).toBeHidden();
  await modeFilter.selectOption("repeater");
  await expect(metricFilter).toContainText("Repeater average force");
  await expect(metricFilter).toContainText("Repeater max force");
  await metricFilter.selectOption("peakForceN");
  await expect(page.getByRole("img", { name: /progress over time/i })).toBeVisible();
  await expect(page.getByText("Progress data")).toBeHidden();

  await modeFilter.selectOption("endurance");
  await expect(metricFilter).toContainText("Endurance average force");
  await expect(metricFilter).toContainText("Endurance max force");

  await gripFilter.selectOption("half crimp");
  await page.getByRole("link", { name: /^History$/i }).first().click();
  await expect(page.getByRole("button", { name: /20mm edge.*Endurance/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /half crimp.*Repeater/i })).toBeVisible();
});
