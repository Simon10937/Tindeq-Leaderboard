"use client";

import { type ClipboardEvent, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { TrackerProgressChart } from "@/components/charts/tracker-progress-chart";
import { TrackerTraceChart } from "@/components/charts/tracker-trace-chart";
import { formatCompactDate, formatMetricValue, formatProgressMetricLabel } from "@/components/charts/chart-utils";
import { extractCsvFiles, type ExtractedCsvFile } from "@/features/tracker/import/extract-files";
import { detectTindeqCsv } from "@/features/tracker/parsers/detect";
import { augmentStoredEnduranceMetrics } from "@/features/tracker/parsers/endurance";
import { augmentStoredPeakForceMetrics } from "@/features/tracker/parsers/peak-force";
import { augmentStoredRepeaterMetrics } from "@/features/tracker/parsers/repeater";
import { parseCsvRows } from "@/features/tracker/parsers/tindeq-shared";
import { buildTrackerSession, normalizeStoredTrackerSession, normalizeTags, progressPointsForSession, updateTrackerSessionMetadata, validateImportContext, type ImportContext, type ParsedTrackerCsv, type ProgressPoint, type TrackerMetricKey, type TrackerMode, type TrackerSession } from "@/features/tracker/types";
import { createTrackerStore, type TrackerStore } from "@/features/tracker/storage/local-store";
import { createSupabaseTrackerStore, createTrackerSupabaseClient, readTrackerAuthState, type TrackerAuthState } from "@/features/tracker/storage/supabase-store";

type DraftImport = Readonly<{
  id: string;
  filename: string;
  parsed?: ParsedTrackerCsv;
  error?: string;
  grip: string;
  testedAt: string;
  hand: "" | "left" | "right" | "both";
  notes: string;
  tags: readonly string[];
  expanded: boolean;
  saved?: boolean;
}>;

type DraftDefaults = Partial<Pick<DraftImport, "grip" | "testedAt" | "notes" | "tags">>;
type SelectedMetric = "all" | TrackerMetricKey;
type AvailableMetric = Extract<TrackerSession["metrics"][number], { available: true }>;
type ActiveTab = "progress" | "import" | "history";
type ChartMode = Extract<TrackerMode, "endurance" | "repeater" | "peak_force">;
type SessionEditState = Readonly<{ sessionId: string; context: ImportContext }>;
type MetricOption = Readonly<{ key: TrackerMetricKey; label: string; mode?: TrackerMode }>;

const metricOptions: MetricOption[] = [
  { key: "criticalForceN", label: "Critical force", mode: "endurance" },
  { key: "enduranceAverageForceN", label: "Endurance average force", mode: "endurance" },
  { key: "peakForceN", label: "Endurance max force", mode: "endurance" },
  { key: "repeaterAverageForceN", label: "Repeater average force", mode: "repeater" },
  { key: "peakForceN", label: "Repeater max force", mode: "repeater" },
  { key: "peakForceN", label: "Peak force max", mode: "peak_force" },
];

const gripPresets = ["20mm edge", "15mm edge", "half crimp", "rehab half crimp", "open hand", "pinch", "jug"];
const tagPresets = ["rehab", "max effort", "repeaters", "endurance", "skin", "warm-up", "block weight"];
const weeklyTargetStorageKey = "tindeq-tracker-weekly-target";

export function TrackerApp({ initialTab = "progress" }: Readonly<{ initialTab?: ActiveTab }>) {
  const localStoreRef = useRef<TrackerStore | null>(null);
  const storeRef = useRef<TrackerStore | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createTrackerSupabaseClient>>(undefined);
  const refreshGenerationRef = useRef(0);
  const [sessions, setSessions] = useState<TrackerSession[]>([]);
  const [drafts, setDrafts] = useState<DraftImport[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => typeof window === "undefined" ? initialTab : readActiveTabFromLocation(initialTab));
  const [selectedMetric, setSelectedMetric] = useState<SelectedMetric>("all");
  const [modeFilter, setModeFilter] = useState<ChartMode>("repeater");
  const [gripFilter, setGripFilter] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [status, setStatus] = useState<string | undefined>();
  const [reimportNoticeCount, setReimportNoticeCount] = useState(0);
  const [weeklyTarget, setWeeklyTarget] = useState(3);
  const [authState, setAuthState] = useState<TrackerAuthState>({ status: "checking" });
  const [authEmail, setAuthEmail] = useState("");
  const [draftTagInputs, setDraftTagInputs] = useState<Record<string, string>>({});
  const [sessionEdit, setSessionEdit] = useState<SessionEditState>();
  const [sessionTagInput, setSessionTagInput] = useState("");

  useEffect(() => {
    const syncTabFromUrl = () => setActiveTab(readActiveTabFromLocation(initialTab));
    syncTabFromUrl();
    window.addEventListener("popstate", syncTabFromUrl);
    return () => window.removeEventListener("popstate", syncTabFromUrl);
  }, [initialTab]);

  useEffect(() => {
    const localStore = createTrackerStore();
    localStoreRef.current = localStore;
    storeRef.current = localStore;
    const supabase = createTrackerSupabaseClient();
    supabaseRef.current = supabase;

    if (!supabase) {
      window.setTimeout(() => {
        setAuthState({ status: "local" });
        void refreshSessions(localStore);
      }, 0);
      return;
    }

    void readTrackerAuthState(supabase).then((nextAuthState) => {
      void applyAuthState(nextAuthState);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void applyAuthState(session?.user ? { status: "signed-in", user: session.user } : { status: "signed-out" });
    });

    return () => listener.subscription.unsubscribe();
    // This is the one-time tracker store/auth bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const savedTarget = readWeeklyTarget();
      if (savedTarget) setWeeklyTarget(savedTarget);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  async function refreshSessions(store = storeRef.current) {
    if (!store) return;
    const generation = ++refreshGenerationRef.current;
    const storedSessions = await store.list();
    const normalized = storedSessions
      .map((session) => augmentStoredRepeaterMetrics(normalizeStoredTrackerSession(session)))
      .map((result) => {
        const endurance = augmentStoredEnduranceMetrics(result.session);
        return {
          session: endurance.session,
          changed: result.changed || endurance.changed,
          needsReimport: result.needsReimport || endurance.needsReimport,
        };
      })
      .map((result) => {
        const peakForce = augmentStoredPeakForceMetrics(result.session);
        return {
          session: peakForce.session,
          changed: result.changed || peakForce.changed,
          needsReimport: result.needsReimport || peakForce.needsReimport,
        };
      });
    if (generation !== refreshGenerationRef.current) return;

    setReimportNoticeCount(normalized.filter((result) => result.needsReimport).length);
    setSessions(normalized.map((result) => result.session));

    const saveResults = await Promise.allSettled(normalized.filter((result) => result.changed).map(async (result) => {
      if (generation !== refreshGenerationRef.current) return;
      await store.save(result.session);
    }));
    if (generation !== refreshGenerationRef.current) return;

    if (saveResults.some((result) => result.status === "rejected")) {
      setStatus("Trace-derived metrics are available for this session, but could not be written back yet.");
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    await addFileDrafts(Array.from(files), "file");
  }

  async function handleClipboardImport() {
    if (isIosSafari()) {
      setStatus("iOS Safari does not provide copied ZIP files to websites. Tap Choose Tindeq ZIP or CSVs and select the export from Files.");
      return;
    }

    if (!navigator.clipboard?.read) {
      setStatus("This browser does not expose clipboard files to buttons. Use Choose Tindeq ZIP or CSVs instead.");
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      const files = await filesFromClipboardItems(clipboardItems);
      if (files.length === 0) {
        setStatus("No files found on the clipboard. Mobile browsers often block copied ZIP files here; use Choose Tindeq ZIP or CSVs.");
        return;
      }

      await addFileDrafts(files, "clipboard");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not read files from the clipboard.");
    }
  }

  async function handlePastedFiles(event: ClipboardEvent<HTMLDivElement>) {
    const files = filesFromClipboard(event.clipboardData);
    if (files.length === 0) {
      setStatus("No pasted files found. Copy the Tindeq export files, then paste them here.");
      return;
    }

    event.preventDefault();
    await addFileDrafts(files, "pasted");
  }

  async function addFileDrafts(files: readonly File[], source: "file" | "pasted" | "clipboard") {
    const now = Date.now();
    setStatus("Reading Tindeq export...");

    try {
      const csvFiles = await extractCsvFiles(files);
      const nextDrafts = createDraftsFromCsvFiles(csvFiles, source, now);
      if (nextDrafts.length === 0) {
        setStatus("No Tindeq data CSVs found. The ZIP may only contain metadata.");
        return;
      }

      setDrafts((current) => [...nextDrafts, ...current]);
      const label = source === "file" ? "file" : `${source} import`;
      setStatus(`${nextDrafts.length} ${label}${nextDrafts.length === 1 ? "" : "s"} ready to review.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not read the Tindeq export.");
    }
  }

  async function saveDraft(draft: DraftImport) {
    const store = storeRef.current;
    if (!store || !draft.parsed) return;
    const validation = validateImportContext({
      grip: draft.grip,
      testedAt: draft.testedAt,
      hand: draft.hand || undefined,
      notes: draft.notes,
      tags: draft.tags,
    });
    if (!validation.ok) {
      setStatus(validation.errors.join(" "));
      return;
    }

    await store.save(buildTrackerSession(draft.parsed, validation.context));
    await refreshSessions(store);
    setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, saved: true, expanded: false } : item));
    setStatus(`${draft.filename} saved ${authState.status === "signed-in" ? "to Supabase" : "locally"}.`);
  }

  async function requestMagicLink() {
    const supabase = supabaseRef.current;
    const email = authEmail.trim().toLowerCase();
    if (!supabase) {
      setStatus("Private sync is not configured in this build. Use the Vercel preview or production site to sign in.");
      return;
    }
    if (!email) {
      setStatus("Enter your email address first.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: buildMagicLinkRedirectUrl(window.location.origin, routeForTab(activeTab)),
        shouldCreateUser: false,
      },
    });
    setStatus(error ? error.message : "Check your email for the private tracker sign-in link.");
  }

  async function signOutTracker() {
    const supabase = supabaseRef.current;
    if (supabase) await supabase.auth.signOut();
    await activateLocalTrackerStore("Signed out. Showing local browser data.");
  }

  async function applyAuthState(nextAuthState: TrackerAuthState) {
    setAuthState(nextAuthState);
    if (nextAuthState.status === "signed-in" && nextAuthState.user) {
      await activateSupabaseTrackerStore(nextAuthState.user.id);
      return;
    }

    await activateLocalTrackerStore(undefined);
  }

  async function activateSupabaseTrackerStore(userId: string) {
    const supabase = supabaseRef.current;
    const localStore = localStoreRef.current;
    if (!supabase || !localStore) return;

    const remoteStore = createSupabaseTrackerStore(supabase, userId);
    storeRef.current = remoteStore;
    setStatus("Syncing local tracker sessions to Supabase...");
    const localSessions = await localStore.list();
    await Promise.all(localSessions.map((session) => remoteStore.save(session)));
    await refreshSessions(remoteStore);
    setStatus(`Supabase tracker ready${localSessions.length > 0 ? `; synced ${localSessions.length} local session${localSessions.length === 1 ? "" : "s"}.` : "."}`);
  }

  async function activateLocalTrackerStore(nextStatus: string | undefined) {
    const localStore = localStoreRef.current;
    if (!localStore) return;
    storeRef.current = localStore;
    await refreshSessions(localStore);
    setStatus(nextStatus);
  }

  async function deleteSession(id: string) {
    const store = storeRef.current;
    if (!store) return;
    refreshGenerationRef.current += 1;
    await store.delete(id);
    await refreshSessions(store);
    if (selectedSessionId === id) setSelectedSessionId(undefined);
    if (sessionEdit?.sessionId === id) cancelSessionEdit();
    setStatus("Session deleted.");
  }

  async function resetAll() {
    if (!window.confirm("Delete all local Tindeq tracker data from this browser?")) return;
    const store = storeRef.current;
    if (!store) return;
    refreshGenerationRef.current += 1;
    await store.clear();
    await refreshSessions(store);
    setSelectedSessionId(undefined);
    setStatus("Local tracker data cleared.");
  }

  function updateWeeklyTarget(value: number) {
    const nextTarget = normalizeWeeklyTarget(value) ?? 3;
    setWeeklyTarget(nextTarget);
    persistWeeklyTarget(nextTarget);
  }

  function navigateToTab(tab: ActiveTab, event?: MouseEvent<HTMLAnchorElement>) {
    event?.preventDefault();
    setActiveTab(tab);
    window.history.pushState({ view: tab }, "", routeForTab(tab));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function dismissDraft(id: string) {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
    setDraftTagInputs((current) => removeRecordKey(current, id));
  }

  function dismissSavedDrafts() {
    setDrafts((current) => current.filter((draft) => !draft.saved));
    setDraftTagInputs((current) => removeRecordKeys(current, drafts.filter((draft) => draft.saved).map((draft) => draft.id)));
  }

  function startSessionEdit(session: TrackerSession) {
    setSessionEdit({
      sessionId: session.id,
      context: {
        grip: session.grip,
        testedAt: toDatetimeLocalValue(session.testedAt),
        hand: session.hand,
        notes: session.notes,
        tags: normalizeTags(session.tags),
      },
    });
    setSessionTagInput("");
  }

  function cancelSessionEdit() {
    setSessionEdit(undefined);
    setSessionTagInput("");
  }

  async function saveSessionEdit(session: TrackerSession) {
    const store = storeRef.current;
    if (!store || !sessionEdit) return;
    const validation = validateImportContext(sessionEdit.context);
    if (!validation.ok) {
      setStatus(validation.errors.join(" "));
      return;
    }

    const updated = updateTrackerSessionMetadata(session, validation.context);
    await store.save(updated);
    await refreshSessions(store);
    setSelectedSessionId(updated.id);
    cancelSessionEdit();
    setStatus("Session updated.");
  }

  const tagSuggestions = useMemo(() => Array.from(new Set([
    ...tagPresets,
    ...sessions.flatMap((session) => normalizeTags(session.tags)),
    ...drafts.flatMap((draft) => normalizeTags(draft.tags)),
  ])).sort(), [drafts, sessions]);
  const visibleImportDrafts = drafts;
  const availableModes = useMemo(() => chartModesForSessions(sessions), [sessions]);
  const effectiveModeFilter = availableModes.includes(modeFilter) ? modeFilter : availableModes[0];
  const gripOptions = useMemo(() => ["all", ...Array.from(new Set(sessions
    .filter((session) => session.mode === effectiveModeFilter)
    .map((session) => session.grip))).sort()], [effectiveModeFilter, sessions]);

  const filteredSessions = sessions.filter((session) =>
    session.mode === effectiveModeFilter &&
    (gripFilter === "all" || session.grip === gripFilter));
  const historySessions = sessions;
  const metricAvailability = useMemo(() => summarizeMetricAvailability(filteredSessions), [filteredSessions]);
  const modeMetricOptions = metricOptionsForMode(effectiveModeFilter);
  const availableMetricOptions = modeMetricOptions.filter((option) => metricAvailability.get(option.key)?.count);
  const unavailableMetricOptions = modeMetricOptions.filter((option) => !metricAvailability.get(option.key)?.count);

  const preferredMetric = preferredMetricForMode(effectiveModeFilter, metricAvailability);
  const effectiveSelectedMetric = selectedMetric !== "all" && !metricAvailability.get(selectedMetric)?.count ? preferredMetric ?? "all" : selectedMetric;
  const selectedMetricKey = effectiveSelectedMetric === "all" ? undefined : effectiveSelectedMetric;
  const progressPoints = filteredSessions.flatMap((session) => progressPointsForSession(session, selectedMetricKey));
  const summaryMetricKey = selectedMetricKey ?? preferredMetric;
  const summaryPoints = summaryMetricKey ? filteredSessions.flatMap((session) => progressPointsForSession(session, summaryMetricKey)) : [];
  const progressSummary = summarizeProgressPoints(progressPoints);
  const latestSummaryPoint = latestProgressPoint(summaryPoints);
  const previousChange = latestComparableChange(summaryPoints);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? historySessions[0];
  const latestSession = filteredSessions[0];
  const latestAverage = latestSession ? primaryAverageMetric(latestSession) : undefined;
  const latestPeak = latestSession ? metricValue(latestSession, "peakForceN") : undefined;
  const latestFilteredSession = filteredSessions[0];
  const personalBest = bestProgressPoint(summaryPoints);
  const weeklyCount = countSessionsThisWeek(sessions);
  const weeklyPercent = Math.min(100, Math.round((weeklyCount / weeklyTarget) * 100));
  const pageHeading = pageHeadingForTab(activeTab);

  return (
    <>
      <header className="app-bar">
        <a className="brand-mark brand-button" href={routeForTab("progress")} onClick={(event) => navigateToTab("progress", event)} aria-label="Tracker progress">
          <span aria-hidden="true">T</span>
          <strong>Tracker</strong>
        </a>
        <nav className="top-nav" aria-label="Primary">
          <TabButton activeTab={activeTab} tab="progress" navigateToTab={navigateToTab}>Progress</TabButton>
          <TabButton activeTab={activeTab} tab="import" navigateToTab={navigateToTab}>Import</TabButton>
          <TabButton activeTab={activeTab} tab="history" navigateToTab={navigateToTab}>History</TabButton>
        </nav>
        <button className="icon-button" type="button" onClick={resetAll}>Reset</button>
      </header>

      <main className="tracker-shell">
        <section className="tracker-welcome" aria-labelledby="tracker-title">
          <div>
            <p className="eyebrow">{pageHeading.eyebrow}</p>
            <h1 id="tracker-title">{pageHeading.title}</h1>
            <p className="lede">{pageHeading.description}</p>
          </div>
          {activeTab !== "progress" && <div className="session-counter" aria-label={`${sessions.length} saved sessions`}>
            <span>{sessions.length}</span>
            <small>saved session{sessions.length === 1 ? "" : "s"}</small>
          </div>}
        </section>

        {status && activeTab !== "progress" && (
          <section className="tracker-panel status-panel" role="status">
            <p>{status}</p>
            <button className="text-button" type="button" onClick={() => setStatus(undefined)}>Dismiss</button>
          </section>
        )}

      {activeTab === "progress" && <section className="tracker-panel progress-panel progress-focus-panel" aria-labelledby="progress-title">
        <div className="panel-heading progress-heading">
          <div>
            <p className="eyebrow">Progress</p>
            <h2 id="progress-title">Over time</h2>
          </div>
          <div className="mode-chip-row" aria-label="Test mode">
            {availableModes.map((mode) => (
              <button
                className={effectiveModeFilter === mode ? "chip chip-selected" : "chip"}
                key={mode}
                type="button"
                onClick={() => {
                  setModeFilter(mode);
                  setSelectedMetric("all");
                  setGripFilter("all");
                }}
              >
                {modeLabel(mode)}
              </button>
            ))}
          </div>
        </div>
        <TrackerProgressChart points={progressPoints} selectedMetric={selectedMetricKey} />
        <div className="plot-chip-area">
          <div className="chip-list plot-chip-list" aria-label="Metric">
            <button
              className={effectiveSelectedMetric === "all" ? "chip chip-selected" : "chip"}
              type="button"
              onClick={() => setSelectedMetric("all")}
            >
              All chartable
            </button>
            {availableMetricOptions.map((option) => (
              <button
                className={effectiveSelectedMetric === option.key ? "chip chip-selected" : "chip"}
                key={option.key}
                type="button"
                onClick={() => setSelectedMetric(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="chip-list plot-chip-list" aria-label="Grip">
            {gripOptions.map((grip) => (
              <button
                className={gripFilter === grip ? "chip chip-selected" : "chip"}
                key={grip}
                type="button"
                onClick={() => setGripFilter(grip)}
              >
                {grip === "all" ? "All grips" : grip}
              </button>
            ))}
          </div>
        </div>
        {reimportNoticeCount > 0 && <p className="notice">{reimportNoticeCount} saved session{reimportNoticeCount === 1 ? "" : "s"} need re-import before all trace-derived force metrics can be derived.</p>}
        <div className="stat-grid stat-grid-compact progress-stat-grid">
          <div className="stat-card">
            <span>Latest</span>
            <strong>{latestSummaryPoint ? formatMetricValue(latestSummaryPoint) : "--"}</strong>
            <small>{latestSummaryPoint ? `${progressMetricLabel(latestSummaryPoint.metricKey, latestSummaryPoint.mode)} on ${formatCompactDate(latestSummaryPoint.testedAt)}` : "No matching data"}</small>
          </div>
          <div className="stat-card">
            <span>Since previous</span>
            <strong>{previousChange ? formatChange(previousChange.delta) : "--"}</strong>
            <small>{previousChange ? `${formatChangePercent(previousChange.percent)} from ${formatCompactDate(previousChange.previous.testedAt)}` : latestFilteredSession ? "No previous matching session" : "No matching data"}</small>
          </div>
          <div className="stat-card">
            <span>Personal best</span>
            <strong>{personalBest ? formatMetricValue(personalBest) : "--"}</strong>
            <small>{personalBest ? progressMetricLabel(personalBest.metricKey, personalBest.mode) : "No chart points"}</small>
          </div>
        </div>
        {(unavailableMetricOptions.length > 0 || progressSummary) && (
          <details className="metric-details">
            <summary>Chart details</summary>
            {progressSummary && <p className="progress-summary">{progressSummary}</p>}
            {unavailableMetricOptions.length > 0 && (
              <p className="metric-help">
                Not charting yet: {unavailableMetricOptions.map((option) => `${option.label} (${metricAvailability.get(option.key)?.reason ?? "no matching sessions"})`).join("; ")}.
              </p>
            )}
          </details>
        )}
      </section>}

        {status && activeTab === "progress" && (
          <section className="tracker-panel status-panel" role="status">
            <p>{status}</p>
            <button className="text-button" type="button" onClick={() => setStatus(undefined)}>Dismiss</button>
          </section>
        )}

        {activeTab === "progress" && <section className="tracker-panel latest-panel" aria-labelledby="latest-title">
          <div className="section-heading">
            <p className="eyebrow">Latest activity</p>
            <h2 id="latest-title">{latestSession ? `${modeLabel(latestSession.mode)} ${formatCompactDate(latestSession.testedAt)}` : "No sessions yet"}</h2>
            {latestSession && <p>{latestSession.grip}{latestSession.hand ? ` - ${latestSession.hand}` : ""}</p>}
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <span>{latestAverage ? formatProgressMetricLabel(latestAverage) : "Primary load"}</span>
              <strong>{latestAverage ? formatMetricValue(latestAverage) : "--"}</strong>
            </div>
            <div className="stat-card">
              <span>{latestPeak ? progressMetricLabel(latestPeak.key, latestSession.mode) : "Peak load"}</span>
              <strong>{latestPeak ? formatMetricValue(latestPeak) : "--"}</strong>
            </div>
          </div>
        </section>}

        {activeTab === "progress" && (
          <section className="tracker-panel weekly-target" aria-labelledby="weekly-target-title">
            <div>
              <p className="eyebrow">Weekly target</p>
              <h2 id="weekly-target-title">{weeklyCount} / {weeklyTarget} sessions</h2>
            </div>
            <div className="target-meter" aria-label={`Weekly target ${weeklyCount} of ${weeklyTarget} sessions`}>
              <div><span style={{ width: `${weeklyPercent}%` }} /></div>
              <small>{weeklyCount >= weeklyTarget ? "Target met" : `${Math.max(weeklyTarget - weeklyCount, 0)} to go this week`}</small>
            </div>
            <label className="target-control">Target
              <input type="number" min="1" max="14" value={weeklyTarget} onChange={(event) => updateWeeklyTarget(Number(event.currentTarget.value))} />
            </label>
          </section>
        )}

        {activeTab === "progress" && authState.status !== "local" && <section className="tracker-panel auth-panel compact-panel" aria-labelledby="auth-title">
          <div>
            <p className="eyebrow">Private data</p>
            <h2 id="auth-title">{authTitle(authState)}</h2>
            <p>{authDescription(authState)}</p>
          </div>
          {authState.status === "signed-in" ? (
            <button className="button button-secondary" type="button" onClick={() => void signOutTracker()}>Sign out</button>
          ) : (
            <div className="auth-actions">
              <label>Email
                <input type="email" value={authEmail} autoComplete="email" placeholder="you@example.com" onChange={(event) => setAuthEmail(event.currentTarget.value)} />
              </label>
              <button className="button" type="button" onClick={() => void requestMagicLink()}>Email sign-in link</button>
            </div>
          )}
        </section>}

      {activeTab === "import" && <section className="tracker-panel import-panel" aria-labelledby="import-title">
        <div>
          <h2 id="import-title">Import</h2>
          <p className="inline-status">Choose Tindeq ZIP or CSV exports, then review each detected file before saving.</p>
        </div>
        <div className="import-actions">
          <label className="file-picker">
            <span className="tile-icon" aria-hidden="true">upload</span>
            <span>Choose Tindeq ZIP or CSVs</span>
            <input type="file" accept=".csv,.zip,text/csv,application/zip" multiple onChange={(event) => void handleFiles(event.currentTarget.files)} />
          </label>
          <div
            className="paste-target"
            onPaste={(event) => void handlePastedFiles(event)}
            role="button"
            tabIndex={0}
            aria-label="Paste Tindeq CSV files"
          >
            <button className="button" type="button" onClick={() => void handleClipboardImport()}>Import from clipboard</button>
            <span>iOS Safari blocks copied ZIP files here. Save or share the Tindeq export to Files, then use the ZIP picker above.</span>
          </div>
        </div>
      </section>}

      {activeTab === "import" && visibleImportDrafts.length > 0 && (
        <section className="draft-list" aria-label="Pending imports">
          {visibleImportDrafts.some((draft) => draft.saved) && (
            <div className="draft-toolbar">
              <button className="text-button" type="button" onClick={dismissSavedDrafts}>Dismiss saved imports</button>
            </div>
          )}
          {visibleImportDrafts.map((draft) => (
            <article className="draft-card" key={draft.id}>
              <div className="draft-card-head">
                <div>
                  <span className="eyebrow">Detected</span>
                  <h3>{draft.filename}</h3>
                  <p>{draft.error ?? `${modeLabel(draft.parsed?.mode)} - ${availableMetricText(draft.parsed)}`}</p>
                </div>
                <div className="draft-card-actions">
                  {draft.parsed && !draft.saved && (
                    <button className="text-button" type="button" onClick={() => updateDraft(draft.id, { expanded: !draft.expanded })}>{draft.expanded ? "Collapse" : "Expand"}</button>
                  )}
                  <button className="text-button" type="button" onClick={() => dismissDraft(draft.id)}>Dismiss</button>
                </div>
              </div>
              {draft.parsed && !draft.saved && draft.expanded && (
                <div className="draft-fields">
                  <fieldset className="chip-field">
                    <legend>Assign grip type</legend>
                    <div className="chip-list">
                      {gripPresets.map((grip) => (
                        <button
                          className={draft.grip === grip ? "chip chip-selected" : "chip"}
                          key={grip}
                          type="button"
                          onClick={() => updateDraft(draft.id, { grip })}
                        >
                          {grip}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label>Date
                    <input type="datetime-local" value={draft.testedAt} onChange={(event) => updateDraft(draft.id, { testedAt: event.currentTarget.value })} />
                  </label>
                  <label>Hand
                    <select value={draft.hand} onChange={(event) => updateDraft(draft.id, { hand: event.currentTarget.value as DraftImport["hand"] })}>
                      <option value="">Not set</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                      <option value="both">Both</option>
                    </select>
                  </label>
                  <label className="draft-notes">Notes
                    <textarea value={draft.notes} onChange={(event) => updateDraft(draft.id, { notes: event.currentTarget.value })} />
                  </label>
                  <TagEditor
                    label="Tags"
                    tags={draft.tags}
                    suggestions={tagSuggestions}
                    inputValue={draftTagInputs[draft.id] ?? ""}
                    onInputChange={(value) => setDraftTagInputs((current) => ({ ...current, [draft.id]: value }))}
                    onAdd={(tag) => updateDraft(draft.id, { tags: addTag(draft.tags, tag) })}
                    onRemove={(tag) => updateDraft(draft.id, { tags: draft.tags.filter((item) => item !== tag) })}
                  />
                  <button className="button" type="button" onClick={() => void saveDraft(draft)}>Save local session</button>
                </div>
              )}
              {draft.saved && <p className="notice compact-notice" role="status">Saved {authState.status === "signed-in" ? "to Supabase" : "locally"}.</p>}
            </article>
          ))}
        </section>
      )}

      {activeTab === "history" && <section className="tracker-grid" aria-label="Saved sessions">
        <div className="tracker-panel history-panel">
          <div className="section-heading">
            <p className="eyebrow">History</p>
            <h2>Sessions</h2>
          </div>
          {historySessions.length === 0 ? <p>No saved sessions yet.</p> : (
            <ul className="session-list">
              {historySessions.map((session) => (
                <li key={session.id}>
                  <button type="button" onClick={() => setSelectedSessionId(session.id)} className={selectedSession?.id === session.id ? "session-select selected-session" : "session-select"}>
                    <span className="session-date">{formatCompactDate(session.testedAt)}</span>
                    <span>
                      <strong>{session.grip}</strong>
                      <small>{modeLabel(session.mode)} - {sessionMetricLine(session)}</small>
                    </span>
                  </button>
                  <button className="text-button" type="button" onClick={() => void deleteSession(session.id)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="tracker-panel detail-panel">
          <div className="section-heading">
            <p className="eyebrow">Session detail</p>
            <h2>CSV Detail</h2>
          </div>
          {selectedSession ? (
            <>
              {sessionEdit?.sessionId === selectedSession.id ? (
                <div className="draft-fields session-edit-form">
                  <fieldset className="chip-field">
                    <legend>Primary grip</legend>
                    <div className="chip-list">
                      {gripPresets.map((grip) => (
                        <button
                          className={sessionEdit.context.grip === grip ? "chip chip-selected" : "chip"}
                          key={grip}
                          type="button"
                          onClick={() => setSessionEdit((current) => current ? { ...current, context: { ...current.context, grip } } : current)}
                        >
                          {grip}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label>Date
                    <input type="datetime-local" value={sessionEdit.context.testedAt} onChange={(event) => {
                      const testedAt = event.currentTarget.value;
                      setSessionEdit((current) => current ? { ...current, context: { ...current.context, testedAt } } : current);
                    }} />
                  </label>
                  <label>Hand
                    <select value={sessionEdit.context.hand ?? ""} onChange={(event) => {
                      const hand = emptyToUndefined(event.currentTarget.value) as ImportContext["hand"];
                      setSessionEdit((current) => current ? { ...current, context: { ...current.context, hand } } : current);
                    }}>
                      <option value="">Not set</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                      <option value="both">Both</option>
                    </select>
                  </label>
                  <label className="draft-notes">Notes
                    <textarea value={sessionEdit.context.notes ?? ""} onChange={(event) => {
                      const notes = event.currentTarget.value;
                      setSessionEdit((current) => current ? { ...current, context: { ...current.context, notes } } : current);
                    }} />
                  </label>
                  <TagEditor
                    label="Tags"
                    tags={normalizeTags(sessionEdit.context.tags)}
                    suggestions={tagSuggestions}
                    inputValue={sessionTagInput}
                    onInputChange={setSessionTagInput}
                    onAdd={(tag) => setSessionEdit((current) => current ? { ...current, context: { ...current.context, tags: addTag(normalizeTags(current.context.tags), tag) } } : current)}
                    onRemove={(tag) => setSessionEdit((current) => current ? { ...current, context: { ...current.context, tags: normalizeTags(current.context.tags).filter((item) => item !== tag) } } : current)}
                  />
                  <div className="form-actions">
                    <button className="button" type="button" onClick={() => void saveSessionEdit(selectedSession)}>Save changes</button>
                    <button className="button button-secondary" type="button" onClick={cancelSessionEdit}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="session-meta">
                    <span>{selectedSession.grip}</span>
                    {selectedSession.hand && <span>{selectedSession.hand}</span>}
                    {normalizeTags(selectedSession.tags).map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <div className="form-actions">
                    <button className="button button-secondary" type="button" onClick={() => startSessionEdit(selectedSession)}>Edit details</button>
                  </div>
                  <dl className="metric-list">
                    {selectedSession.metrics.map((metric) => (
                      <div key={metric.key}>
                        <dt>{metric.label}</dt>
                        <dd>{metric.available ? formatMetricValue(metric) : metric.reason}</dd>
                      </div>
                    ))}
                  </dl>
                  <details className="audit-details">
                    <summary>Source and audit</summary>
                    <dl className="metric-list">
                      <div><dt>Filename</dt><dd>{selectedSession.filename}</dd></div>
                      <div><dt>Parser</dt><dd>{selectedSession.parserVersion}</dd></div>
                      <div><dt>Source</dt><dd>{selectedSession.sourceSummary}</dd></div>
                      <div><dt>Created</dt><dd>{formatCompactDate(selectedSession.createdAt)}</dd></div>
                      <div><dt>Updated</dt><dd>{formatCompactDate(selectedSession.updatedAt ?? selectedSession.createdAt)}</dd></div>
                    </dl>
                    {Object.keys(selectedSession.vendorMetadata).length > 0 && (
                      <div className="audit-block">
                        <h3>Tindeq metadata</h3>
                        <dl className="metric-list">
                          {Object.entries(selectedSession.vendorMetadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
                        </dl>
                      </div>
                    )}
                    {selectedSession.auditLog && selectedSession.auditLog.length > 0 && (
                      <div className="audit-block">
                        <h3>Edit history</h3>
                        <ul className="audit-list">
                          {selectedSession.auditLog.map((entry) => (
                            <li key={entry.id}>
                              <strong>{entry.type === "created" ? "Imported" : "Edited"} {formatCompactDate(entry.createdAt)}</strong>
                              <span>{entry.changes.map((change) => change.field).join(", ")}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </details>
                  <TrackerTraceChart session={selectedSession} />
                </>
              )}
            </>
          ) : <p>Save a CSV to inspect its full trace.</p>}
        </div>
      </section>}
    </main>

      <nav className="bottom-nav" aria-label="Mobile primary">
        <TabButton activeTab={activeTab} tab="progress" navigateToTab={navigateToTab}><span aria-hidden="true">chart</span>Progress</TabButton>
        <TabButton activeTab={activeTab} tab="import" navigateToTab={navigateToTab}><span aria-hidden="true">+</span>Import</TabButton>
        <TabButton activeTab={activeTab} tab="history" navigateToTab={navigateToTab}><span aria-hidden="true">list</span>History</TabButton>
      </nav>
    </>
  );

  function updateDraft(id: string, patch: Partial<DraftImport>) {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  }
}

function TabButton({
  activeTab,
  tab,
  navigateToTab,
  children,
}: Readonly<{
  activeTab: ActiveTab;
  tab: ActiveTab;
  navigateToTab: (tab: ActiveTab, event?: MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
}>) {
  return (
    <a
      className={activeTab === tab ? "tab-button active-tab" : "tab-button"}
      href={routeForTab(tab)}
      aria-current={activeTab === tab ? "page" : undefined}
      onClick={(event) => navigateToTab(tab, event)}
    >
      {children}
    </a>
  );
}

function TagEditor({
  label,
  tags,
  suggestions,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
}: Readonly<{
  label: string;
  tags: readonly string[];
  suggestions: readonly string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}>) {
  const selected = new Set(tags);
  const availableSuggestions = suggestions.filter((tag) => !selected.has(tag)).slice(0, 8);

  function submitTag() {
    const [tag] = normalizeTags([inputValue]);
    if (!tag) return;
    onAdd(tag);
    onInputChange("");
  }

  return (
    <fieldset className="chip-field tag-editor">
      <legend>{label}</legend>
      {tags.length > 0 && (
        <div className="chip-list selected-tags">
          {tags.map((tag) => (
            <button className="chip chip-selected" key={tag} type="button" onClick={() => onRemove(tag)}>
              {tag} ×
            </button>
          ))}
        </div>
      )}
      <div className="tag-input-row">
        <input value={inputValue} placeholder="Add tag" onChange={(event) => onInputChange(event.currentTarget.value)} onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitTag();
          }
        }} />
        <button className="button button-secondary" type="button" onClick={submitTag}>Add</button>
      </div>
      {availableSuggestions.length > 0 && (
        <div className="chip-list">
          {availableSuggestions.map((tag) => (
            <button className="chip" key={tag} type="button" onClick={() => onAdd(tag)}>
              {tag}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function addTag(tags: readonly string[], tag: string) {
  return normalizeTags([...tags, tag]);
}

function readActiveTabFromLocation(fallback: ActiveTab): ActiveTab {
  const url = new URL(window.location.href);
  const pathTab = tabFromPathname(url.pathname);
  if (pathTab) return pathTab;

  const queryTab = url.searchParams.get("view");
  return isActiveTab(queryTab) ? queryTab : fallback;
}

function tabFromPathname(pathname: string): ActiveTab | undefined {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "progress";
  return isActiveTab(segment) ? segment : undefined;
}

function routeForTab(tab: ActiveTab) {
  return tab === "progress" ? "/progress" : `/${tab}`;
}

export function buildMagicLinkRedirectUrl(origin: string, nextPath: string) {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", nextPath);
  return url.toString();
}

function isActiveTab(tab: string | null): tab is ActiveTab {
  return tab === "progress" || tab === "import" || tab === "history";
}

function pageHeadingForTab(tab: ActiveTab) {
  if (tab === "import") {
    return {
      eyebrow: "Import",
      title: "Import data",
      description: "Choose Tindeq ZIP or CSV exports, review the detected files, then save them into your tracker.",
    };
  }

  if (tab === "history") {
    return {
      eyebrow: "History",
      title: "Session history",
      description: "Review saved sessions, inspect raw traces, and edit grip, hand, notes, or tags after import.",
    };
  }

  return {
    eyebrow: "Progress",
    title: "Track grip progress.",
    description: "Follow average and peak force across grip types, modes, and weekly training targets.",
  };
}

function removeRecordKey(record: Record<string, string>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

function removeRecordKeys(record: Record<string, string>, keys: readonly string[]) {
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
}

function emptyToUndefined(value: string) {
  return value === "" ? undefined : value;
}

function toDatetimeLocalValue(value: string) {
  const localMatch = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (localMatch) return localMatch[1];

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function filesFromClipboard(clipboardData: DataTransfer): File[] {
  const files = Array.from(clipboardData.files);
  if (files.length > 0) return files;

  return Array.from(clipboardData.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

function isIosSafari() {
  const userAgent = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(userAgent);
  return isIos && isSafari;
}

async function filesFromClipboardItems(items: readonly ClipboardItem[]): Promise<File[]> {
  const files = await Promise.all(items.flatMap((item) => item.types
    .filter((type) => isClipboardFileType(type))
    .map(async (type) => {
      const blob = await item.getType(type);
      return new File([blob], clipboardFilename(type), { type: blob.type || type, lastModified: Date.now() });
    })));

  return files;
}

function isClipboardFileType(type: string) {
  return type === "text/csv" ||
    type === "application/csv" ||
    type === "application/zip" ||
    type === "application/x-zip-compressed" ||
    type === "application/octet-stream";
}

function clipboardFilename(type: string) {
  if (type === "application/zip" || type === "application/x-zip-compressed" || type === "application/octet-stream") {
    return "clipboard-tindeq-export.zip";
  }

  return "clipboard-tindeq-export.csv";
}

export function createDraftsFromCsvFiles(csvFiles: readonly ExtractedCsvFile[], source: string, now: number) {
  const metadataByBundle = new Map<string, DraftDefaults>();
  for (const file of csvFiles) {
    if (isInfoCsv(file.filename)) {
      metadataByBundle.set(bundleKey(file.filename), parseTindeqInfoCsv(file.source));
    }
  }

  return csvFiles
    .filter((file) => !isInfoCsv(file.filename))
    .map((file, index) => createDraftFromCsv(
      file.source,
      file.filename.trim() || `${source}-tindeq-${index + 1}.csv`,
      `${source}-${index}-${now}-${file.byteSize}`,
      metadataByBundle.get(bundleKey(file.filename)) ?? metadataByBundle.get("loose"),
    ));
}

function isInfoCsv(filename: string) {
  return leafName(filename).toLowerCase() === "info.csv";
}

function bundleKey(filename: string) {
  const separator = filename.indexOf(" / ");
  return separator === -1 ? "loose" : filename.slice(0, separator);
}

function leafName(filename: string) {
  const slash = filename.lastIndexOf("/");
  return slash === -1 ? filename.trim() : filename.slice(slash + 1).trim();
}

function parseTindeqInfoCsv(source: string): DraftDefaults {
  try {
    const rows = parseCsvRows(source.replace(/^\uFEFF/, ""));
    const headers = rows[0] ?? [];
    const values = rows[1] ?? [];
    const metadata = Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ""]));
    const notes = [
      metadata.comment,
      metadata.reps ? `${metadata.reps} reps` : undefined,
      metadata["work dur."] ? `${metadata["work dur."]}s work` : undefined,
      metadata["pause btw. reps"] ? `${metadata["pause btw. reps"]}s rest` : undefined,
      metadata.mvc ? `MVC ${metadata.mvc}` : undefined,
      metadata["Work Level (% of mvc)"] ? `work ${metadata["Work Level (% of mvc)"]}% MVC` : undefined,
      metadata.tag ? `Tindeq tag: ${metadata.tag}` : undefined,
    ].filter(Boolean).join(" - ");

    return {
      grip: gripFromSourceTag(metadata.tag),
      testedAt: parseTindeqInfoDate(metadata.date),
      notes,
    };
  } catch {
    return {};
  }
}

function gripFromSourceTag(value?: string) {
  const sourceTag = value?.trim();
  if (!sourceTag) return undefined;
  const normalizedSource = normalizeGripTag(sourceTag);
  return gripPresets.find((grip) => normalizeGripTag(grip) === normalizedSource) ??
    gripPresets.find((grip) => normalizedSource.startsWith(normalizeGripTag(grip))) ??
    undefined;
}

function normalizeGripTag(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+\d+(?:\.\d+)?\s*kg\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTindeqInfoDate(value?: string) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return undefined;

  const [, year, day, month, hour, minute] = match;
  if (Number(day) < 1 || Number(day) > 31 || Number(month) < 1 || Number(month) > 12) return undefined;
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function createDraftFromCsv(source: string, filename: string, idSuffix: string, defaults: DraftDefaults = {}): DraftImport {
  const detection = detectTindeqCsv(source, filename);
  const csvDefaults = detection.status === "invalid" ? {} : draftDefaultsFromParsedCsv(detection.parsed);
  const mergedDefaults = { ...csvDefaults, ...defaults };
  const base = {
    id: `${filename}-${idSuffix}`,
    filename,
    grip: mergedDefaults.grip ?? "",
    testedAt: mergedDefaults.testedAt ?? new Date().toISOString().slice(0, 16),
    hand: "" as const,
    notes: mergedDefaults.notes ?? "",
    tags: mergedDefaults.tags ?? [],
    expanded: true,
  };
  if (detection.status === "invalid") return { ...base, error: detection.error };
  return {
    ...base,
    parsed: detection.parsed,
    notes: [base.notes, ...detection.parsed.warnings].filter(Boolean).join(" "),
  };
}

function draftDefaultsFromParsedCsv(parsed: ParsedTrackerCsv): DraftDefaults {
  const notes = [
    parsed.vendorMetadata.comment,
    parsed.vendorMetadata.tag ? `Tindeq tag: ${parsed.vendorMetadata.tag}` : undefined,
  ].filter(Boolean).join(" - ");

  return {
    grip: gripFromSourceTag(parsed.vendorMetadata.tag),
    testedAt: parseTindeqInfoDate(parsed.vendorMetadata.date),
    notes: notes || undefined,
  };
}

function modeLabel(mode?: TrackerMode) {
  if (mode === "endurance") return "Endurance";
  if (mode === "repeater") return "Repeater";
  if (mode === "peak_force") return "Peak force";
  if (mode === "unsupported_trace") return "Trace only";
  return "Invalid";
}

function chartModesForSessions(sessions: readonly TrackerSession[]): ChartMode[] {
  const detected = new Set(sessions.flatMap((session) => session.mode === "endurance" || session.mode === "repeater" || session.mode === "peak_force" ? [session.mode] : []));
  const ordered: ChartMode[] = ["repeater", "endurance", "peak_force"];
  return ordered.filter((mode) => detected.size === 0 || detected.has(mode));
}

function authTitle(authState: TrackerAuthState) {
  if (authState.status === "signed-in") return "Supabase sync on";
  if (authState.status === "checking") return "Checking private sync";
  if (authState.status === "local") return "Local browser mode";
  return "Supabase sync off";
}

function authDescription(authState: TrackerAuthState) {
  if (authState.status === "signed-in") return authState.user?.email ? `Signed in as ${authState.user.email}. New sessions save to Supabase.` : "Signed in. New sessions save to Supabase.";
  if (authState.status === "checking") return "Looking for an existing Supabase session.";
  if (authState.status === "local") return "Local demo mode is enabled, so sessions stay in this browser.";
  return "Sign in with your pre-created Supabase user to save sessions privately across devices.";
}

function availableMetricText(parsed?: ParsedTrackerCsv) {
  if (!parsed) return "No metrics";
  const available = parsed.metrics.filter((metric) => metric.available);
  if (available.length === 0) return "trace inspection only";
  return available.map((metric) => metric.label).join(", ");
}

function metricOptionsForMode(mode: ChartMode): MetricOption[] {
  return metricOptions
    .filter((option) => !option.mode || option.mode === mode)
    .map((option) => ({ ...option, label: progressMetricLabel(option.key, mode) }));
}

function preferredMetricForMode(
  mode: ChartMode,
  availability: ReadonlyMap<TrackerMetricKey, { count: number; reason?: string }>,
): TrackerMetricKey | undefined {
  const preferredOrder: TrackerMetricKey[] = mode === "endurance"
    ? ["enduranceAverageForceN", "peakForceN", "criticalForceN"]
    : mode === "repeater"
      ? ["repeaterAverageForceN", "peakForceN"]
      : ["peakForceN"];

  return preferredOrder.find((key) => availability.get(key)?.count);
}

function progressMetricLabel(key: TrackerMetricKey, mode?: TrackerMode) {
  if (key === "criticalForceN") return "Critical force";
  if (key === "enduranceAverageForceN") return "Endurance average force";
  if (key === "repeaterAverageForceN") return "Repeater average force";
  if (mode === "endurance") return "Endurance max force";
  if (mode === "repeater") return "Repeater max force";
  if (mode === "peak_force") return "Peak force max";
  return "Max force";
}

function primaryAverageMetric(session: TrackerSession) {
  return metricValue(session, "repeaterAverageForceN") ??
    metricValue(session, "enduranceAverageForceN") ??
    metricValue(session, "criticalForceN");
}

function metricValue(session: TrackerSession, key: TrackerMetricKey): AvailableMetric | undefined {
  return session.metrics.find((metric): metric is AvailableMetric => metric.key === key && metric.available);
}

function sessionMetricLine(session: TrackerSession) {
  const average = primaryAverageMetric(session);
  const peak = metricValue(session, "peakForceN");
  if (average && peak) return `${formatMetricValue(average)} avg / ${formatMetricValue(peak)} peak`;
  if (average) return `${formatMetricValue(average)} ${formatProgressMetricLabel(average).toLowerCase()}`;
  if (peak) return `${formatMetricValue(peak)} peak`;
  return "trace only";
}

function bestProgressPoint(points: readonly ProgressPoint[]) {
  return points.reduce<ProgressPoint | undefined>((best, point) => {
    if (!best || point.value > best.value) return point;
    return best;
  }, undefined);
}

function latestProgressPoint(points: readonly ProgressPoint[]) {
  return [...points].sort((a, b) => Date.parse(b.testedAt) - Date.parse(a.testedAt))[0];
}

function latestComparableChange(points: readonly ProgressPoint[]) {
  const latest = latestProgressPoint(points);
  if (!latest) return undefined;
  const previous = [...points]
    .filter((point) =>
      point.sessionId !== latest.sessionId &&
      point.mode === latest.mode &&
      point.grip === latest.grip &&
      (point.hand ?? "") === (latest.hand ?? "") &&
      point.metricKey === latest.metricKey &&
      Date.parse(point.testedAt) <= Date.parse(latest.testedAt))
    .sort((a, b) => Date.parse(b.testedAt) - Date.parse(a.testedAt))[0];
  if (!previous) return undefined;
  const delta = latest.value - previous.value;
  return {
    latest,
    previous,
    delta,
    percent: previous.value === 0 ? undefined : delta / previous.value,
  };
}

function formatChange(deltaN: number) {
  const sign = deltaN > 0 ? "+" : "";
  return `${sign}${formatMetricValue({ key: "peakForceN", value: deltaN, unit: "N" })}`;
}

function formatChangePercent(value: number | undefined) {
  if (value === undefined) return "change";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value * 100)}%`;
}

function readWeeklyTarget() {
  try {
    return normalizeWeeklyTarget(Number(window.localStorage.getItem(weeklyTargetStorageKey)));
  } catch {
    return undefined;
  }
}

export function normalizeWeeklyTarget(value: number) {
  if (!Number.isFinite(value)) return undefined;
  return Math.max(1, Math.min(14, Math.round(value)));
}

function persistWeeklyTarget(value: number) {
  try {
    window.localStorage.setItem(weeklyTargetStorageKey, String(value));
  } catch {
    // The target still updates for this session when browser storage is blocked.
  }
}

export function countSessionsThisWeek(sessions: readonly TrackerSession[], now = new Date()) {
  const weekStart = startOfLocalWeek(now);
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  return sessions.filter((session) => {
    const testedAt = new Date(session.testedAt);
    return testedAt >= weekStart && testedAt < nextWeekStart;
  }).length;
}

function startOfLocalWeek(value: Date) {
  const start = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  return start;
}

function summarizeMetricAvailability(sessions: readonly TrackerSession[]) {
  const summary = new Map<TrackerMetricKey, { count: number; reason?: string }>();
  for (const option of metricOptions) summary.set(option.key, { count: 0 });

  for (const session of sessions) {
    for (const metric of session.metrics) {
      const current = summary.get(metric.key) ?? { count: 0 };
      if (metric.available) {
        summary.set(metric.key, { count: current.count + 1, reason: current.reason });
      } else {
        summary.set(metric.key, { ...current, reason: current.reason ?? metric.reason });
      }
    }
  }

  return summary;
}

function summarizeProgressPoints(points: readonly ProgressPoint[]) {
  if (points.length === 0) return undefined;
  const latest = [...points].sort((a, b) => Date.parse(b.testedAt) - Date.parse(a.testedAt))[0];
  const seriesCount = new Set(points.map((point) => [point.mode, point.grip, point.hand ?? "any", point.metricKey].join(":"))).size;
  return `${points.length} point${points.length === 1 ? "" : "s"} across ${seriesCount} series. Latest: ${formatProgressMetricLabel(latest)} ${formatMetricValue(latest)} on ${formatCompactDate(latest.testedAt)}.`;
}
