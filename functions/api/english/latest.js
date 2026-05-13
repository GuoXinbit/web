import { isEnglishAuthorized, json } from "../_shared/english.js";

export async function onRequestGet({ request, env }) {
  if (!(await isEnglishAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  const list = await env.STATS.list({ prefix: "english-article:", limit: 50 });
  const articles = [];

  for (const key of list.keys) {
    const value = await env.STATS.get(key.name, "json");

    if (value) {
      articles.push(value);
    }
  }

  articles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return json({
    ok: true,
    articles,
    latest: articles[0] || null,
  });
}
