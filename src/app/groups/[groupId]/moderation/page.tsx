import { AppShell } from "@/components/app-shell";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { getGroup, listGroups } from "@/features/groups/queries";
import { moderateAttempt, reviewEvidence } from "@/features/assessments/moderation/actions";
import { listModerationRows } from "@/features/assessments/moderation/queries";

export default async function ModerationPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ message?: string }> }) {
  const { groupId } = await params;
  const [{ profile, groups }, group, rows, { message }] = await Promise.all([listGroups(), getGroup(groupId), listModerationRows(groupId), searchParams]);
  const canManage = group.membership.role === "owner" || group.membership.role === "admin";
  return <AppShell profileName={profile.display_name} groups={groups} activeGroupId={groupId}>
    <header className="page-header"><p className="eyebrow">Admin controls</p><h1>Moderation</h1><p>Review source evidence before verifying a result. Every action is recorded.</p></header>
    {message && <p className="notice" role="status">{message}</p>}
    {!canManage ? <section className="panel"><p>Only group owners and admins can moderate results.</p></section> : <section className="panel table-scroll"><table><caption className="sr-only">Attempts available for moderation</caption><thead><tr><th>Member</th><th>Protocol</th><th>Hand</th><th>Date</th><th>Score</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.attempt_id}><td>{row.owner_display_name}</td><td>{row.protocol_name}</td><td>{row.hand}</td><td>{new Date(row.declared_test_at).toLocaleDateString("en-GB")}</td><td>{row.primary_metric?.toFixed(1) ?? "—"}</td><td>{row.ingestion_status} · {row.moderation_status} · {row.trust_status}</td><td className="moderation-actions">
        <form action={reviewEvidence}><input type="hidden" name="groupId" value={groupId}/><input type="hidden" name="attemptId" value={row.attempt_id}/><label>Review reason<input name="reason" minLength={8} maxLength={500} required/></label><button className="button button-quiet">Download evidence</button></form>
        <form action={moderateAttempt}><input type="hidden" name="groupId" value={groupId}/><input type="hidden" name="attemptId" value={row.attempt_id}/><label>Action reason<input name="reason" minLength={8} maxLength={500} required/></label><select name="moderationAction" defaultValue={row.moderation_status === "invalidated" ? "restore" : "invalidate"}><option value="invalidate">Invalidate</option><option value="restore">Restore</option><option value="verify">Verify after review</option></select><ConfirmSubmit confirmation="Apply this ranking-changing moderation action?">Apply</ConfirmSubmit></form>
      </td></tr>)}{!rows.length && <tr><td colSpan={7}>No attempts are available yet.</td></tr>}
    </tbody></table></section>}
  </AppShell>;
}
