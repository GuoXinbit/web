const loginPanel = document.querySelector("[data-login-panel]");
const dashboard = document.querySelector("[data-dashboard]");
const loginForm = document.querySelector("[data-login-form]");
const loginMessage = document.querySelector("[data-login-message]");
const refreshButton = document.querySelector("[data-refresh]");
const totalEl = document.querySelector("[data-total]");
const todayEl = document.querySelector("[data-today]");
const ipsEl = document.querySelector("[data-ips]");
const eventsEl = document.querySelector("[data-events]");
const recordingsEl = document.querySelector("[data-recordings]");
const englishRecordsEl = document.querySelector("[data-english-records]");
const playerPanel = document.querySelector("[data-player-panel]");
const playerTitle = document.querySelector("[data-player-title]");
const audioPlayer = document.querySelector("[data-audio-player]");

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function renderEvents(events) {
  eventsEl.innerHTML = "";

  if (!events.length) {
    eventsEl.innerHTML = '<tr><td colspan="5">暂无访问记录</td></tr>';
    return;
  }

  for (const event of events) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(formatDate(event.time))}</td>
      <td><code>${escapeHtml(event.ip || "-")}</code></td>
      <td>${escapeHtml(event.path || "-")}</td>
      <td>${escapeHtml(event.device || "-")}</td>
      <td>${escapeHtml(event.referrer || "-")}</td>
    `;
    eventsEl.append(row);
  }
}

function renderRecordings(recordings = []) {
  recordingsEl.innerHTML = "";

  if (!recordings.length) {
    recordingsEl.innerHTML = '<tr><td colspan="6">暂无录音</td></tr>';
    return;
  }

  for (const recording of recordings) {
    const row = document.createElement("tr");
    const seconds = Math.max(0, Math.round((recording.durationMs || 0) / 1000));
    const sizeMb = recording.size ? `${(recording.size / 1024 / 1024).toFixed(2)} MB` : "-";
    row.innerHTML = `
      <td>${escapeHtml(formatDate(recording.createdAt))}</td>
      <td><code>${escapeHtml(recording.ip || "-")}</code></td>
      <td>${seconds}s</td>
      <td>${sizeMb}</td>
      <td><button class="table-button" type="button" data-play-recording="${escapeHtml(recording.id)}">选择播放</button></td>
      <td><a class="table-link" href="/api/audio/${encodeURIComponent(recording.id)}" target="_blank" rel="noreferrer">下载</a></td>
    `;
    recordingsEl.append(row);
  }
}

function renderEnglishRecords(records = []) {
  englishRecordsEl.innerHTML = "";

  if (!records.length) {
    englishRecordsEl.innerHTML = '<tr><td colspan="6">暂无英语学习记录</td></tr>';
    return;
  }

  for (const record of records) {
    const row = document.createElement("tr");
    const progress = record.progress ? `${record.progress.finished || 0}/${record.progress.total || 0}` : "-";
    const unfamiliar = record.counts?.unfamiliar ?? "-";
    const status = record.ok === false ? "失败" : (record.generated?.title || "获取今日数据");
    row.innerHTML = `
      <td>${escapeHtml(formatDate(record.createdAt))}</td>
      <td>${escapeHtml(record.type || "-")}</td>
      <td>${escapeHtml(progress)}</td>
      <td>${escapeHtml(unfamiliar)}</td>
      <td>${escapeHtml(status)}</td>
      <td>${escapeHtml(record.error || "-")}</td>
    `;
    englishRecordsEl.append(row);
  }
}

function renderStats(data) {
  totalEl.textContent = data.summary.total;
  todayEl.textContent = data.summary.today;
  ipsEl.textContent = data.summary.uniqueIps;
  renderEvents(data.events || []);
  renderRecordings(data.recordings || []);
  renderEnglishRecords(data.englishRecords || []);
}

recordingsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-play-recording]");

  if (!button) {
    return;
  }

  const id = button.dataset.playRecording;
  playerPanel.classList.remove("is-hidden");
  playerTitle.textContent = id;
  audioPlayer.src = `/api/audio/${id}`;
  audioPlayer.play().catch(() => {});
});

async function loadStats() {
  const response = await fetch("/api/stats", { credentials: "include" });

  if (response.status === 401) {
    loginPanel.classList.remove("is-hidden");
    dashboard.classList.add("is-hidden");
    return;
  }

  if (!response.ok) {
    throw new Error("stats_failed");
  }

  const data = await response.json();
  loginPanel.classList.add("is-hidden");
  dashboard.classList.remove("is-hidden");
  renderStats(data);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "正在验证...";

  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      password: loginForm.password.value,
    }),
    credentials: "include",
  });

  if (!response.ok) {
    loginMessage.textContent = "密码错误或后台未配置密码。";
    return;
  }

  loginForm.reset();
  loginMessage.textContent = "";
  await loadStats();
});

refreshButton?.addEventListener("click", () => {
  loadStats().catch(() => {
    eventsEl.innerHTML = '<tr><td colspan="5">加载失败，请稍后再试</td></tr>';
    recordingsEl.innerHTML = '<tr><td colspan="6">加载失败，请稍后再试</td></tr>';
    englishRecordsEl.innerHTML = '<tr><td colspan="6">加载失败，请稍后再试</td></tr>';
  });
});

loadStats().catch(() => {});
