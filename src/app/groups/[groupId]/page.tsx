import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { changeMemberRole, inviteMember, leaveGroup, removeMember, transferOwnership } from "@/features/groups/actions";
import { getGroup, listGroups } from "@/features/groups/queries";

export default async function GroupPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ message?: string }> }) {
  const { groupId } = await params;
  const [{ profile, groups }, group, { message }] = await Promise.all([listGroups(), getGroup(groupId), searchParams]);
  const detail = group.membership.groups;
  const role = group.membership.role;
  const canManage = role === "owner" || role === "admin";
  return <AppShell profileName={profile.display_name} groups={groups} activeGroupId={groupId}>
    <header className="page-header"><p className="eyebrow">{role}</p><h1>{detail?.name ?? "Group"}</h1><p>Members share immutable training protocols and comparable results.</p><div className="button-row"><Link className="button button-quiet" href={`/groups/${groupId}/protocols`}>Protocols and comparisons</Link>{canManage && <><Link className="button button-quiet" href={`/groups/${groupId}/moderation`}>Moderation</Link><Link className="button button-quiet" href={`/groups/${groupId}/audit`}>Audit</Link></>}</div></header>
    {message && <p className="notice" role="status">{message}</p>}
    {canManage && <section className="panel"><h2>Invite member</h2><form action={inviteMember} className="inline-form"><input type="hidden" name="groupId" value={groupId}/><label>Verified email<input name="email" type="email" required/></label><button className="button">Send invitation</button></form></section>}
    <section className="panel"><h2>Members</h2><ul className="member-list">{group.members.map((member) => <li key={member.user_id}><span><strong>{member.profiles?.display_name ?? "Member"}</strong><small>{member.role}</small></span>{canManage && member.user_id !== profile.id && member.role !== "owner" && <div className="button-row">{role === "owner" && <><form action={changeMemberRole}><input type="hidden" name="groupId" value={groupId}/><input type="hidden" name="userId" value={member.user_id}/><input type="hidden" name="role" value={member.role === "admin" ? "member" : "admin"}/><button className="text-button">Make {member.role === "admin" ? "member" : "admin"}</button></form><form action={transferOwnership}><input type="hidden" name="groupId" value={groupId}/><input type="hidden" name="userId" value={member.user_id}/><ConfirmSubmit confirmation={`Transfer ownership to ${member.profiles?.display_name ?? "this member"}?`}>Transfer ownership</ConfirmSubmit></form></>}<form action={removeMember}><input type="hidden" name="groupId" value={groupId}/><input type="hidden" name="userId" value={member.user_id}/><button className="text-button">Remove</button></form></div>}</li>)}</ul></section>
    <section className="danger-zone"><h2>Leave group</h2><form action={leaveGroup}><input type="hidden" name="groupId" value={groupId}/><button className="button button-danger" disabled={role === "owner"}>Leave group</button></form>{role === "owner" && <p>Transfer ownership or delete the group before leaving.</p>}</section>
  </AppShell>;
}
