import { isEnglishAuthorized, json } from "../_shared/english.js";

async function readRecords(env, keys) {
  const records = await Promise.all(keys.map((key) => env.STATS.get(key.name, "json")));
  return records.filter(Boolean);
}

export async function onRequestGet({ request, env }) {
  if (!(await isEnglishAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  const [list, attemptList, todayCache] = await Promise.all([
    env.STATS.list({ prefix: "english-article:", limit: 50 }),
    env.STATS.list({ prefix: "english-attempt:", limit: 100 }),
    env.STATS.get("english-today-cache", "json"),
  ]);
  const [articles, attempts] = await Promise.all([
    readRecords(env, list.keys),
    readRecords(env, attemptList.keys),
  ]);

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
