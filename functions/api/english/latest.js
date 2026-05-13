import { isEnglishAuthorized, json } from "../_shared/english.js";

export async function onRequestGet({ request, env }) {
  if (!(await isEnglishAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  const list = await env.STATS.list({ prefix: "english-article:", limit: 50 });
  const attemptList = await env.STATS.list({ prefix: "english-attempt:", limit: 100 });
  const todayCache = await env.STATS.get("english-today-cache", "json");
  const articles = [];
  const attempts = [];

  for (const key of list.keys) {
    const value = await env.STATS.get(key.name, "json");

    if (value) {
      articles.push(value);
    }
  }

  for (const key of attemptList.keys) {
    const value = await env.STATS.get(key.name, "json");

    if (value) {
      attempts.push(value);
    }
  }

  articles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  attempts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return json({
    ok: true,
    articles,
    attempts,
    today: todayCache?.data || null,
    latest: articles[0] || null,
  });
}
