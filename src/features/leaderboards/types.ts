export type ScoreBasis = "absolute" | "relative";
export type TrustStatus = "self_attested" | "admin_verified";
export type TrustFilter = "all" | TrustStatus;
export type Hand = "left" | "right";

export type DateWindow =
  | Readonly<{ kind: "all_time" }>
  | Readonly<{ kind: "latest" }>
  | Readonly<{ kind: "days"; days: 30 | 90 }>
  | Readonly<{ kind: "custom"; from: string; to: string }>;

export type LeaderboardEntry = Readonly<{
  sessionId: string;
  groupId: string;
  ownerId: string;
  displayName: string;
  protocolVersionId: string;
  protocolName: string;
  assessmentType: string;
  hand: Hand;
  attemptId: string;
  metricRunId: string;
  absoluteScore: number;
  relativeScore: number | null;
  authoritativeCapturedAt: string;
  trustStatus: TrustStatus;
  publishedAt: string;
}>;

export type RankedLeaderboardEntry = LeaderboardEntry &
  Readonly<{
    basis: ScoreBasis;
    selectedScore: number;
    rank: number;
  }>;

export type ProgressEntry = LeaderboardEntry &
  Readonly<{
    basis: ScoreBasis;
    selectedScore: number;
  }>;

export type TraceCurve = Readonly<{
  groupId: string;
  protocolVersionId: string;
  hand: Hand;
  ownerId: string;
  sessionId: string;
  attemptId: string;
  elapsedUs: readonly number[];
  forceN: readonly number[];
  sampleCount: number;
  durationUs: number;
}>;

export type LeaderboardFilters = Readonly<{
  basis: ScoreBasis;
  window: DateWindow;
  trust?: TrustFilter;
  protocolVersionId?: string;
  hand?: Hand;
  now?: Date;
}>;
