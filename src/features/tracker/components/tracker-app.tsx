"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TrackerProgressChart } from "@/components/charts/tracker-progress-chart";
import { TrackerTraceChart } from "@/components/charts/tracker-trace-chart";
import { detectTindeqCsv } from "@/features/tracker/parsers/detect";
import { buildTrackerSession, progressPointsForSession, validateImportContext, type ParsedTrackerCsv, type TrackerMetricKey, type TrackerMode, type TrackerSession } from "@/features/tracker/types";
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

const metricOptions: { key: TrackerMetricKey; label: string; mode?: TrackerMode }[] = [
  { key: "criticalForceN", label: "Critical force", mode: "endurance" },
  { key: "repeaterAverageForceN", label: "Repeater average force", mode: "repeater" },
  { key: "peakForceN", label: "Peak force" },
];

const gripPresets = ["20mm edge", "15mm edge", "half crimp", "open hand", "pinch", "jug"];

export function TrackerApp() {
  const storeRef = useRef<TrackerStore | null>(null);
  const [sessions, setSessions] = useState<TrackerSession[]>([]);
  const [drafts, setDrafts] = useState<DraftImport[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<TrackerMetricKey>("criticalForceN");
  const [modeFilter, setModeFilter] = useState<"all" | TrackerMode>("all");
  const [gripFilter, setGripFilter] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [pastedCsv, setPastedCsv] = useState("");
  const [status, setStatus] = useState("Loading local tracker data...");

  useEffect(() => {
    const store = createTrackerStore();
    storeRef.current = store;
    void refreshSessions(store).then(() => setStatus("Local tracker ready."));
  }, []);

  async function refreshSessions(store = storeRef.current) {
    if (!store) return;
    setSessions(await store.list());
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const nextDrafts = await Promise.all(Array.from(files).map(async (file) => {
      return createDraftFromCsv(await file.text(), file.name, `${file.lastModified}-${file.size}`);
    }));
    setDrafts((current) => [...nextDrafts, ...current]);
    setStatus(`${nextDrafts.length} file${nextDrafts.length === 1 ? "" : "s"} ready to review.`);
  }

  function handlePasteImport() {
    if (!pastedCsv.trim()) {
      setStatus("Paste a Tindeq CSV export first.");
      return;
    }

    const draft = createDraftFromCsv(pastedCsv, `pasted-tindeq-${new Date().toISOString().slice(0, 19)}.csv`, `paste-${Date.now()}`);
    setDrafts((current) => [draft, ...current]);
    setPastedCsv("");
    setStatus(draft.error ? "Pasted CSV could not be parsed." : "Pasted CSV ready to review.");
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
    await store.delete(id);
    await refreshSessions(store);
    if (selectedSessionId === id) setSelectedSessionId(undefined);
    setStatus("Session deleted.");
  }

  async function resetAll() {
    if (!window.confirm("Delete all local Tindeq tracker data from this browser?")) return;
    const store = storeRef.current;
    if (!store) return;
    await store.clear();
    await refreshSessions(store);
    setSelectedSessionId(undefined);
    setStatus("Local tracker data cleared.");
  }

  const grips = useMemo(() => ["all", ...Array.from(new Set(sessions.map((session) => session.grip))).sort()], [sessions]);
  const filteredSessions = sessions.filter((session) =>
    (modeFilter === "all" || session.mode === modeFilter) &&
    (gripFilter === "all" || session.grip === gripFilter));
  const progressPoints = filteredSessions.flatMap((session) => progressPointsForSession(session, selectedMetric));
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? filteredSessions[0];
  const traceOnlyCount = filteredSessions.length - new Set(progressPoints.map((point) => point.sessionId)).size;

  return (
    <main className="tracker-shell">
      <header className="tracker-header">
        <div>
          <p className="eyebrow">Personal Tindeq tracker</p>
          <h1>Track grip progress from CSVs.</h1>
          <p className="lede">Import Endurance and Repeater exports, tag the grip, and keep the progress graph local to this browser.</p>
        </div>
        <button className="button button-quiet" type="button" onClick={resetAll}>Reset</button>
      </header>

      <section className="tracker-panel import-panel" aria-labelledby="import-title">
        <div>
          <h2 id="import-title">Import</h2>
          <p>{status}</p>
        </div>
        <div className="import-actions">
          <label className="file-picker">
            <span>Choose Tindeq CSVs</span>
            <input type="file" accept=".csv,text/csv" multiple onChange={(event) => void handleFiles(event.currentTarget.files)} />
          </label>
          <div className="paste-box">
            <label>Paste CSV output
              <textarea
                value={pastedCsv}
                onChange={(event) => setPastedCsv(event.currentTarget.value)}
                placeholder={"critical force,...\ntime,weight"}
              />
            </label>
            <button className="button button-quiet" type="button" onClick={handlePasteImport}>Add pasted CSV</button>
          </div>
        </div>
      </section>

      {drafts.length > 0 && (
        <section className="draft-list" aria-label="Pending imports">
          {drafts.map((draft) => (
            <article className="draft-card" key={draft.id}>
              <div>
                <h3>{draft.filename}</h3>
                <p>{draft.error ?? `${modeLabel(draft.parsed?.mode)} - ${availableMetricText(draft.parsed)}`}</p>
              </div>
              {draft.parsed && !draft.saved && (
                <div className="draft-fields">
                  <label>Grip
                    <input list="grip-presets" value={draft.grip} onChange={(event) => updateDraft(draft.id, { grip: event.currentTarget.value })} placeholder="20mm edge" />
                  </label>
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
                  <label>Notes
                    <textarea value={draft.notes} onChange={(event) => updateDraft(draft.id, { notes: event.currentTarget.value })} />
                  </label>
                  <button className="button" type="button" onClick={() => void saveDraft(draft)}>Save local session</button>
                </div>
              )}
              {draft.saved && <p className="notice" role="status">Saved locally.</p>}
            </article>
          ))}
          <datalist id="grip-presets">
            {gripPresets.map((grip) => <option key={grip} value={grip} />)}
          </datalist>
        </section>
      )}

      <section className="tracker-panel" aria-labelledby="progress-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Progress</p>
            <h2 id="progress-title">Over time</h2>
          </div>
          <div className="filters">
            <label>Metric
              <select value={selectedMetric} onChange={(event) => setSelectedMetric(event.currentTarget.value as TrackerMetricKey)}>
                {metricOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
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
        <TrackerProgressChart points={progressPoints} selectedMetric={selectedMetric} />
        {traceOnlyCount > 0 && <p className="notice">{traceOnlyCount} saved session{traceOnlyCount === 1 ? "" : "s"} are trace-only for this metric.</p>}
      </section>

      <section className="tracker-grid" aria-label="Saved sessions">
        <div className="tracker-panel">
          <h2>Sessions</h2>
          {filteredSessions.length === 0 ? <p>No saved sessions match these filters.</p> : (
            <ul className="session-list">
              {filteredSessions.map((session) => (
                <li key={session.id}>
                  <button type="button" onClick={() => setSelectedSessionId(session.id)} className={selectedSession?.id === session.id ? "selected-session" : ""}>
                    <strong>{session.grip}</strong>
                    <span>{modeLabel(session.mode)} - {new Date(session.testedAt).toLocaleDateString()}</span>
                  </button>
                  <button className="text-button" type="button" onClick={() => void deleteSession(session.id)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="tracker-panel">
          <h2>CSV Detail</h2>
          {selectedSession ? (
            <>
              <dl className="metric-list">
                {selectedSession.metrics.map((metric) => (
                  <div key={metric.key}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.available ? `${metric.value.toFixed(2)} ${metric.unit}` : metric.reason}</dd>
                  </div>
                ))}
              </dl>
              <TrackerTraceChart session={selectedSession} />
            </>
          ) : <p>Save a CSV to inspect its full trace.</p>}
        </div>
      </section>
    </main>
  );

  function updateDraft(id: string, patch: Partial<DraftImport>) {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  }
}

function createDraftFromCsv(source: string, filename: string, idSuffix: string): DraftImport {
  const detection = detectTindeqCsv(source, filename);
  const base = {
    id: `${filename}-${idSuffix}`,
    filename,
    grip: "",
    testedAt: new Date().toISOString().slice(0, 16),
    hand: "" as const,
    notes: "",
  };
  if (detection.status === "invalid") return { ...base, error: detection.error };
  return { ...base, parsed: detection.parsed, notes: detection.parsed.warnings.join(" ") };
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
