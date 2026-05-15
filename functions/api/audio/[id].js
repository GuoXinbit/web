import { isAdminAuthorized, json } from "../_shared/admin.js";

export async function onRequestGet({ request, env, params }) {
  if (!(await isAdminAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  const list = await env.STATS.list({ prefix: "audio:", limit: 1000 });
  let recording = null;

  for (const key of list.keys) {
    const value = await env.STATS.get(key.name, "json");
    if (value?.id === params.id) {
      recording = value;
      break;
    }
  }

  if (!recording) {
    return json({ ok: false }, { status: 404 });
  }

  const encoded = await env.STATS.get(`audio-data:${recording.id}`);

  if (!encoded) {
    return json({ ok: false }, { status: 404 });
  }

  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Response(bytes, {
    headers: {
      "content-type": recording.type || "audio/webm",
      "content-disposition": `attachment; filename="${recording.filename || `${recording.id}.webm`}"`,
      "cache-control": "private, no-store",
    },
  });
}
