import { isEnglishAuthorized, json } from "../_shared/english.js";

export async function onRequestPost({ request, env }) {
  if (!(await isEnglishAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, { status: 400 });
  }

  const createdAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const record = {
    id,
    type: "attempt",
    createdAt,
    articleId: String(body.articleId || ""),
    title: String(body.title || ""),
    score: Number(body.score || 0),
    total: Number(body.total || 0),
    percent: Number(body.percent || 0),
    answers: Array.isArray(body.answers) ? body.answers.slice(0, 20) : [],
    ip: request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "",
  };

  await env.STATS.put(`english-attempt:${createdAt}:${id}`, JSON.stringify(record));

  return json({ ok: true, attempt: record });
}
