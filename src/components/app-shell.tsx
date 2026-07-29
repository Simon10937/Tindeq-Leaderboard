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
        <Link className="brand" href="/groups">Cruxboard</Link>
        <nav aria-label="Groups">
          <p className="eyebrow">Your groups</p>
          {groups.map((item) => item.groups && (
            <Link className={activeGroupId === item.group_id ? "side-link active" : "side-link"} href={`/groups/${item.group_id}`} key={item.group_id}>
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
