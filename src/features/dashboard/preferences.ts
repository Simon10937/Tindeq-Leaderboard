export const dashboardViews = ["leaderboard", "progress", "activity"] as const;

export type DashboardView = (typeof dashboardViews)[number];
export type DashboardHand = "left" | "right";
export type DashboardBasis = "absolute" | "relative";

type SelectionInput = Readonly<{
  groupId: string;
  protocolIds: readonly string[];
  requestedProtocolId?: string;
  requestedView?: string;
  requestedHand?: string;
  requestedBasis?: string;
  preferredGroupId?: string | null;
  preferredProtocolId?: string | null;
  preferredView?: string | null;
  preferredHand?: string | null;
  preferredBasis?: string | null;
}>;

export function isDashboardView(value: string | null | undefined): value is DashboardView {
  return dashboardViews.includes(value as DashboardView);
}

export function resolveDashboardSelection(input: SelectionInput): {
  groupId: string;
  protocolId: string | null;
  view: DashboardView;
  hand: DashboardHand;
  basis: DashboardBasis;
} {
  const protocolId = available(input.requestedProtocolId, input.protocolIds)
    ?? (input.groupId === input.preferredGroupId ? available(input.preferredProtocolId, input.protocolIds) : null)
    ?? input.protocolIds[0]
    ?? null;
  const view = isDashboardView(input.requestedView)
    ? input.requestedView
    : isDashboardView(input.preferredView) ? input.preferredView : "leaderboard";
  const hand = choice(input.requestedHand, ["left", "right"] as const)
    ?? choice(input.preferredHand, ["left", "right"] as const)
    ?? "right";
  const basis = choice(input.requestedBasis, ["absolute", "relative"] as const)
    ?? choice(input.preferredBasis, ["absolute", "relative"] as const)
    ?? "absolute";

  return { groupId: input.groupId, protocolId, view, hand, basis };
}

export function resolveDashboardGroup(
  groupIds: readonly string[],
  requestedGroupId?: string,
  preferredGroupId?: string | null,
): string | null {
  return available(requestedGroupId, groupIds)
    ?? available(preferredGroupId, groupIds)
    ?? groupIds[0]
    ?? null;
}

function available(value: string | null | undefined, options: readonly string[]): string | null {
  return value && options.includes(value) ? value : null;
}

function choice<const T extends readonly string[]>(value: string | null | undefined, options: T): T[number] | null {
  return value && options.includes(value) ? value as T[number] : null;
}
