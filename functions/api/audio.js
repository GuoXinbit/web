function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  const formData = await request.formData();
  const audio = formData.get("audio");

  if (!(audio instanceof File) || audio.size === 0) {
    return json({ ok: false, error: "missing_audio" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const contentType = audio.type || "audio/webm";
  const extension = contentType.includes("mp4") ? "mp4" : "webm";
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "";

  if (audio.size > 20 * 1024 * 1024) {
    return json({ ok: false, error: "audio_too_large_for_kv" }, { status: 413 });
  }

  const buffer = await audio.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  await env.STATS.put(`audio-data:${id}`, btoa(binary));

  const metadata = {
    id,
    storage: "kv",
    filename: `${id}.${extension}`,
    createdAt,
    ip,
    size: audio.size,
    type: contentType,
    startedAt: String(formData.get("startedAt") || ""),
    endedAt: String(formData.get("endedAt") || ""),
    durationMs: Number(formData.get("durationMs") || 0),
    sampleRate: String(formData.get("sampleRate") || ""),
    path: String(formData.get("path") || ""),
    userAgent: (request.headers.get("user-agent") || "").slice(0, 500),
  };

  await env.STATS.put(`audio:${createdAt}:${id}`, JSON.stringify(metadata));

  return json({ ok: true, id });
}
