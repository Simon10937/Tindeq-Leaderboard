import Link from "next/link";
import { archiveProtocol, cloneProtocol, createRfdProtocol, publishProtocol } from "@/features/protocols/actions";
import { listProtocols } from "@/features/protocols/queries";

export default async function ProtocolsPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ message?: string }> }) {
  const [{ groupId }, { message }] = await Promise.all([params, searchParams]);
  const { role, families, rfdEnabled } = await listProtocols(groupId);
  const canManage = role === "owner" || role === "admin";
  return <main className="app-main standalone">
    <header className="page-header"><p className="eyebrow">Comparable testing</p><h1>Protocols.</h1><p>One immutable version means one leaderboard. RFD ranking remains disabled until the independent oracle is approved.</p><Link href={`/groups/${groupId}`}>← Group overview</Link></header>
    {message && <p className="notice" role="status">{message}</p>}
    <section className="panel"><h2>Protocol library</h2>{families.length === 0 ? <p>No protocols yet.</p> : <ul className="protocol-list">{families.map((family) => <li key={family.id}><strong>{family.name}</strong><span>{family.assessment_type}</span>{family.protocol_versions.map((version) => <div key={version.id}><p>v{version.version} · {version.grip_type} · {version.edge_depth_mm} mm · {version.state}</p><div className="button-row"><Link href={`/groups/${groupId}/protocols/${version.id}/leaderboard`}>Leaderboard</Link><Link href={`/groups/${groupId}/protocols/${version.id}/progress`}>Progress</Link>{version.state !== "draft" && version.state !== "archived" && <Link href={`/groups/${groupId}/protocols/${version.id}/upload`}>Upload</Link>}{canManage && <form action={cloneProtocol}><input type="hidden" name="groupId" value={groupId}/><input type="hidden" name="versionId" value={version.id}/><button className="text-button">Clone</button></form>}{canManage && version.state === "draft" && <form action={publishProtocol}><input type="hidden" name="groupId" value={groupId}/><input type="hidden" name="versionId" value={version.id}/><button className="text-button" disabled={!rfdEnabled}>Publish</button></form>}{canManage && (version.state === "published" || version.state === "locked") && <form action={archiveProtocol}><input type="hidden" name="groupId" value={groupId}/><input type="hidden" name="versionId" value={version.id}/><button className="text-button">Archive</button></form>}</div></div>)}</li>)}</ul>}</section>
    {canManage && <section className="panel"><h2>New RFD protocol</h2><form action={createRfdProtocol} className="protocol-form">
      <input type="hidden" name="groupId" value={groupId}/>
      <label>Name<input name="name" required defaultValue="20 mm half crimp RFD"/></label>
      <label>Grip<select name="gripType" defaultValue="half_crimp"><option value="open_hand">Open hand</option><option value="half_crimp">Half crimp</option><option value="full_crimp">Full crimp</option><option value="three_finger_drag">Three-finger drag</option><option value="pinch">Pinch</option><option value="other">Other</option></select></label>
      <label>Edge depth (mm)<input name="edgeDepthMm" type="number" min="1" max="100" step="0.5" defaultValue="20" required/></label>
      <label>Setup<textarea name="setupInstructions" required defaultValue="Fix the edge and Tindeq before beginning."/></label>
      <label>Warm-up<textarea name="warmupInstructions" required defaultValue="Complete three progressive warm-up pulls."/></label>
      <label>Body position<textarea name="bodyPosition" required defaultValue="Stand square, shoulder neutral, elbow extended."/></label>
      <label>Device placement<textarea name="devicePlacement" required defaultValue="Place the Tindeq inline below the fixed edge."/></label>
      <label>Execution<textarea name="executionInstructions" required defaultValue="Pull as fast and hard as possible without countermovement."/></label>
      <label>Maximum attempts<input name="maximumAttempts" type="number" min="1" max="10" defaultValue="3" required/></label>
      <label>Best of<input name="bestOf" type="number" min="1" max="10" defaultValue="3" required/></label>
      <label>Recovery (seconds)<input name="minimumRecoverySeconds" type="number" min="0" max="3600" defaultValue="120" required/></label>
      <label>Minimum duration (ms)<input name="minimumValidDurationMs" type="number" min="100" max="60000" defaultValue="500" required/></label>
      <label>Minimum peak force (N)<input name="minimumPeakForceN" type="number" min="1" max="10000" defaultValue="50" required/></label>
      <button className="button">Create draft</button>
    </form></section>}
  </main>;
}
