import { userFromClaims } from "@/server/auth-claims";
import { loadSnapshot } from "@/server/commands";
import { buildExport, exportFilename } from "@/server/export";
import { json, liveOnly, unauthorized } from "@/server/http";
import { createSupabase } from "@/server/supabase";

/** Backup de tudo o que é do usuário, em JSON, para baixar. Mesma fonte das telas, portanto já filtrada pelo RLS. */
export async function GET() {
  const off = liveOnly();
  if (off) return off;

  const supabase = await createSupabase();
  if (!(await userFromClaims(supabase))) return unauthorized();

  const snapshot = await loadSnapshot(supabase);
  if (!snapshot.ok) return json({ error: snapshot.code, message: snapshot.error }, { status: snapshot.code === "offline" ? 503 : 500 });

  const now = new Date();
  return new Response(JSON.stringify(buildExport(snapshot.value, now), null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(now)}"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
