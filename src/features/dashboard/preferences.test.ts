import { describe, expect, it } from "vitest";

import { resolveDashboardGroup, resolveDashboardSelection } from "./preferences";

const groups = ["group-a", "group-b"];
const protocols = ["protocol-a", "protocol-b"];

describe("resolveDashboardSelection", () => {
  it("opens the persisted home when no explicit selection is supplied", () => {
    expect(resolveDashboardSelection({
      groupId: "group-b",
      protocolIds: protocols,
      preferredGroupId: "group-b",
      preferredProtocolId: "protocol-b",
      preferredView: "progress",
      preferredHand: "left",
      preferredBasis: "relative",
    })).toEqual({
      groupId: "group-b",
      protocolId: "protocol-b",
      view: "progress",
      hand: "left",
      basis: "relative",
    });
  });

  it("lets an explicit URL selection override the persisted home", () => {
    expect(resolveDashboardSelection({
      groupId: "group-a",
      protocolIds: protocols,
      requestedProtocolId: "protocol-a",
      requestedView: "activity",
      requestedHand: "right",
      requestedBasis: "absolute",
      preferredGroupId: "group-b",
      preferredProtocolId: "protocol-b",
      preferredView: "progress",
    })).toEqual({
      groupId: "group-a",
      protocolId: "protocol-a",
      view: "activity",
      hand: "right",
      basis: "absolute",
    });
  });

  it("falls back safely when saved or requested values are no longer available", () => {
    expect(resolveDashboardSelection({
      groupId: "group-a",
      protocolIds: protocols,
      requestedProtocolId: "archived-protocol",
      requestedView: "unknown",
      preferredGroupId: "also-removed",
      preferredProtocolId: "also-archived",
      preferredView: "unknown",
      preferredHand: "unknown",
      preferredBasis: "unknown",
    })).toEqual({
      groupId: "group-a",
      protocolId: "protocol-a",
      view: "leaderboard",
      hand: "right",
      basis: "absolute",
    });
  });

  it("resolves a requested, preferred, or fallback group in that order", () => {
    expect(resolveDashboardGroup(groups, "group-a", "group-b")).toBe("group-a");
    expect(resolveDashboardGroup(groups, "removed", "group-b")).toBe("group-b");
    expect(resolveDashboardGroup(groups, "removed", "also-removed")).toBe("group-a");
    expect(resolveDashboardGroup([], "group-a", "group-b")).toBeNull();
  });
});
