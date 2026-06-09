/* Quick Obsidian — capture UI, config, offline queue. */
(function () {
  "use strict";

  const CFG_KEY = "qo.config";
  const QUEUE_KEY = "qo.queue";
  const DRAFT_KEY = "qo.draft";

  const DEFAULTS = {
    token: "",
    repo: "",
    branch: "main",
    folder: "Inbox",
    daily: "Daily/YYYY-MM-DD.md",
    timestamp: true,
  };

  // --- tiny DOM helper ---
  const $ = (id) => document.getElementById(id);

  const el = {
    capture: $("capture"),
    settings: $("settings"),
    openSettings: $("open-settings"),
    closeSettings: $("close-settings"),
    form: $("note-form"),
    title: $("title"),
    body: $("body"),
    status: $("status"),
    saveBtn: $("save-btn"),
    clearBtn: $("clear-btn"),
    modeTabs: document.querySelectorAll(".mode-tab"),
    queueBanner: $("queue-banner"),
    queueText: $("queue-text"),
    retryBtn: $("retry-btn"),
    // settings fields
    sForm: $("settings-form"),
    cToken: $("cfg-token"),
    cRepo: $("cfg-repo"),
    cBranch: $("cfg-branch"),
    cFolder: $("cfg-folder"),
    cDaily: $("cfg-daily"),
    cTimestamp: $("cfg-timestamp"),
    testBtn: $("test-btn"),
    sStatus: $("settings-status"),
  };

  let mode = "new"; // "new" | "append"

  // --- config storage ---
  function loadConfig() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(CFG_KEY) || "{}") };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }
  function saveConfig(cfg) {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }
  function isConfigured(cfg) {
    return cfg.token && cfg.repo && /\S+\/\S+/.test(cfg.repo);
  }

  // --- date formatting ---
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function formatPattern(pattern, d) {
    return pattern
      .replace(/YYYY/g, d.getFullYear())
      .replace(/MM/g, pad(d.getMonth() + 1))
      .replace(/DD/g, pad(d.getDate()))
      .replace(/HH/g, pad(d.getHours()))
      .replace(/mm/g, pad(d.getMinutes()));
  }

  // Strip characters that are unsafe / awkward in file names.
  function sanitizeFilename(name) {
    return name
      .replace(/[\\/:*?"<>|#^[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function joinPath(folder, file) {
    folder = (folder || "").replace(/^\/+|\/+$/g, "");
    return folder ? folder + "/" + file : file;
  }

  // --- status helpers ---
  function setStatus(node, msg, kind) {
    node.textContent = msg || "";
    node.className = "status" + (kind ? " " + kind : "");
  }

  // --- offline queue ---
  function loadQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }
  function saveQueue(q) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }
  function enqueue(item) {
    const q = loadQueue();
    q.push(item);
    saveQueue(q);
    renderQueue();
  }
  function renderQueue() {
    const q = loadQueue();
    if (q.length === 0) {
      el.queueBanner.classList.add("hidden");
    } else {
      el.queueBanner.classList.remove("hidden");
      el.queueText.textContent = `未送信のメモが ${q.length} 件あります`;
    }
  }

  async function flushQueue(silent) {
    const cfg = loadConfig();
    if (!isConfigured(cfg)) return;
    let q = loadQueue();
    if (q.length === 0) return;
    const remaining = [];
    let sent = 0;
    for (const item of q) {
      try {
        await commitItem(cfg, item);
        sent++;
      } catch (err) {
        remaining.push(item);
      }
    }
    saveQueue(remaining);
    renderQueue();
    if (!silent && sent > 0) {
      setStatus(el.status, `${sent} 件のメモを送信しました`, "ok");
    }
  }

  // --- build + commit a note item ---
  function buildItem(cfg) {
    const now = new Date();
    const title = el.title.value.trim();
    const body = el.body.value;
    if (mode === "append") {
      const path = formatPattern(cfg.daily, now);
      const header = cfg.timestamp ? `- ${pad(now.getHours())}:${pad(now.getMinutes())}` : "";
      return {
        kind: "append",
        path,
        text: body.trim(),
        header,
        message: `quick: append to ${path}`,
        ts: now.toISOString(),
      };
    }
    // new note
    const base = title
      ? sanitizeFilename(title)
      : formatPattern("YYYY-MM-DD HHmm", now);
    const path = joinPath(cfg.folder, base + ".md");
    const front = `---\ncreated: ${formatPattern("YYYY-MM-DD HH:mm", now)}\n---\n\n`;
    const heading = title ? `# ${title}\n\n` : "";
    const content = front + heading + body.replace(/\s*$/, "") + "\n";
    return {
      kind: "new",
      path,
      content,
      message: `quick: ${base}`,
      ts: now.toISOString(),
    };
  }

  async function commitItem(cfg, item) {
    if (item.kind === "append") {
      return GitHub.appendToFile(cfg, item.path, item.text, item.message, item.header);
    }
    return GitHub.createNote(cfg, item.path, item.content, item.message);
  }

  // --- save handler ---
  async function onSave(e) {
    e.preventDefault();
    const cfg = loadConfig();
    if (!isConfigured(cfg)) {
      setStatus(el.status, "先に設定でGitHubトークンとリポジトリを入力してください", "err");
      openSettings();
      return;
    }
    if (!el.body.value.trim() && !el.title.value.trim()) {
      setStatus(el.status, "メモが空です", "err");
      return;
    }

    const item = buildItem(cfg);
    el.saveBtn.disabled = true;
    setStatus(el.status, "保存中…");

    try {
      await commitItem(cfg, item);
      setStatus(el.status, `保存しました → ${item.path}`, "ok");
      el.title.value = "";
      el.body.value = "";
      localStorage.removeItem(DRAFT_KEY);
      flushQueue(true);
    } catch (err) {
      // network failure -> queue for later; API errors -> surface them
      const offline = !navigator.onLine || /Failed to fetch|NetworkError/i.test(err.message);
      if (offline) {
        enqueue(item);
        setStatus(el.status, "オフラインのため保存待ちに入れました。後で自動送信します。", "ok");
        el.title.value = "";
        el.body.value = "";
        localStorage.removeItem(DRAFT_KEY);
      } else {
        setStatus(el.status, "エラー: " + err.message, "err");
      }
    } finally {
      el.saveBtn.disabled = false;
    }
  }

  // --- settings screen ---
  function openSettings() {
    const cfg = loadConfig();
    el.cToken.value = cfg.token;
    el.cRepo.value = cfg.repo;
    el.cBranch.value = cfg.branch;
    el.cFolder.value = cfg.folder;
    el.cDaily.value = cfg.daily;
    el.cTimestamp.checked = !!cfg.timestamp;
    setStatus(el.sStatus, "");
    el.settings.classList.remove("hidden");
    el.capture.classList.add("hidden");
  }
  function closeSettings() {
    el.settings.classList.add("hidden");
    el.capture.classList.remove("hidden");
  }
  function readSettingsForm() {
    return {
      token: el.cToken.value.trim(),
      repo: el.cRepo.value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, ""),
      branch: el.cBranch.value.trim() || "main",
      folder: el.cFolder.value.trim(),
      daily: el.cDaily.value.trim() || DEFAULTS.daily,
      timestamp: el.cTimestamp.checked,
    };
  }
  function onSaveSettings(e) {
    e.preventDefault();
    const cfg = readSettingsForm();
    if (!cfg.repo || !/\S+\/\S+/.test(cfg.repo)) {
      setStatus(el.sStatus, "リポジトリは owner/repo 形式で入力してください", "err");
      return;
    }
    saveConfig(cfg);
    setStatus(el.sStatus, "保存しました", "ok");
    setTimeout(closeSettings, 600);
    flushQueue(true);
  }
  async function onTest() {
    const cfg = readSettingsForm();
    if (!cfg.token || !cfg.repo) {
      setStatus(el.sStatus, "トークンとリポジトリを入力してください", "err");
      return;
    }
    setStatus(el.sStatus, "接続中…");
    el.testBtn.disabled = true;
    try {
      const def = await GitHub.testConnection(cfg);
      setStatus(el.sStatus, `OK：接続成功（既定ブランチ: ${def}）`, "ok");
    } catch (err) {
      setStatus(el.sStatus, "失敗: " + err.message, "err");
    } finally {
      el.testBtn.disabled = false;
    }
  }

  // --- mode tabs ---
  function setMode(next) {
    mode = next;
    el.modeTabs.forEach((t) =>
      t.classList.toggle("is-active", t.dataset.mode === next)
    );
    el.title.classList.toggle("hidden", next === "append");
    el.body.placeholder =
      next === "append"
        ? "デイリーノートに追記する内容…"
        : "ここにメモを Markdown で…";
  }

  // --- draft autosave (so nothing is lost on reload) ---
  function restoreDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
      if (d.title) el.title.value = d.title;
      if (d.body) el.body.value = d.body;
    } catch (_) {}
  }
  function saveDraft() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ title: el.title.value, body: el.body.value })
    );
  }

  // --- wire up ---
  function init() {
    el.form.addEventListener("submit", onSave);
    el.clearBtn.addEventListener("click", () => {
      el.title.value = "";
      el.body.value = "";
      localStorage.removeItem(DRAFT_KEY);
      setStatus(el.status, "");
      el.body.focus();
    });
    el.openSettings.addEventListener("click", openSettings);
    el.closeSettings.addEventListener("click", closeSettings);
    el.sForm.addEventListener("submit", onSaveSettings);
    el.testBtn.addEventListener("click", onTest);
    el.retryBtn.addEventListener("click", () => flushQueue(false));
    el.modeTabs.forEach((t) =>
      t.addEventListener("click", () => setMode(t.dataset.mode))
    );
    el.title.addEventListener("input", saveDraft);
    el.body.addEventListener("input", saveDraft);

    // Ctrl/Cmd+Enter to save quickly
    el.body.addEventListener("keydown", (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
        el.form.requestSubmit();
      }
    });

    window.addEventListener("online", () => flushQueue(false));

    restoreDraft();
    renderQueue();
    setMode("new");

    if (!isConfigured(loadConfig())) {
      openSettings();
      setStatus(el.sStatus, "初回設定：GitHubトークンとリポジトリを入力してください");
    } else {
      flushQueue(true);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
