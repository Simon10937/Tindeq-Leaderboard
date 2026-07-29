"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { finalizeRfdAttempt, prepareUploadManifest, publishAssessmentSession } from "@/features/assessments/upload/actions";
import { validateCsvFiles } from "@/features/assessments/upload/validation";

export function SessionUpload({ groupId, protocolVersionId }: { groupId: string; protocolVersionId: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    const errors = validateCsvFiles(files);
    if (errors.length) return setMessage(errors.join(" "));
    setBusy(true);
    setMessage("Preparing private upload…");
    try {
      const weight = Number(formData.get("bodyWeightKg"));
      const prepared = await prepareUploadManifest({
        groupId,
        protocolVersionId,
        hand: String(formData.get("hand")) as "left" | "right",
        declaredAt: new Date(String(formData.get("declaredAt"))).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        bodyWeightKg: weight > 0 ? weight : undefined,
        protocolAdherence: true,
        files: files.map(({ name, size, type }) => ({ name, size, type })),
      });
      const client = createClient();
      for (const [index, upload] of prepared.uploads.entries()) {
        setMessage(`Uploading attempt ${index + 1} of ${files.length}…`);
        const { error } = await client.storage.from("assessment-evidence").uploadToSignedUrl(upload.path, upload.token, files[index], { contentType: "text/csv" });
        if (error) throw new Error(`Attempt ${index + 1} upload failed.`);
        const result = await finalizeRfdAttempt(upload.attemptId);
        if (result.status !== "ready") throw new Error(`Attempt ${index + 1} could not be parsed: ${result.reason}`);
      }
      const publication = await publishAssessmentSession(prepared.sessionId);
      const failureMessage = publication.reason === "oracle_not_approved"
        ? "Attempts stored privately. Ranking remains disabled until the independent RFD oracle is approved."
        : publication.reason === "session_unresolved"
          ? "Some attempts still need processing or exclusion before this session can be published."
          : "Attempts were stored, but publication failed. Please retry.";
      setMessage(publication.published ? "Session published to the group leaderboard." : failureMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed. Retry the affected files.");
    } finally {
      setBusy(false);
    }
  }

  return <form action={submit} className="protocol-form"><label>Hand<select name="hand" defaultValue="left"><option value="left">Left</option><option value="right">Right</option></select></label><label>Test date and time<input name="declaredAt" type="datetime-local" required/></label><label>Body weight (kg, optional)<input name="bodyWeightKg" type="number" min="1" step="0.1"/></label><label>Attempt CSV files<input name="files" type="file" accept=".csv,text/csv" multiple required/></label><label className="check"><input name="adherence" type="checkbox" required/> I followed the protocol setup, warm-up, body position, device placement, execution, attempt, and recovery rules.</label><button className="button" disabled={busy}>{busy ? "Working…" : "Upload attempts"}</button>{message && <p className="notice" role="status">{message}</p>}</form>;
}
