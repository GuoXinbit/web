import { getTodayLearningData, isEnglishAuthorized, json, saveEnglishRecord } from "../_shared/english.js";

function getOutputText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}

function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

async function generateArticle(env, learningData) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("missing_openai_api_key");
  }

  if (!learningData.unfamiliarItems.length) {
    throw new Error("no_unfamiliar_words");
  }

  const words = learningData.unfamiliarItems.map((item) => ({
    word: item.voc_spelling,
    response: item.first_response,
    isNew: item.is_new === true,
    order: item.order,
  }));
  const prompt = `
You are writing an English reading passage for a Chinese learner preparing for CET-6 and China's postgraduate English I exam.

Use as many target words as naturally possible, prioritizing the more abstract and difficult ones. The article must be logical, exam-like, and coherent, not a loose word list.

Target words:
${JSON.stringify(words, null, 2)}

Requirements:
- Write one article of 520-760 English words.
- Topic should fit exam reading: society, education, technology, public policy, economy, environment, ethics, or urban life.
- Use target words naturally. Do not force a word if it damages logic.
- Return Chinese meanings for highlighted target words.
- Highlight words should mainly come from the target list.
- Include paragraph breaks using "\\n\\n".
`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      topic: { type: "string" },
      difficulty: { type: "string" },
      article: { type: "string" },
      used_words: { type: "array", items: { type: "string" } },
      highlight_words: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            word: { type: "string" },
            meaning: { type: "string" },
            note: { type: "string" },
          },
          required: ["word", "meaning", "note"],
        },
      },
      chinese_summary: { type: "string" },
    },
    required: ["title", "topic", "difficulty", "article", "used_words", "highlight_words", "chinese_summary"],
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4.1-mini",
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "english_learning_article",
          strict: true,
          schema,
        },
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "openai_failed");
  }

  const parsed = parseModelJson(getOutputText(data));

  if (!parsed?.article || !parsed?.title) {
    throw new Error("invalid_openai_output");
  }

  return parsed;
}

export async function onRequestPost({ request, env }) {
  if (!(await isEnglishAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  const createdAt = new Date().toISOString();
  const id = crypto.randomUUID();

  try {
    const learningData = await getTodayLearningData(env);
    const generated = await generateArticle(env, learningData);
    const record = {
      id,
      type: "article",
      createdAt,
      ok: true,
      progress: learningData.progress,
      counts: learningData.counts,
      responseDistribution: learningData.responseDistribution,
      sourceWords: learningData.unfamiliarItems.map((item) => ({
        word: item.voc_spelling,
        first_response: item.first_response,
        is_new: item.is_new,
        order: item.order,
      })),
      generated,
      ip: request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "",
    };

    if (!env.STATS) {
      return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
    }

    await env.STATS.put(`english-article:${createdAt}:${id}`, JSON.stringify(record));
    await env.STATS.put("english-latest", JSON.stringify(record));

    return json({ ok: true, article: record });
  } catch (error) {
    await saveEnglishRecord(env, "article", {
      id,
      type: "article",
      createdAt,
      ok: false,
      error: String(error?.message || error).slice(0, 400),
    });

    return json({ ok: false, error: "generate_failed", detail: String(error?.message || error).slice(0, 120) }, { status: 500 });
  }
}
