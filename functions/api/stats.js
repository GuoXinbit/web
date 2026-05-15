import { isAdminAuthorized, json } from "./_shared/admin.js";

async function readRecentRecords(env, keys, limit) {
  const selected = [...keys]
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, limit);

  const records = await Promise.all(selected.map((key) => env.STATS.get(key.name, "json")));
  return records.filter(Boolean);
}

export async function onRequestGet({ request, env }) {
  if (!(await isAdminAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  const [
    list,
    audioList,
    englishFetchList,
    englishArticleList,
    englishAttemptList,
    errorList,
    feedbackList,
  ] = await Promise.all([
    env.STATS.list({ prefix: "event:", limit: 1000 }),
    env.STATS.list({ prefix: "audio:", limit: 1000 }),
    env.STATS.list({ prefix: "english-fetch:", limit: 1000 }),
    env.STATS.list({ prefix: "english-article:", limit: 1000 }),
    env.STATS.list({ prefix: "english-attempt:", limit: 1000 }),
    env.STATS.list({ prefix: "error:", limit: 1000 }),
    env.STATS.list({ prefix: "feedback:", limit: 1000 }),
  ]);

  const [events, recordings, englishRecords, errors, feedbacks] = await Promise.all([
    readRecentRecords(env, list.keys, 240),
    readRecentRecords(env, audioList.keys, 120),
    readRecentRecords(env, [...englishFetchList.keys, ...englishArticleList.keys, ...englishAttemptList.keys], 160),
    readRecentRecords(env, errorList.keys, 160),
    readRecentRecords(env, feedbackList.keys, 160),
  ]);

  events.sort((a, b) => new Date(b.time) - new Date(a.time));
  recordings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  englishRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  errors.sort((a, b) => new Date(b.time) - new Date(a.time));
  feedbacks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const today = new Date().toISOString().slice(0, 10);
  const uniqueIps = new Set(events.map((event) => event.ip).filter(Boolean));

  return json({
    ok: true,
    summary: {
      total: list.keys.length,
      today: events.filter((event) => event.time?.startsWith(today)).length,
      uniqueIps: uniqueIps.size,
      feedbacks: feedbackList.keys.length,
    },
    events: events.slice(0, 200),
    recordings: recordings.slice(0, 100),
    englishRecords: englishRecords.slice(0, 120),
    errors: errors.slice(0, 120),
    feedbacks: feedbacks.slice(0, 120),
  });
}
