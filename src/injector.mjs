import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEBUG_HOST = "127.0.0.1";
const DEBUG_PORT = Number(process.env.CODEX_CONTEXT_STATUS_PORT ?? 17654);
const POLL_INTERVAL_MS = 1000;
const defaultSessionsRoot = process.env.CODEX_SESSIONS_ROOT
  ?? path.join(os.homedir(), ".codex", "sessions");

let socket = null;
let nextRequestId = 1;
let pendingRequests = new Map();
let lastDiagnostic = "";

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

export function readStatus(root = defaultSessionsRoot) {
  const filePath = latestRolloutPath(root);
  if (!filePath) return null;

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
  };
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
  const status = readStatus();
  if (!status) return null;
  if (!(await connect())) return null;
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
    const status = readStatus();
    if (!status) process.exitCode = 1;
    else console.log(JSON.stringify(status, null, 2));
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
