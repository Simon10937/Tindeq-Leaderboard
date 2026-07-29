import type { LeaderboardFilters } from "@/features/leaderboards/types";

export function LeaderboardFilterForm({ filters, mode }: { filters: LeaderboardFilters; mode: "leaderboard" | "progress" }) {
  const windowValue = filters.window.kind === "days" ? String(filters.window.days) : filters.window.kind;
  return <form method="get" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, alignItems: "end" }}>
    <label>Hand<select name="hand" defaultValue={filters.hand}><option value="left">Left</option><option value="right">Right</option></select></label>
    <label>Score<select name="basis" defaultValue={filters.basis}><option value="absolute">Absolute</option><option value="relative">Body-weight relative</option></select></label>
    <label>Period<select name="window" defaultValue={windowValue}><option value="all_time">{mode === "leaderboard" ? "All-time best" : "All history"}</option><option value="latest">{mode === "leaderboard" ? "Latest result" : "Latest per climber"}</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom dates</option></select></label>
    <label>Trust<select name="trust" defaultValue={filters.trust}><option value="all">All trust states</option><option value="admin_verified">Admin verified</option><option value="self_attested">Self-attested</option></select></label>
    <label>From<input name="from" type="date" defaultValue={filters.window.kind === "custom" ? filters.window.from : ""}/></label>
    <label>To<input name="to" type="date" defaultValue={filters.window.kind === "custom" ? filters.window.to : ""}/></label>
    <button className="button" type="submit">Apply filters</button>
  </form>;
}
