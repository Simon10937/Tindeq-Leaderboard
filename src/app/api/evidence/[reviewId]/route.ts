import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function attachmentName(input: string) {
  const base = input.replace(/[\r\n"\\/\0]/g, "_").replace(/[^\x20-\x7e]/g, "_").slice(0, 120);
  return base.toLowerCase().endsWith(".csv") ? base : `${base || "tindeq-evidence"}.csv`;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await context.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_source_review", { target_review: reviewId });
  const evidence = Array.isArray(data) ? data[0] : null;
  if (error || !evidence) return NextResponse.json({ error: "Evidence review is unavailable." }, { status: 403 });
  const admin = createAdminClient();
  const { data: source, error: sourceError } = await admin.storage.from("assessment-evidence").download(evidence.object_path);
  if (sourceError || !source) return NextResponse.json({ error: "Evidence file was not found." }, { status: 404 });
  return new NextResponse(await source.arrayBuffer(), { status: 200, headers: {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="${attachmentName(evidence.original_filename)}"`,
    "Content-Type": "text/csv; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  } });
}
