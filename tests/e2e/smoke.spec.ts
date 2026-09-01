import { expect, test } from "@playwright/test";

test("home renders the personal tracker", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Tracker progress")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Repeater$/i })).toBeVisible();
  await expect(page.getByText("VS BASELINE")).toBeVisible();
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
  await page.locator(".peak-exclusion-picker summary").click();
  await page.locator(".peak-exclusion-option").first().getByRole("checkbox").check();
  await expect(page.locator(".peak-exclusion-picker summary")).toContainText("1 selected");
  await page.getByRole("button", { name: /save local session/i }).click();
  await expect(page.getByText("Saved locally.", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /^Progress$/i }).first().click();
  await expect(page.getByRole("button", { name: /^Repeater$/i })).toHaveClass(/chip-selected/);
  await expect(page.getByLabel(/^Metric$/i)).toHaveValue("repeaterAverageForceN");
  await expect(page.locator(".chart-key")).toContainText(/avg repeater force/i);
  await expect(page.getByText(/trace-only for this metric/i)).toBeHidden();
  await page.getByLabel(/^Metric$/i).selectOption("peakForceN");
  await expect(page.getByRole("img", { name: /hand progress/i })).toBeVisible();
  await expect(page.getByText("Progress data")).toBeHidden();

  await page.getByRole("button", { name: /^Endurance$/i }).click();
  await expect(page.getByLabel(/^Metric$/i)).toHaveValue("enduranceAverageForceN");

  await page.getByRole("link", { name: /^History$/i }).first().click();
  await expect(page.getByRole("button", { name: /20mm edge.*Endurance/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /half crimp.*Repeater/i })).toBeVisible();
  await page.getByRole("button", { name: /half crimp.*Repeater/i }).click();
  await expect(page.getByText("1 peak excluded")).toBeVisible();
  await page.getByText("Source and audit").click();
  await expect(page.getByText(/excluded Rep 1/i)).toBeVisible();
});

test("imports a healthy-hand baseline and compares rehab progress against it", async ({ page }) => {
  await page.goto("/import");
  await page.locator("input[type=file]").setInputFiles("tests/fixtures/tindeq/max-force/peakforce-baseline-left.csv");

  await expect(page.getByRole("heading", { name: /peakforce-baseline-left\.csv/i })).toBeVisible();
  await page.locator(".draft-fields select").selectOption("left");
  await page.getByLabel(/healthy hand baseline/i).check();
  await page.getByRole("button", { name: /save local session/i }).click();
  await expect(page.getByText("Saved locally.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /dismiss saved imports/i }).click();
  await page.locator("input[type=file]").setInputFiles("tests/fixtures/tindeq/max-force/peakforce-rehab-right.csv");
  await expect(page.getByRole("heading", { name: /peakforce-rehab-right\.csv/i })).toBeVisible();
  await page.locator(".draft-fields select").selectOption("right");
  await page.getByRole("button", { name: /save local session/i }).click();
  await expect(page.getByText("Saved locally.", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /^History$/i }).first().click();
  await expect(page.getByText(/healthy baseline/i)).toBeVisible();

  await page.getByRole("link", { name: /^Progress$/i }).first().click();
  await page.getByRole("button", { name: /^Peak force$/i }).click();
  await page.getByLabel(/^Metric$/i).selectOption("peakForceN");
  await page.getByRole("button", { name: /^Right$/i }).click();
  await page.getByRole("button", { name: /^Baseline$/i }).click();

  await expect(page.getByText("VS BASELINE")).toBeVisible();
  await expect(page.getByText("80%")).toBeVisible();
  await expect(page.locator(".chart-legend")).toContainText("Baseline");
});
