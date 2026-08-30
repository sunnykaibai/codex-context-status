import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEBUG_HOST = "127.0.0.1";
const DEBUG_PORT = Number(process.env.CODEX_CONTEXT_STATUS_PORT ?? 17654);
const POLL_INTERVAL_MS = 1000;
const LIVE_USAGE_INTERVAL_MS = Math.max(
  10_000,
  Number(process.env.CODEX_USAGE_REFRESH_MS ?? 30_000),
);
const defaultSessionsRoot = process.env.CODEX_SESSIONS_ROOT
  ?? path.join(os.homedir(), ".codex", "sessions");

let socket = null;
let nextRequestId = 1;
let pendingRequests = new Map();
let lastDiagnostic = "";
let liveUsage = null;
let nextLiveUsageRefreshAt = 0;
const rolloutPathCache = new Map();

function dateDirectory(root, date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return path.join(root, year, month, day);
}

export function latestRolloutPath(root = defaultSessionsRoot) {
  const candidates = [];
  for (let offset = 0; offset <= 2; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const directory = dateDirectory(root, date);
    let names;
    try {
      names = fs.readdirSync(directory);
    } catch {
      continue;
    }

    for (const name of names) {
      if (!name.startsWith("rollout-") || !name.endsWith(".jsonl")) continue;
      const filePath = path.join(directory, name);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) candidates.push({ filePath, modified: stat.mtimeMs });
      } catch {
        // A session may be rotated while the directory is being scanned.
      }
    }
  }
  candidates.sort((a, b) => b.modified - a.modified);
  return candidates[0]?.filePath ?? null;
}

export function normalizeThreadId(rawThreadId) {
  if (typeof rawThreadId !== "string") return null;
  const value = rawThreadId.startsWith("local:")
    ? rawThreadId.slice("local:".length)
    : rawThreadId;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function childDirectories(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}

function rolloutSegmentMetadata(filePath) {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(64 * 1024);
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    const firstLine = buffer.subarray(0, bytesRead).toString("utf8").split("\n", 1)[0];
    const event = JSON.parse(firstLine);
    if (event?.type !== "session_meta") return null;
    const timestamp = Date.parse(event?.payload?.timestamp ?? event.timestamp);
    return {
      threadId: normalizeThreadId(event?.payload?.id),
      startedAt: Number.isFinite(timestamp) ? timestamp : null,
    };
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

export function rolloutPathsForThread(root, rawThreadId) {
  const threadId = normalizeThreadId(rawThreadId);
  if (!threadId) return [];
  const cacheKey = `${root}\0${threadId}`;
  const cached = rolloutPathCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < 1_000) {
    if (cached.filePaths.every((filePath) => fs.existsSync(filePath))) return cached.filePaths;
  }

  const matches = [];
  const filenamePattern = new RegExp(
    `-${threadId}(?:_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\\.jsonl$`,
    "i",
  );
  for (const year of childDirectories(root)) {
    const yearPath = path.join(root, year);
    for (const month of childDirectories(yearPath)) {
      const monthPath = path.join(yearPath, month);
      for (const day of childDirectories(monthPath)) {
        const dayPath = path.join(monthPath, day);
        let names;
        try {
          names = fs.readdirSync(dayPath);
        } catch {
          continue;
        }
        for (const name of names) {
          if (!name.startsWith("rollout-") || !filenamePattern.test(name)) continue;
          const filePath = path.join(dayPath, name);
          try {
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) continue;
            const metadata = rolloutSegmentMetadata(filePath);
            if (metadata?.threadId !== threadId) continue;
            const startedAt = metadata.startedAt ?? stat.birthtimeMs ?? stat.mtimeMs;
            matches.push({ filePath, modified: stat.mtimeMs, startedAt });
          } catch {
            // The file may be rotated while the index is being built.
          }
        }
      }
    }
  }

  matches.sort((a, b) => b.startedAt - a.startedAt || b.modified - a.modified);
  const filePaths = matches.map((match) => match.filePath);
  rolloutPathCache.set(cacheKey, {
    checkedAt: Date.now(),
    filePaths,
  });
  return filePaths;
}

export function rolloutPathForThread(root, rawThreadId) {
  return rolloutPathsForThread(root, rawThreadId)[0] ?? null;
}

function readTail(filePath, maximumBytes = 32 * 1024 * 1024) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const size = fs.fstatSync(descriptor).size;
    const start = Math.max(0, size - maximumBytes);
    const buffer = Buffer.alloc(size - start);
    fs.readSync(descriptor, buffer, 0, buffer.length, start);
    const text = buffer.toString("utf8");
    if (start === 0) return text;
    const firstNewline = text.indexOf("\n");
    return firstNewline === -1 ? "" : text.slice(firstNewline + 1);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function compactTokens(value) {
  if (value < 1000) return String(value);
  const compact = value / 1000;
  if (compact >= 100 || Number.isInteger(compact)) return `${Math.round(compact)}K`;
  return `${compact.toFixed(1)}K`;
}

function readStatusFromFile(filePath, threadId) {
  let latest = null;
  for (const line of readTail(filePath).split("\n")) {
    if (!line) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.type !== "event_msg" || event?.payload?.type !== "token_count") continue;
    latest = event.payload;
  }

  const info = latest?.info;
  const usage = info?.last_token_usage;
  if (!info || !usage || !Number.isFinite(info.model_context_window)) return null;

  const contextUsed = usage.total_tokens ?? usage.input_tokens ?? 0;
  const contextWindow = info.model_context_window;
  const contextPercent = contextWindow > 0 ? (contextUsed / contextWindow) * 100 : 0;
  const quota = latest?.rate_limits?.primary ?? null;
  const remainingPercent = quota
    ? Math.max(0, Math.min(100, Math.round(100 - quota.used_percent)))
    : null;

  let resetText = null;
  if (quota?.resets_at) {
    const reset = new Date(quota.resets_at * 1000);
    const month = String(reset.getMonth() + 1).padStart(2, "0");
    const day = String(reset.getDate()).padStart(2, "0");
    const hour = String(reset.getHours()).padStart(2, "0");
    const minute = String(reset.getMinutes()).padStart(2, "0");
    resetText = `${month}-${day} ${hour}:${minute}`;
  }

  return {
    contextUsed,
    contextWindow,
    contextUsedText: compactTokens(contextUsed),
    contextWindowText: compactTokens(contextWindow),
    contextPercentText: `${contextPercent.toFixed(1)}%`,
    quotaLabel: quota?.window_minutes === 300
      ? "5 小时"
      : quota?.window_minutes === 10080
        ? "周额度"
        : "额度",
    remainingPercent,
    resetText,
    sourcePath: filePath,
    threadId,
    contextSource: threadId ? "focused-thread" : "latest-rollout",
    usageSource: "rollout",
  };
}

export function readStatus(root = defaultSessionsRoot, rawThreadId = null) {
  const threadId = normalizeThreadId(rawThreadId);
  if (!threadId) {
    const filePath = latestRolloutPath(root);
    return filePath ? readStatusFromFile(filePath, null) : null;
  }

  for (const filePath of rolloutPathsForThread(root, threadId)) {
    const status = readStatusFromFile(filePath, threadId);
    if (status) return status;
  }
  return null;
}

function formatResetTime(timestampSeconds) {
  if (!Number.isFinite(timestampSeconds)) return null;
  const reset = new Date(timestampSeconds * 1000);
  const month = String(reset.getMonth() + 1).padStart(2, "0");
  const day = String(reset.getDate()).padStart(2, "0");
  const hour = String(reset.getHours()).padStart(2, "0");
  const minute = String(reset.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

export function applyLiveUsage(status, usage) {
  if (!status || !usage || !Number.isFinite(usage.usedPercent)) return status;
  const remainingPercent = Math.max(0, Math.min(100, Math.round(100 - usage.usedPercent)));
  const quotaLabel = Math.abs(usage.windowSeconds - 300 * 60) <= 60
    ? "5 小时"
    : Math.abs(usage.windowSeconds - 10_080 * 60) <= 60
      ? "周额度"
      : "额度";
  return {
    ...status,
    quotaLabel,
    remainingPercent,
    resetText: formatResetTime(usage.resetAt),
    usageSource: "live",
    liveUsageFetchedAt: usage.fetchedAt,
  };
}

export function liveUsageExpression() {
  return `(${async function readLiveUsage() {
    const href = Array.from(document.querySelectorAll('link[rel="modulepreload"]'))
      .map((element) => element.href)
      .find((url) => /\/assets\/app-initial-[^/]+\.js$/.test(url));
    if (!href) return { ok: false, reason: "app-initial-module-not-found" };

    const module = await import(href);
    const clients = Object.values(module).filter(
      (value) => value && typeof value.safeGet === "function" && typeof value.safePost === "function",
    );
    for (const client of clients) {
      try {
        const response = await client.safeGet("/wham/usage", {
          additionalHeaders: { "OAI-App-Brand": "codex" },
        });
        const primary = response?.rate_limit?.primary_window;
        if (!primary) continue;
        return {
          ok: true,
          usedPercent: Number.isFinite(primary.used_percent) ? primary.used_percent : 0,
          windowSeconds: primary.limit_window_seconds ?? 0,
          resetAt: primary.reset_at ?? null,
          fetchedAt: Date.now(),
        };
      } catch {
        // More than one authenticated API client can be exported. Try the next one.
      }
    }
    return { ok: false, reason: "authenticated-usage-client-not-found" };
  }.toString()})()`;
}

export function activeThreadExpression() {
  return `(${function readActiveThread() {
    const composerRoot = document.querySelector(
      '[data-codex-composer-root][data-composer-placement="thread"]',
    );
    const composerConversationId = composerRoot
      ?.querySelector(
        '[data-above-composer-portal="true"][data-above-composer-conversation-id]',
      )
      ?.getAttribute("data-above-composer-conversation-id") ?? null;
    if (composerConversationId) {
      return {
        kind: "local",
        source: "composer",
        threadId: composerConversationId,
      };
    }

    const selected = document.querySelector(
      '[data-app-action-sidebar-thread-selected="true"][data-app-action-sidebar-thread-id]',
    ) ?? document.querySelector(
      '[data-app-action-sidebar-thread-active="true"][aria-current="page"][data-app-action-sidebar-thread-id]',
    );
    const raw = selected?.getAttribute("data-app-action-sidebar-thread-id") ?? null;
    if (!raw) return null;
    const separator = raw.indexOf(":");
    return {
      kind: separator === -1 ? null : raw.slice(0, separator),
      source: "sidebar",
      threadId: separator === -1 ? raw : raw.slice(separator + 1),
    };
  }.toString()})()`;
}

export function injectionExpression(status) {
  const payload = JSON.stringify(status);
  return `(${function injectEmbeddedStatus(snapshot) {
    const permission = document.querySelector('[data-composer-navigation-target="permissions"]');
    if (!permission) return { ok: false, reason: "permission-control-not-found" };

    let row = permission.closest("div.flex-nowrap.items-center");
    if (!row) {
      let candidate = permission.parentElement;
      while (candidate && candidate !== document.body) {
        const display = getComputedStyle(candidate).display;
        if (display === "flex" || display === "inline-flex") {
          row = candidate;
          break;
        }
        candidate = candidate.parentElement;
      }
    }
    if (!row) return { ok: false, reason: "composer-row-not-found" };

    let anchor = permission;
    while (anchor.parentElement && anchor.parentElement !== row) anchor = anchor.parentElement;

    let status = document.querySelector('[data-codex-context-status="embedded"]');
    if (!status) {
      status = document.createElement("div");
      status.dataset.codexContextStatus = "embedded";
      status.setAttribute("aria-label", "Current conversation context and usage limits");
      status.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "flex:0 0 auto",
        "gap:6px",
        "margin-inline-start:8px",
        "height:32px",
        "white-space:nowrap",
        "user-select:none",
        "font-size:12px",
        "line-height:16px",
        "font-variant-numeric:tabular-nums",
        "color:var(--text-secondary, rgba(255,255,255,.62))",
      ].join(";");
      status.innerHTML = [
        '<span data-field="context-label" style="opacity:.68">Context</span>',
        '<span data-field="context-value" style="font-weight:560"></span>',
        '<span data-field="context-percent" style="opacity:.68"></span>',
        '<span aria-hidden="true" style="width:1px;height:12px;margin:0 2px;background:currentColor;opacity:.18"></span>',
        '<span data-field="quota-label" style="opacity:.68"></span>',
        '<span data-field="quota-value" style="font-weight:600;color:rgb(61,201,127)"></span>',
        '<span data-field="reset" style="opacity:.55"></span>',
      ].join("");
    }

    const setText = (field, value) => {
      const element = status.querySelector(`[data-field="${field}"]`);
      if (element) element.textContent = value ?? "";
    };
    setText("context-value", `${snapshot.contextUsedText} / ${snapshot.contextWindowText}`);
    setText("context-percent", snapshot.contextPercentText);
    setText("quota-label", snapshot.remainingPercent == null ? "" : snapshot.quotaLabel);
    setText("quota-value", snapshot.remainingPercent == null ? "" : `${snapshot.remainingPercent}%`);
    setText("reset", snapshot.resetText);

    if (status.parentElement !== row || status.previousElementSibling !== anchor) {
      row.insertBefore(status, anchor.nextSibling);
    }

    return {
      ok: true,
      rowClass: row.className,
      usageSource: snapshot.usageSource,
      contextSource: snapshot.contextSource,
      threadSelectionSource: snapshot.threadSelectionSource,
      remainingPercent: snapshot.remainingPercent,
      statusRect: status.getBoundingClientRect().toJSON(),
      permissionRect: permission.getBoundingClientRect().toJSON(),
    };
  }.toString()})(${payload})`;
}

async function discoverPageTarget() {
  const response = await fetch(`http://${DEBUG_HOST}:${DEBUG_PORT}/json`, {
    signal: AbortSignal.timeout(750),
  });
  const targets = await response.json();
  return targets.find((target) => target.type === "page" && target.url === "app://-/index.html")
    ?? targets.find((target) => target.type === "page" && String(target.url).startsWith("app://-") && !String(target.url).includes("avatar-overlay"));
}

async function connect() {
  if (socket?.readyState === WebSocket.OPEN) return true;
  const target = await discoverPageTarget();
  if (!target?.webSocketDebuggerUrl) return false;

  socket = new WebSocket(target.webSocketDebuggerUrl);
  pendingRequests = new Map();
  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!message.id) return;
    const pending = pendingRequests.get(message.id);
    if (!pending) return;
    pendingRequests.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    socket = null;
    for (const pending of pendingRequests.values()) {
      pending.reject(new Error("CDP connection closed"));
    }
    pendingRequests.clear();
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return true;
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (socket?.readyState !== WebSocket.OPEN) {
      reject(new Error("CDP connection is not open"));
      return;
    }
    const id = nextRequestId++;
    pendingRequests.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function injectOnce() {
  if (!(await connect())) return null;
  let activeThread = null;
  try {
    const result = await send("Runtime.evaluate", {
      expression: activeThreadExpression(),
      returnByValue: true,
    });
    activeThread = result?.result?.value ?? null;
  } catch {
    // Fall back to the most recently modified rollout when focus cannot be resolved.
  }
  const focusedThreadId = normalizeThreadId(activeThread?.threadId);
  let status = readStatus(defaultSessionsRoot, focusedThreadId);
  if (status && focusedThreadId) {
    status.threadSelectionSource = activeThread?.source ?? "unknown";
  }
  if (!status && focusedThreadId) {
    status = {
      contextUsedText: "—",
      contextWindowText: "—",
      contextPercentText: "—",
      quotaLabel: "",
      remainingPercent: null,
      resetText: null,
      sourcePath: null,
      threadId: focusedThreadId,
      contextSource: "focused-thread-missing",
      threadSelectionSource: activeThread?.source ?? "unknown",
      usageSource: "rollout",
    };
  }
  if (!status) status = readStatus();
  if (!status) return null;
  const now = Date.now();
  if (now >= nextLiveUsageRefreshAt) {
    try {
      const result = await send("Runtime.evaluate", {
        expression: liveUsageExpression(),
        returnByValue: true,
        awaitPromise: true,
      });
      const value = result?.result?.value;
      if (value?.ok === true) {
        liveUsage = value;
        nextLiveUsageRefreshAt = now + LIVE_USAGE_INTERVAL_MS;
      } else {
        nextLiveUsageRefreshAt = now + 5_000;
      }
    } catch {
      nextLiveUsageRefreshAt = now + 5_000;
    }
  }
  if (
    liveUsage
    && now - liveUsage.fetchedAt <= Math.max(120_000, LIVE_USAGE_INTERVAL_MS * 3)
  ) {
    status = applyLiveUsage(status, liveUsage);
  }
  return send("Runtime.evaluate", {
    expression: injectionExpression(status),
    returnByValue: true,
    awaitPromise: true,
  });
}

async function removeInjectedStatus() {
  if (!(await connect())) return false;
  await send("Runtime.evaluate", {
    expression: 'document.querySelector(\'[data-codex-context-status="embedded"]\')?.remove(); true',
    returnByValue: true,
  });
  return true;
}

async function tick() {
  try {
    const result = await injectOnce();
    if (!result) return;
    const diagnostic = JSON.stringify(result?.result?.value ?? result?.exceptionDetails ?? null);
    if (diagnostic !== lastDiagnostic) {
      console.log(new Date().toISOString(), diagnostic);
      lastDiagnostic = diagnostic;
    }
  } catch (error) {
    socket?.close();
    socket = null;
    const diagnostic = String(error?.message ?? error);
    if (diagnostic !== lastDiagnostic) {
      console.error(new Date().toISOString(), diagnostic);
      lastDiagnostic = diagnostic;
    }
  }
}

async function main() {
  if (process.argv.includes("--print-status")) {
    const threadFlagIndex = process.argv.indexOf("--thread");
    const requestedThreadId = threadFlagIndex === -1
      ? null
      : process.argv[threadFlagIndex + 1] ?? null;
    const status = readStatus(defaultSessionsRoot, requestedThreadId);
    if (!status) process.exitCode = 1;
    else console.log(JSON.stringify(status, null, 2));
    return;
  }
  if (process.argv.includes("--print-active-thread")) {
    try {
      if (!(await connect())) {
        process.exitCode = 1;
        return;
      }
      const result = await send("Runtime.evaluate", {
        expression: activeThreadExpression(),
        returnByValue: true,
      });
      console.log(JSON.stringify(result?.result?.value ?? null, null, 2));
    } finally {
      socket?.close();
    }
    return;
  }
  if (process.argv.includes("--print-live-usage")) {
    try {
      if (!(await connect())) {
        process.exitCode = 1;
        return;
      }
      const result = await send("Runtime.evaluate", {
        expression: liveUsageExpression(),
        returnByValue: true,
        awaitPromise: true,
      });
      console.log(JSON.stringify(result?.result?.value ?? null, null, 2));
    } finally {
      socket?.close();
    }
    return;
  }
  if (process.argv.includes("--remove")) {
    try {
      if (!(await removeInjectedStatus())) process.exitCode = 1;
    } finally {
      socket?.close();
    }
    return;
  }

  console.log(new Date().toISOString(), `Waiting for ChatGPT CDP on ${DEBUG_HOST}:${DEBUG_PORT}`);
  await tick();
  const timer = setInterval(tick, POLL_INTERVAL_MS);
  const stop = () => {
    clearInterval(timer);
    socket?.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  await main();
}
