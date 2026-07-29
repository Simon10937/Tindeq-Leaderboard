import Link from "next/link";
import { redirect } from "next/navigation";
import { SessionUpload } from "@/features/assessments/components/session-upload";
import { toOne } from "@/lib/supabase/relations";
import { createClient } from "@/lib/supabase/server";

export default async function UploadPage({ params }: { params: Promise<{ groupId: string; protocolId: string }> }) {
  const { groupId, protocolId } = await params;
  const supabase = await createClient();
  const { data: protocol } = await supabase.from("protocol_versions").select("id,state,protocol_families(name)").eq("id", protocolId).eq("group_id", groupId).maybeSingle();
  if (!protocol || (protocol.state !== "published" && protocol.state !== "locked")) redirect(`/groups/${groupId}/protocols`);
  const family = toOne(protocol.protocol_families);
  return <main className="app-main standalone"><header className="page-header"><p className="eyebrow">RFD session</p><h1>Upload attempts.</h1><p>{family?.name ?? "Published protocol"}. One CSV per attempt; failures stay private.</p><Link href={`/groups/${groupId}/protocols`}>← Protocols</Link></header><section className="panel"><SessionUpload groupId={groupId} protocolVersionId={protocolId}/></section></main>;
}
