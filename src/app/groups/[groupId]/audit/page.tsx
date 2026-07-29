import { AppShell } from "@/components/app-shell";
import { getGroup, listGroups } from "@/features/groups/queries";
import { listGroupAuditEvents } from "@/features/audit/queries";

export default async function AuditPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [{ profile, groups }, group, events] = await Promise.all([listGroups(), getGroup(groupId), listGroupAuditEvents(groupId)]);
  const canManage = group.membership.role === "owner" || group.membership.role === "admin";
  return <AppShell profileName={profile.display_name} groups={groups} activeGroupId={groupId}>
    <header className="page-header"><p className="eyebrow">Accountability</p><h1>Audit trail</h1><p>Minimized records explain group and ranking changes. Actor references are pseudonymized after deletion, but context may still allow inference.</p></header>
    {!canManage ? <section className="panel"><p>Only group owners and admins can view this audit trail.</p></section> : <section className="panel table-scroll"><table><caption className="sr-only">Recent group audit events</caption><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Actor reference</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{new Date(event.occurred_at).toLocaleString("en-GB")}</td><td>{event.event_type.replaceAll(".", " ")}</td><td>{event.target_type}</td><td><code>{event.actor_reference?.slice(0, 8) ?? "deleted"}</code></td></tr>)}{!events.length && <tr><td colSpan={4}>No audit events are visible.</td></tr>}</tbody></table></section>}
  </AppShell>;
}
