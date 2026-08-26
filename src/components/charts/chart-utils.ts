export const CHART_WIDTH = 760;
export const CHART_HEIGHT = 320;
export const CHART_PADDING = 44;
export const CHART_DASHES = [undefined, "10 5", "3 4", "14 4 3 4", "2 2", "16 3", "8 3 2 3", "12 6", "5 2", "18 4 2 4"] as const;
const DASH_LABELS = ["solid", "long dash", "dots", "dash-dot", "short dots", "wide dash", "double dash", "spaced dash", "fine dash", "long dash-dot"] as const;
const NEWTONS_PER_KGF = 9.80665;

export function scale(value: number, min: number, max: number, outputMin: number, outputMax: number) {
  if (min === max) return (outputMin + outputMax) / 2;
  return outputMin + ((value - min) / (max - min)) * (outputMax - outputMin);
}
export function dashLabel(index: number) { return `${DASH_LABELS[index % DASH_LABELS.length]} line`; }
export function formatScore(value: number) { return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value); }
export function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)); }
export function formatCompactDate(value: string) {
  const localDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (localDate) return `${Number(localDate[3])}/${Number(localDate[2])}`;

  const date = new Date(value);
  return `${date.getUTCDate()}/${date.getUTCMonth() + 1}`;
}
export function forceNToKgf(value: number) { return value / NEWTONS_PER_KGF; }
export function formatProgressMetricLabel(metric: { metricKey?: string; key?: string; label: string }) {
  const key = metric.metricKey ?? metric.key;
  if (key === "repeaterAverageForceN") return "Estimated avg repeater force";
  return metric.label;
}
export function formatMetricValue(metric: { key?: string; metricKey?: string; value: number; unit: string }) {
  const key = metric.key ?? metric.metricKey ?? "";
  if (metric.unit === "N" || key.endsWith("ForceN")) {
    return `${formatScore(forceNToKgf(metric.value))} kg`;
  }

  return `${formatScore(metric.value)} ${metric.unit}`;
}
export function trustLabel() {
  return "Self-attested";
}

export function downsampleSeries(elapsedUs: readonly number[], forceN: readonly number[], maximumPoints = CHART_WIDTH) {
  if (elapsedUs.length <= maximumPoints) return { elapsedUs, forceN };
  const indices = Array.from({ length: maximumPoints }, (_, index) =>
    Math.round(index * (elapsedUs.length - 1) / (maximumPoints - 1)));
  return { elapsedUs: indices.map((index) => elapsedUs[index]), forceN: indices.map((index) => forceN[index]) };
}
