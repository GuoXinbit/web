const lockPanel = document.querySelector("[data-lock-panel]");
const appPanel = document.querySelector("[data-english-app]");
const loginForm = document.querySelector("[data-english-login]");
const loginMessage = document.querySelector("[data-login-message]");
const fetchButton = document.querySelector("[data-fetch-today]");
const generateButton = document.querySelector("[data-generate]");
const message = document.querySelector("[data-message]");
const progressEl = document.querySelector("[data-progress]");
const percentEl = document.querySelector("[data-percent]");
const unfamiliarCountEl = document.querySelector("[data-unfamiliar-count]");
const historyCountEl = document.querySelector("[data-history-count]");
const wordList = document.querySelector("[data-word-list]");
const historyList = document.querySelector("[data-history-list]");
const articleStage = document.querySelector("[data-article-stage]");
const popover = document.querySelector("[data-popover]");
const popoverWord = document.querySelector("[data-popover-word]");
const popoverMeaning = document.querySelector("[data-popover-meaning]");
const popoverNote = document.querySelector("[data-popover-note]");
const closePopover = document.querySelector("[data-close-popover]");

let articles = [];
let activeMeanings = new Map();

function setBusy(button, busy, text) {
  button.disabled = busy;
  button.dataset.idleText = button.dataset.idleText || button.textContent;
  button.textContent = busy ? text : button.dataset.idleText;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderLearningData(data) {
  progressEl.textContent = `${data.progress.finished} / ${data.progress.total}`;
  percentEl.textContent = `${data.progress.percent}%`;
  unfamiliarCountEl.textContent = data.counts.unfamiliar;

  if (!data.unfamiliarItems.length) {
    wordList.innerHTML = '<span class="muted-text">今天暂时没有不熟悉词</span>';
    return;
  }

  wordList.innerHTML = data.unfamiliarItems
    .map((item) => {
      const label = item.is_new ? "新词" : item.first_response || "复习";
      return `<span class="study-word"><strong>${escapeHtml(item.voc_spelling)}</strong><em>${escapeHtml(label)}</em></span>`;
    })
    .join("");
}

function highlightArticle(text, highlights) {
  let html = escapeHtml(text);
  const ordered = [...highlights].sort((a, b) => b.word.length - a.word.length);

  for (const item of ordered) {
    const word = item.word.trim();

    if (!word) {
      continue;
    }

    const key = word.toLowerCase();
    activeMeanings.set(key, item);
    const pattern = new RegExp(`(?<![A-Za-z])${escapeRegExp(escapeHtml(word))}(?![A-Za-z])`, "gi");
    html = html.replace(pattern, (match) => `<button class="highlight-word" type="button" data-word="${escapeHtml(key)}">${match}</button>`);
  }

  return html
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderArticle(record) {
  if (!record?.generated) {
    articleStage.innerHTML = `
      <div class="empty-state">
        <strong>还没有文章</strong>
        <span>生成后会自动保存到历史记录。</span>
      </div>
    `;
    return;
  }

  const generated = record.generated;
  activeMeanings = new Map();
  articleStage.innerHTML = `
    <header class="article-header">
      <span class="status-pill">CET-6 / 考研英语一</span>
      <h2>${escapeHtml(generated.title)}</h2>
      <p>${escapeHtml(generated.chinese_summary || "")}</p>
      <div class="article-meta">
        <span>${formatDate(record.createdAt)}</span>
        <span>使用 ${generated.used_words?.length || 0} 个目标词</span>
        <span>${escapeHtml(generated.topic || "Exam Reading")}</span>
      </div>
    </header>
    <div class="article-content">
      ${highlightArticle(generated.article || "", generated.highlight_words || [])}
    </div>
  `;
}

function renderHistory() {
  historyCountEl.textContent = articles.length;

  if (!articles.length) {
    historyList.innerHTML = '<span class="muted-text">还没有生成历史</span>';
    return;
  }

  historyList.innerHTML = articles
    .map((record, index) => `
      <button class="history-item${index === 0 ? " active" : ""}" type="button" data-history-id="${record.id}">
        <strong>${escapeHtml(record.generated?.title || "生成失败记录")}</strong>
        <span>${formatDate(record.createdAt)} · ${record.counts?.unfamiliar ?? 0} 个不熟悉词</span>
      </button>
    `)
    .join("");
}

async function loadHistory() {
  const response = await fetch("/api/english/latest", { credentials: "include" });

  if (response.status === 401) {
    lockPanel.classList.remove("is-hidden");
    appPanel.classList.add("is-hidden");
    return;
  }

  if (!response.ok) {
    throw new Error("history_failed");
  }

  const data = await response.json();
  articles = data.articles || [];
  lockPanel.classList.add("is-hidden");
  appPanel.classList.remove("is-hidden");
  renderHistory();
  renderArticle(data.latest);
}

async function fetchToday() {
  setBusy(fetchButton, true, "正在获取...");
  setMessage("正在从墨墨读取今日完整学习记录...");

  try {
    const response = await fetch("/api/english/today", { credentials: "include" });

    if (!response.ok) {
      throw new Error("today_failed");
    }

    const data = await response.json();
    renderLearningData(data);
    setMessage(`已获取今日 ${data.progress.finished}/${data.progress.total} 进度，发现 ${data.counts.unfamiliar} 个不熟悉词。`);
  } catch {
    setMessage("今日学习数据获取失败，请稍后重试或检查后端环境变量。", true);
  } finally {
    setBusy(fetchButton, false, "正在获取...");
  }
}

async function generateArticle() {
  setBusy(generateButton, true, "正在生成...");
  setMessage("正在调用 ChatGPT 生成文章，慢网下请保持页面打开。");

  try {
    const response = await fetch("/api/english/generate", {
      method: "POST",
      credentials: "include",
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.detail || "generate_failed");
    }

    articles = [data.article, ...articles.filter((item) => item.id !== data.article.id)];
    renderHistory();
    renderLearningData({
      progress: data.article.progress,
      counts: data.article.counts,
      unfamiliarItems: data.article.sourceWords.map((item) => ({
        voc_spelling: item.word,
        first_response: item.first_response,
        is_new: item.is_new,
      })),
    });
    renderArticle(data.article);
    setMessage("文章已生成并保存，其他人输入密码访问后也能看到。");
  } catch (error) {
    setMessage(`文章生成失败：${error.message || "请稍后重试"}`, true);
  } finally {
    setBusy(generateButton, false, "正在生成...");
  }
}

function showPopover(button) {
  const item = activeMeanings.get(button.dataset.word);

  if (!item) {
    return;
  }

  const rect = button.getBoundingClientRect();
  popoverWord.textContent = item.word;
  popoverMeaning.textContent = item.meaning;
  popoverNote.textContent = item.note;
  popover.classList.remove("is-hidden");

  const top = Math.min(window.innerHeight - popover.offsetHeight - 12, rect.bottom + 10);
  const left = Math.min(window.innerWidth - popover.offsetWidth - 12, Math.max(12, rect.left));
  popover.style.top = `${Math.max(12, top)}px`;
  popover.style.left = `${left}px`;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "正在验证...";

  const response = await fetch("/api/english/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: loginForm.password.value }),
    credentials: "include",
  });

  if (!response.ok) {
    loginMessage.textContent = "密码错误";
    return;
  }

  loginMessage.textContent = "";
  loginForm.reset();
  await loadHistory();
});

fetchButton.addEventListener("click", fetchToday);
generateButton.addEventListener("click", generateArticle);
historyList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-history-id]");

  if (!button) {
    return;
  }

  const record = articles.find((item) => item.id === button.dataset.historyId);
  historyList.querySelectorAll(".history-item").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  renderArticle(record);
});
articleStage.addEventListener("click", (event) => {
  const button = event.target.closest("[data-word]");

  if (button) {
    showPopover(button);
  }
});
closePopover.addEventListener("click", () => popover.classList.add("is-hidden"));
window.addEventListener("resize", () => popover.classList.add("is-hidden"));

loadHistory().catch(() => {
  lockPanel.classList.remove("is-hidden");
  appPanel.classList.add("is-hidden");
});
