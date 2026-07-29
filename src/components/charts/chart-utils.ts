import type { TrustStatus } from "@/features/leaderboards/types";

export const CHART_WIDTH = 760;
export const CHART_HEIGHT = 320;
export const CHART_PADDING = 44;
export const CHART_DASHES = [undefined, "10 5", "3 4", "14 4 3 4", "2 2", "16 3", "8 3 2 3", "12 6", "5 2", "18 4 2 4"] as const;
const DASH_LABELS = ["solid", "long dash", "dots", "dash-dot", "short dots", "wide dash", "double dash", "spaced dash", "fine dash", "long dash-dot"] as const;

export function scale(value: number, min: number, max: number, outputMin: number, outputMax: number) {
  if (min === max) return (outputMin + outputMax) / 2;
  return outputMin + ((value - min) / (max - min)) * (outputMax - outputMin);
}
export function dashLabel(index: number) { return `${DASH_LABELS[index % DASH_LABELS.length]} line`; }
export function formatScore(value: number) { return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value); }
export function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)); }
export function trustLabel(value: TrustStatus) { return value === "admin_verified" ? "Admin verified" : "Self-attested"; }

export function downsampleSeries(elapsedUs: readonly number[], forceN: readonly number[], maximumPoints = CHART_WIDTH) {
  if (elapsedUs.length <= maximumPoints) return { elapsedUs, forceN };
  const indices = Array.from({ length: maximumPoints }, (_, index) =>
    Math.round(index * (elapsedUs.length - 1) / (maximumPoints - 1)));
  return { elapsedUs: indices.map((index) => elapsedUs[index]), forceN: indices.map((index) => forceN[index]) };
}
