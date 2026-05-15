import { isEnglishAuthorized, json } from "../_shared/english.js";
import { getProviderConfig } from "../_shared/site-config.js";

function sanitizeWord(value) {
  return String(value || "").trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").slice(0, 64);
}

function sanitizeText(value) {
  return String(value || "").trim().slice(0, 2500);
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
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

  const paragraphText = sanitizeText(body.text);
  const word = sanitizeWord(body.word);

  if (!word && !paragraphText) {
    return json({ ok: false, error: "missing_text" }, { status: 400 });
  }

  const provider = await getProviderConfig(env);

  if (!provider.deepseekApiKey) {
    return json({ ok: false, error: "missing_deepseek_api_key" }, { status: 500 });
  }

  const baseUrl = provider.deepseekBaseUrl;
  const model = provider.deepseekTranslateModel;
  const isParagraph = Boolean(paragraphText);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.deepseekApiKey}`,
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
          content: isParagraph
            ? `Translate this English paragraph into natural, accurate Chinese for a learner. Preserve the paragraph meaning, logic, and tone. Return JSON {"translation":"..."}. Paragraph: ${paragraphText}`
            : `Translate this English word or phrase into Chinese for a learner. Return JSON {"word":"...","meaning":"...","note":"..."}. Word: ${word}`,
        },
      ],
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    return json({ ok: false, error: data?.error?.message || "translate_failed" }, { status: 500 });
  }

  const output = data.choices?.[0]?.message?.content || "";
  const parsed = parseJson(output, isParagraph ? { translation: output.slice(0, 1200) } : { word, meaning: output.slice(0, 120), note: "" });

  if (isParagraph) {
    return json({
      ok: true,
      result: {
        translation: parsed.translation || "",
      },
    });
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
