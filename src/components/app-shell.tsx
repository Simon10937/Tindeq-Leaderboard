import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import type { GroupSummary } from "@/features/groups/queries";

export function AppShell({
  profileName,
  groups,
  activeGroupId,
  children,
}: {
  profileName: string;
  groups: GroupSummary[];
  activeGroupId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">Cruxboard</Link>
        <Link className="side-link leaderboard-home" href="/dashboard"><span>Leaderboard</span><small>Home</small></Link>
        <nav aria-label="Groups">
          <p className="eyebrow">Your groups</p>
          {groups.map((item) => item.groups && (
            <Link className={activeGroupId === item.group_id ? "side-link active" : "side-link"} href={`/dashboard?group=${item.group_id}`} key={item.group_id}>
              <span>{item.groups.name}</span><small>{item.role}</small>
            </Link>
          ))}
          <Link className="side-link" href="/groups">+ New group</Link>
        </nav>
        <div className="account-block"><strong>{profileName}</strong><form action={signOut}><button className="text-button">Sign out</button></form></div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
