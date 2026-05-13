import { isEnglishAuthorized, json } from "../_shared/english.js";

function sanitizeWord(value) {
  return String(value || "").trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").slice(0, 64);
}

export async function onRequestPost({ request, env }) {
  if (!(await isEnglishAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, { status: 400 });
  }

  const word = sanitizeWord(body.word);

  if (!word) {
    return json({ ok: false, error: "missing_word" }, { status: 400 });
  }

  if (!env.DEEPSEEK_API_KEY) {
    return json({ ok: false, error: "missing_deepseek_api_key" }, { status: 500 });
  }

  const baseUrl = (env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const model = env.DEEPSEEK_MODEL || "deepseek-chat";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "Return only compact JSON. No Markdown.",
        },
        {
          role: "user",
          content: `Translate this English word or phrase into Chinese for a learner. Return JSON {"word":"...","meaning":"...","note":"..."}. Word: ${word}`,
        },
      ],
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    return json({ ok: false, error: data?.error?.message || "translate_failed" }, { status: 500 });
  }

  const text = data.choices?.[0]?.message?.content || "";
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { word, meaning: text.slice(0, 120), note: "" };
  }

  return json({
    ok: true,
    result: {
      word: parsed.word || word,
      meaning: parsed.meaning || "",
      note: parsed.note || "",
    },
  });
}
