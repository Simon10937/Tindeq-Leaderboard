"use client";

import { type ClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { TrackerProgressChart } from "@/components/charts/tracker-progress-chart";
import { TrackerTraceChart } from "@/components/charts/tracker-trace-chart";
import { formatCompactDate, formatMetricValue, formatProgressMetricLabel } from "@/components/charts/chart-utils";
import { extractCsvFiles, type ExtractedCsvFile } from "@/features/tracker/import/extract-files";
import { detectTindeqCsv } from "@/features/tracker/parsers/detect";
import { augmentStoredRepeaterMetrics } from "@/features/tracker/parsers/repeater";
import { parseCsvRows } from "@/features/tracker/parsers/tindeq-shared";
import { buildTrackerSession, progressPointsForSession, validateImportContext, type ParsedTrackerCsv, type ProgressPoint, type TrackerMetricKey, type TrackerMode, type TrackerSession } from "@/features/tracker/types";
import { createTrackerStore, type TrackerStore } from "@/features/tracker/storage/local-store";

type DraftImport = Readonly<{
  id: string;
  filename: string;
  parsed?: ParsedTrackerCsv;
  error?: string;
  grip: string;
  testedAt: string;
  hand: "" | "left" | "right" | "both";
  notes: string;
  saved?: boolean;
}>;

type DraftDefaults = Partial<Pick<DraftImport, "grip" | "testedAt" | "notes">>;
type SelectedMetric = "all" | TrackerMetricKey;
type AvailableMetric = Extract<TrackerSession["metrics"][number], { available: true }>;

const metricOptions: { key: TrackerMetricKey; label: string; mode?: TrackerMode }[] = [
  { key: "criticalForceN", label: "Critical force", mode: "endurance" },
  { key: "repeaterAverageForceN", label: "Repeater average force", mode: "repeater" },
  { key: "peakForceN", label: "Peak force" },
];

const gripPresets = ["20mm edge", "15mm edge", "half crimp", "rehab half crimp", "open hand", "pinch", "jug"];
const weeklyTargetStorageKey = "tindeq-tracker-weekly-target";

export function TrackerApp() {
  const storeRef = useRef<TrackerStore | null>(null);
  const refreshGenerationRef = useRef(0);
  const [sessions, setSessions] = useState<TrackerSession[]>([]);
  const [drafts, setDrafts] = useState<DraftImport[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<SelectedMetric>("all");
  const [modeFilter, setModeFilter] = useState<"all" | TrackerMode>("all");
  const [gripFilter, setGripFilter] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [status, setStatus] = useState("Loading local tracker data...");
  const [reimportNoticeCount, setReimportNoticeCount] = useState(0);
  const [weeklyTarget, setWeeklyTarget] = useState(3);

  useEffect(() => {
    const store = createTrackerStore();
    storeRef.current = store;
    void refreshSessions(store).then(() => setStatus("Local tracker ready."));
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
    const normalized = storedSessions.map((session) => augmentStoredRepeaterMetrics(session));
    if (generation !== refreshGenerationRef.current) return;

    await Promise.all(normalized.filter((result) => result.changed).map(async (result) => {
      if (generation !== refreshGenerationRef.current) return;
      const current = await store.get(result.session.id);
      if (!current || generation !== refreshGenerationRef.current) return;
      await store.save(result.session);
    }));
    if (generation !== refreshGenerationRef.current) return;

    setReimportNoticeCount(normalized.filter((result) => result.needsReimport).length);
    setSessions(normalized.map((result) => result.session));
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
    });
    if (!validation.ok) {
      setStatus(validation.errors.join(" "));
      return;
    }

    await store.save(buildTrackerSession(draft.parsed, validation.context));
    await refreshSessions(store);
    setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, saved: true } : item));
    setStatus(`${draft.filename} saved locally.`);
  }

  async function deleteSession(id: string) {
    const store = storeRef.current;
    if (!store) return;
    refreshGenerationRef.current += 1;
    await store.delete(id);
    await refreshSessions(store);
    if (selectedSessionId === id) setSelectedSessionId(undefined);
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

  const grips = useMemo(() => ["all", ...Array.from(new Set([...gripPresets, ...sessions.map((session) => session.grip)])).sort()], [sessions]);
  const filteredSessions = sessions.filter((session) =>
    (modeFilter === "all" || session.mode === modeFilter) &&
    (gripFilter === "all" || session.grip === gripFilter));
  const metricAvailability = useMemo(() => summarizeMetricAvailability(filteredSessions), [filteredSessions]);
  const availableMetricOptions = metricOptions.filter((option) => metricAvailability.get(option.key)?.count);
  const unavailableMetricOptions = metricOptions.filter((option) => !metricAvailability.get(option.key)?.count);

  const effectiveSelectedMetric = selectedMetric !== "all" && !metricAvailability.get(selectedMetric)?.count ? "all" : selectedMetric;
  const selectedMetricKey = effectiveSelectedMetric === "all" ? undefined : effectiveSelectedMetric;
  const progressPoints = filteredSessions.flatMap((session) => progressPointsForSession(session, selectedMetricKey));
  const progressSummary = summarizeProgressPoints(progressPoints);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? filteredSessions[0];
  const traceOnlyCount = filteredSessions.length - new Set(progressPoints.map((point) => point.sessionId)).size;
  const latestSession = sessions[0];
  const latestAverage = latestSession ? metricValue(latestSession, "repeaterAverageForceN") ?? metricValue(latestSession, "criticalForceN") : undefined;
  const latestPeak = latestSession ? metricValue(latestSession, "peakForceN") : undefined;
  const latestFilteredSession = filteredSessions[0];
  const latestFilteredAverage = latestFilteredSession ? metricValue(latestFilteredSession, "repeaterAverageForceN") ?? metricValue(latestFilteredSession, "criticalForceN") : undefined;
  const personalBest = bestProgressPoint(progressPoints);
  const weeklyCount = countSessionsThisWeek(sessions);
  const weeklyPercent = Math.min(100, Math.round((weeklyCount / weeklyTarget) * 100));

  return (
    <>
      <header className="app-bar">
        <a className="brand-mark" href="#progress" aria-label="Tracker progress">
          <span aria-hidden="true">T</span>
          <strong>Tracker</strong>
        </a>
        <nav className="top-nav" aria-label="Primary">
          <a href="#progress">Progress</a>
          <a href="#import">Import</a>
          <a href="#history">History</a>
        </nav>
        <button className="icon-button" type="button" onClick={resetAll}>Reset</button>
      </header>

      <main className="tracker-shell">
        <section className="tracker-welcome" aria-labelledby="tracker-title">
          <div>
            <p className="eyebrow">Personal Tindeq tracker</p>
            <h1 id="tracker-title">Track grip progress.</h1>
            <p className="lede">Upload Tindeq exports, tag the grip, and keep the important chart local to this browser.</p>
          </div>
          <div className="session-counter" aria-label={`${sessions.length} saved sessions`}>
            <span>{sessions.length}</span>
            <small>saved session{sessions.length === 1 ? "" : "s"}</small>
          </div>
        </section>

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

        <section className="quick-actions" aria-label="Quick actions">
          <a className="action-tile action-primary" href="#import">
            <span aria-hidden="true">+</span>
            <strong>Import new data</strong>
          </a>
          <a className="action-tile" href="#progress">
            <span aria-hidden="true">chart</span>
            <strong>View progress</strong>
          </a>
          <a className="action-tile" href="#history">
            <span aria-hidden="true">list</span>
            <strong>Session history</strong>
          </a>
        </section>

        <section className="tracker-panel latest-panel" aria-labelledby="latest-title">
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
              <span>{latestPeak ? latestPeak.label : "Peak load"}</span>
              <strong>{latestPeak ? formatMetricValue(latestPeak) : "--"}</strong>
            </div>
          </div>
        </section>

      <section className="tracker-panel import-panel" id="import" aria-labelledby="import-title">
        <div>
          <h2 id="import-title">Import</h2>
          <p>{status}</p>
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
      </section>

      {drafts.length > 0 && (
        <section className="draft-list" aria-label="Pending imports">
          {drafts.map((draft) => (
            <article className="draft-card" key={draft.id}>
              <div className="draft-card-head">
                <div>
                  <span className="eyebrow">Detected</span>
                  <h3>{draft.filename}</h3>
                  <p>{draft.error ?? `${modeLabel(draft.parsed?.mode)} - ${availableMetricText(draft.parsed)}`}</p>
                </div>
              </div>
              {draft.parsed && !draft.saved && (
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
                  <button className="button" type="button" onClick={() => void saveDraft(draft)}>Save local session</button>
                </div>
              )}
              {draft.saved && <p className="notice" role="status">Saved locally.</p>}
            </article>
          ))}
        </section>
      )}

      <section className="tracker-panel progress-panel" id="progress" aria-labelledby="progress-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Progress</p>
            <h2 id="progress-title">Over time</h2>
          </div>
          <div className="filters">
            <label>Metric
              <select value={effectiveSelectedMetric} onChange={(event) => setSelectedMetric(event.currentTarget.value as SelectedMetric)}>
                <option value="all">All chartable</option>
                {availableMetricOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </label>
            <label>Mode
              <select value={modeFilter} onChange={(event) => setModeFilter(event.currentTarget.value as "all" | TrackerMode)}>
                <option value="all">All</option>
                <option value="endurance">Endurance</option>
                <option value="repeater">Repeater</option>
                <option value="unsupported_trace">Trace only</option>
              </select>
            </label>
            <label>Grip
              <select value={gripFilter} onChange={(event) => setGripFilter(event.currentTarget.value)}>
                {grips.map((grip) => <option key={grip} value={grip}>{grip === "all" ? "All" : grip}</option>)}
              </select>
            </label>
          </div>
        </div>
        {unavailableMetricOptions.length > 0 && (
          <p className="metric-help">
            Not charting yet: {unavailableMetricOptions.map((option) => `${option.label} (${metricAvailability.get(option.key)?.reason ?? "no matching sessions"})`).join("; ")}.
          </p>
        )}
        {progressSummary && <p className="progress-summary">{progressSummary}</p>}
        <div className="stat-grid stat-grid-compact">
          <div className="stat-card">
            <span>Latest</span>
            <strong>{latestFilteredAverage ? formatMetricValue(latestFilteredAverage) : "--"}</strong>
            <small>{latestFilteredSession ? formatCompactDate(latestFilteredSession.testedAt) : "No matching data"}</small>
          </div>
          <div className="stat-card">
            <span>Best plotted</span>
            <strong>{personalBest ? formatMetricValue(personalBest) : "--"}</strong>
            <small>{personalBest ? formatProgressMetricLabel(personalBest) : "No chart points"}</small>
          </div>
        </div>
        <TrackerProgressChart points={progressPoints} selectedMetric={selectedMetricKey} />
        {traceOnlyCount > 0 && <p className="notice">{traceOnlyCount} saved session{traceOnlyCount === 1 ? "" : "s"} are trace-only for {effectiveSelectedMetric === "all" ? "these metrics" : "this metric"}.</p>}
        {reimportNoticeCount > 0 && <p className="notice">{reimportNoticeCount} saved Repeater session{reimportNoticeCount === 1 ? "" : "s"} need re-import before estimated average or peak force can be derived.</p>}
      </section>

      <section className="tracker-grid" id="history" aria-label="Saved sessions">
        <div className="tracker-panel history-panel">
          <div className="section-heading">
            <p className="eyebrow">History</p>
            <h2>Sessions</h2>
          </div>
          {filteredSessions.length === 0 ? <p>No saved sessions match these filters.</p> : (
            <ul className="session-list">
              {filteredSessions.map((session) => (
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
              <dl className="metric-list">
                {selectedSession.metrics.map((metric) => (
                  <div key={metric.key}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.available ? formatMetricValue(metric) : metric.reason}</dd>
                  </div>
                ))}
              </dl>
              <TrackerTraceChart session={selectedSession} />
            </>
          ) : <p>Save a CSV to inspect its full trace.</p>}
        </div>
      </section>
    </main>

      <nav className="bottom-nav" aria-label="Mobile primary">
        <a href="#progress"><span aria-hidden="true">chart</span>Progress</a>
        <a href="#import"><span aria-hidden="true">+</span>Import</a>
        <a href="#history"><span aria-hidden="true">list</span>History</a>
      </nav>
    </>
  );

  function updateDraft(id: string, patch: Partial<DraftImport>) {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  }
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

  const [, year, middle, last, hour, minute] = match;
  const month = Number(middle) > 12 ? last : middle;
  const day = Number(middle) > 12 ? middle : last;
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function createDraftFromCsv(source: string, filename: string, idSuffix: string, defaults: DraftDefaults = {}): DraftImport {
  const detection = detectTindeqCsv(source, filename);
  const base = {
    id: `${filename}-${idSuffix}`,
    filename,
    grip: defaults.grip ?? "",
    testedAt: defaults.testedAt ?? new Date().toISOString().slice(0, 16),
    hand: "" as const,
    notes: defaults.notes ?? "",
  };
  if (detection.status === "invalid") return { ...base, error: detection.error };
  return {
    ...base,
    parsed: detection.parsed,
    notes: [defaults.notes, ...detection.parsed.warnings].filter(Boolean).join(" "),
  };
}

function modeLabel(mode?: TrackerMode) {
  if (mode === "endurance") return "Endurance";
  if (mode === "repeater") return "Repeater";
  if (mode === "unsupported_trace") return "Trace only";
  return "Invalid";
}

function availableMetricText(parsed?: ParsedTrackerCsv) {
  if (!parsed) return "No metrics";
  const available = parsed.metrics.filter((metric) => metric.available);
  if (available.length === 0) return "trace inspection only";
  return available.map((metric) => metric.label).join(", ");
}

function metricValue(session: TrackerSession, key: TrackerMetricKey): AvailableMetric | undefined {
  return session.metrics.find((metric): metric is AvailableMetric => metric.key === key && metric.available);
}

function sessionMetricLine(session: TrackerSession) {
  const average = metricValue(session, "repeaterAverageForceN") ?? metricValue(session, "criticalForceN");
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
