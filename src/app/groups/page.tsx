import { AppShell } from "@/components/app-shell";
import { createGroup, requestAccountDeletion } from "@/features/groups/actions";
import { listGroups } from "@/features/groups/queries";

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const [{ profile, groups }, { message }] = await Promise.all([listGroups(), searchParams]);
  return <AppShell profileName={profile.display_name} groups={groups}><header className="page-header"><p className="eyebrow">Private training</p><h1>Your groups.</h1><p>Create a group, then invite climbers using their verified email address.</p></header>{message && <p className="notice" role="status">{message}</p>}<section className="panel"><h2>Create group</h2><form action={createGroup} className="inline-form"><label>Group name<input name="name" minLength={1} maxLength={80} required /></label><button className="button">Create</button></form></section><section className="danger-zone"><h2>Delete account</h2><p>Transfer every group you own first. Access is revoked immediately and cleanup continues safely in the background.</p><form action={requestAccountDeletion}><button className="button button-danger">Start account deletion</button></form></section></AppShell>;
}
