const canvas = document.querySelector("#spectrum");
const ctx = canvas.getContext("2d");
const toggleButton = document.querySelector("[data-toggle]");
const statusText = document.querySelector("[data-status]");
const message = document.querySelector("[data-message]");
const idle = document.querySelector("[data-idle]");
const levelBar = document.querySelector("[data-level]");
const peakFrequency = document.querySelector("[data-peak-frequency]");
const peakLevel = document.querySelector("[data-peak-level]");
const maxPeak = document.querySelector("[data-max-peak]");
const sampleRate = document.querySelector("[data-sample-rate]");
const gainControl = document.querySelector("[data-gain]");
const smoothingControl = document.querySelector("[data-smoothing]");
const rangeControl = document.querySelector("[data-range]");
const resetMaxButton = document.querySelector("[data-reset-max]");

let audioContext;
let analyser;
let source;
let mediaStream;
let mediaRecorder;
let recordingStartedAt;
let recordedChunks = [];
let dataArray;
let animationId;
let isRunning = false;
let canvasWidth = 0;
let canvasHeight = 0;
let devicePixelRatioCache = window.devicePixelRatio || 1;
let maxPeakDb = -Infinity;

const state = {
  gain: Number(gainControl.value),
  smoothing: Number(smoothingControl.value),
  maxFrequency: Number(rangeControl.value),
};

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const nextWidth = Math.max(1, Math.floor(rect.width * ratio));
  const nextHeight = Math.max(1, Math.floor(rect.height * ratio));

  if (nextWidth === canvasWidth && nextHeight === canvasHeight && ratio === devicePixelRatioCache) {
    return;
  }

  canvasWidth = nextWidth;
  canvasHeight = nextHeight;
  devicePixelRatioCache = ratio;
  canvas.width = nextWidth;
  canvas.height = nextHeight;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function formatFrequency(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-- Hz";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} kHz`;
  }

  return `${Math.round(value)} Hz`;
}

function getPlotArea(width, height) {
  const compact = width < 520;

  return {
    left: compact ? 42 : 54,
    right: compact ? 10 : 18,
    top: 18,
    bottom: compact ? 34 : 40,
    width: Math.max(1, width - (compact ? 52 : 72)),
    height: Math.max(1, height - (compact ? 52 : 58)),
  };
}

function drawAxes(width, height) {
  const plot = getPlotArea(width, height);
  const maxFrequency = state.maxFrequency;
  const xTicks =
    maxFrequency <= 2000
      ? [20, 500, 1000, 2000]
      : maxFrequency <= 5000
        ? [20, 1000, 2500, 5000]
        : maxFrequency <= 12000
          ? [20, 1000, 5000, 12000]
          : [20, 1000, 5000, 10000, 20000];
  const yTicks = [-20, -40, -60, -80, -100];

  ctx.save();
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "rgba(242, 246, 248, 0.12)";
  ctx.fillStyle = "rgba(242, 246, 248, 0.64)";
  ctx.lineWidth = 1;

  for (const db of yTicks) {
    const y = plot.top + ((db + 100) / 80) * plot.height;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(width - plot.right, y);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(`${db}`, plot.left - 8, y);
  }

  ctx.textAlign = "left";
  ctx.fillText("dB", 8, plot.top + 2);

  for (const frequency of xTicks) {
    const x = plot.left + (frequency / maxFrequency) * plot.width;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, height - plot.bottom);
    ctx.stroke();
    ctx.textAlign = frequency > maxFrequency * 0.78 ? "right" : "center";
    ctx.fillText(formatFrequency(frequency), x, height - 16);
  }

  ctx.strokeStyle = "rgba(242, 246, 248, 0.28)";
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.top);
  ctx.lineTo(plot.left, height - plot.bottom);
  ctx.lineTo(width - plot.right, height - plot.bottom);
  ctx.stroke();
  ctx.restore();

  return plot;
}

function drawIdleGrid() {
  const { width, height } = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0a0d10";
  ctx.fillRect(0, 0, width, height);
  drawAxes(width, height);
}

function drawSpectrum() {
  if (!analyser || !dataArray || !audioContext) {
    drawIdleGrid();
    return;
  }

  analyser.getByteFrequencyData(dataArray);

  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const plot = getPlotArea(width, height);
  const nyquist = audioContext.sampleRate / 2;
  const visibleBins = Math.max(
    8,
    Math.min(dataArray.length, Math.floor((state.maxFrequency / nyquist) * dataArray.length)),
  );
  const barWidth = plot.width / visibleBins;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0a0d10";
  ctx.fillRect(0, 0, width, height);
  drawAxes(width, height);

  let peakIndex = 0;
  let peakValue = 0;
  let sum = 0;

  for (let i = 0; i < visibleBins; i += 1) {
    const raw = dataArray[i];
    const value = Math.min(255, raw * state.gain);
    const normalized = value / 255;
    const barHeight = Math.max(2, normalized * plot.height);
    const hue = 158 - normalized * 90;

    if (raw > peakValue) {
      peakValue = raw;
      peakIndex = i;
    }

    sum += raw;
    ctx.fillStyle = `hsl(${hue} 82% ${46 + normalized * 18}%)`;
    ctx.fillRect(
      plot.left + i * barWidth,
      plot.top + plot.height - barHeight,
      Math.max(1, barWidth - 1),
      barHeight,
    );
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(51, 208, 162, 0.16)");
  gradient.addColorStop(0.65, "rgba(51, 208, 162, 0.03)");
  gradient.addColorStop(1, "rgba(51, 208, 162, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(plot.left, plot.top, plot.width, plot.height);

  const average = sum / visibleBins;
  const level = Math.min(100, Math.round((average / 130) * 100 * state.gain));
  const frequency = (peakIndex * audioContext.sampleRate) / analyser.fftSize;
  const db = peakValue > 0 ? 20 * Math.log10(peakValue / 255) : -Infinity;

  if (Number.isFinite(db) && db > maxPeakDb) {
    maxPeakDb = db;
  }

  levelBar.style.width = `${level}%`;
  peakFrequency.textContent = formatFrequency(frequency);
  peakLevel.textContent = Number.isFinite(db) ? `${db.toFixed(1)} dB` : "-- dB";
  maxPeak.textContent = Number.isFinite(maxPeakDb) ? `${maxPeakDb.toFixed(1)} dB` : "-- dB";

  animationId = requestAnimationFrame(drawSpectrum);
}

function pickMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function startAnalysis() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setMessage("当前浏览器不支持麦克风录音。请使用新版 Chrome、Edge、Safari 或 Firefox。", true);
    return;
  }

  try {
    toggleButton.disabled = true;
    statusText.textContent = "请求权限中";
    setMessage("浏览器会请求麦克风权限。允许后会开始频谱分析并录音保存。");

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -20;
    analyser.smoothingTimeConstant = state.smoothing;

    source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    recordedChunks = [];
    recordingStartedAt = new Date();
    const mimeType = pickMimeType();
    mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    });
    mediaRecorder.start();

    isRunning = true;
    idle.classList.add("is-hidden");
    toggleButton.textContent = "停止分析并上传录音";
    statusText.textContent = "分析并录音中";
    sampleRate.textContent = `${(audioContext.sampleRate / 1000).toFixed(1)} kHz`;
    setMessage("正在实时分析并录音。点击停止后录音会上传保存到后台。");
    drawSpectrum();
  } catch (error) {
    const denied = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
    setMessage(
      denied
        ? "麦克风权限被拒绝。请在浏览器地址栏或系统设置里允许麦克风。"
        : "无法启动麦克风输入，请检查设备或浏览器权限。",
      true,
    );
    statusText.textContent = "启动失败";
  } finally {
    toggleButton.disabled = false;
  }
}

function stopRecorder() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      resolve();
      return;
    }

    mediaRecorder.addEventListener("stop", resolve, { once: true });
    mediaRecorder.stop();
  });
}

async function uploadRecording() {
  if (!recordedChunks.length) {
    return;
  }

  const type = mediaRecorder?.mimeType || "audio/webm";
  const extension = type.includes("mp4") ? "mp4" : "webm";
  const blob = new Blob(recordedChunks, { type });
  const formData = new FormData();
  const endedAt = new Date();

  formData.append("audio", blob, `recording-${Date.now()}.${extension}`);
  formData.append("startedAt", recordingStartedAt?.toISOString() || endedAt.toISOString());
  formData.append("endedAt", endedAt.toISOString());
  formData.append("durationMs", String(endedAt - recordingStartedAt));
  formData.append("sampleRate", sampleRate.textContent);
  formData.append("path", location.pathname);

  const response = await fetch("/api/audio", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("upload_failed");
  }
}

async function stopAnalysis() {
  toggleButton.disabled = true;
  statusText.textContent = "正在上传录音";
  cancelAnimationFrame(animationId);
  await stopRecorder();
  mediaStream?.getTracks().forEach((track) => track.stop());
  source?.disconnect();
  await audioContext?.close();

  try {
    await uploadRecording();
    setMessage("已停止分析，录音已上传保存到后台。");
  } catch {
    setMessage("已停止分析，但录音上传失败。请检查后台存储配置。", true);
  }

  audioContext = undefined;
  analyser = undefined;
  source = undefined;
  mediaStream = undefined;
  mediaRecorder = undefined;
  dataArray = undefined;
  recordedChunks = [];
  isRunning = false;

  idle.classList.remove("is-hidden");
  toggleButton.disabled = false;
  toggleButton.textContent = "开始分析并录音";
  statusText.textContent = "已停止";
  levelBar.style.width = "0%";
  peakFrequency.textContent = "-- Hz";
  peakLevel.textContent = "-- dB";
  sampleRate.textContent = "-- kHz";
  maxPeakDb = -Infinity;
  maxPeak.textContent = "-- dB";
  drawIdleGrid();
}

toggleButton.addEventListener("click", () => {
  if (isRunning) {
    stopAnalysis();
  } else {
    startAnalysis();
  }
});

gainControl.addEventListener("input", () => {
  state.gain = Number(gainControl.value);
});

smoothingControl.addEventListener("input", () => {
  state.smoothing = Number(smoothingControl.value);
  if (analyser) {
    analyser.smoothingTimeConstant = state.smoothing;
  }
});

rangeControl.addEventListener("change", () => {
  state.maxFrequency = Number(rangeControl.value);
  resizeCanvas();
  drawIdleGrid();
});

resetMaxButton.addEventListener("click", () => {
  maxPeakDb = -Infinity;
  maxPeak.textContent = "-- dB";
});

window.addEventListener("resize", resizeCanvas);
window.visualViewport?.addEventListener("resize", resizeCanvas);

const canvasObserver = new ResizeObserver(resizeCanvas);
canvasObserver.observe(canvas);

resizeCanvas();
drawIdleGrid();
