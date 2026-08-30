import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  activeThreadExpression,
  applyLiveUsage,
  compactTokens,
  injectionExpression,
  liveUsageExpression,
  normalizeThreadId,
  readStatus,
  rolloutPathForThread,
} from "../src/injector.mjs";

test("formats token counts compactly", () => {
  assert.equal(compactTokens(999), "999");
  assert.equal(compactTokens(20_300), "20.3K");
  assert.equal(compactTokens(828_400), "828K");
});

test("reads the latest active token_count instead of cumulative usage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-context-status-test-"));
  const now = new Date();
  const directory = path.join(
    root,
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  );
  fs.mkdirSync(directory, { recursive: true });
  const rollout = path.join(directory, "rollout-test.jsonl");
  const event = {
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: { total_tokens: 900_000 },
        last_token_usage: { input_tokens: 120_000, total_tokens: 123_456 },
        model_context_window: 828_400,
      },
      rate_limits: {
        primary: {
          used_percent: 21,
          window_minutes: 10_080,
          resets_at: 1_788_454_349,
        },
      },
    },
  };
  fs.writeFileSync(rollout, `${JSON.stringify({ type: "session_meta" })}\n${JSON.stringify(event)}\n`);

  const status = readStatus(root);
  assert.equal(status.contextUsed, 123_456);
  assert.equal(status.contextWindow, 828_400);
  assert.equal(status.contextUsedText, "123K");
  assert.equal(status.remainingPercent, 79);
  assert.equal(status.quotaLabel, "周额度");
});

test("targets the permission control and creates an embedded node", () => {
  const expression = injectionExpression({
    contextUsedText: "123K",
    contextWindowText: "828K",
    contextPercentText: "14.9%",
    quotaLabel: "周额度",
    remainingPercent: 79,
    resetText: "09-04 00:52",
  });
  assert.match(expression, /data-composer-navigation-target/);
  assert.match(expression, /data-codex-context-status/);
  assert.match(expression, /insertBefore/);
});

test("authoritative live usage overrides a stale rollout quota", () => {
  const merged = applyLiveUsage(
    {
      quotaLabel: "周额度",
      remainingPercent: 70,
      resetText: "09-04 00:52",
      usageSource: "rollout",
    },
    {
      usedPercent: 1,
      windowSeconds: 604_800,
      resetAt: 1_788_659_419,
      fetchedAt: 123,
    },
  );
  assert.equal(merged.remainingPercent, 99);
  assert.equal(merged.usageSource, "live");
  assert.equal(merged.liveUsageFetchedAt, 123);
});

test("discovers the authenticated API client at runtime", () => {
  const expression = liveUsageExpression();
  assert.match(expression, /app-initial-/);
  assert.match(expression, /safeGet/);
  assert.match(expression, /\/wham\/usage/);
  assert.doesNotMatch(expression, /AIt/);
});

test("maps the focused thread ID to its rollout instead of using global mtime", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-context-thread-test-"));
  const now = new Date();
  const directory = path.join(
    root,
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  );
  fs.mkdirSync(directory, { recursive: true });
  const focusedId = "01a0496d-2e1e-7c73-a26a-136256abef3d";
  const newerId = "01a0506d-2065-7443-9c00-af6a9ca642c2";
  const makeEvent = (totalTokens) => JSON.stringify({
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        last_token_usage: { total_tokens: totalTokens },
        model_context_window: 828_400,
      },
      rate_limits: { primary: null },
    },
  });
  const makeMeta = (threadId, timestamp) => JSON.stringify({
    timestamp,
    type: "session_meta",
    payload: { id: threadId, timestamp },
  });
  const focusedPath = path.join(directory, `rollout-2026-01-01T00-00-00-${focusedId}.jsonl`);
  const newerPath = path.join(directory, `rollout-2026-01-02T00-00-00-${newerId}.jsonl`);
  fs.writeFileSync(
    focusedPath,
    `${makeMeta(focusedId, "2026-01-01T00:00:00.000Z")}\n${makeEvent(77_400)}\n`,
  );
  fs.writeFileSync(
    newerPath,
    `${makeMeta(newerId, "2026-01-02T00:00:00.000Z")}\n${makeEvent(300_000)}\n`,
  );
  const newerTime = new Date(Date.now() + 10_000);
  fs.utimesSync(newerPath, newerTime, newerTime);

  assert.equal(normalizeThreadId(`local:${focusedId}`), focusedId);
  assert.equal(rolloutPathForThread(root, focusedId), focusedPath);
  const status = readStatus(root, `local:${focusedId}`);
  assert.equal(status.contextUsed, 77_400);
  assert.equal(status.contextSource, "focused-thread");
  assert.equal(status.threadId, focusedId);
});

test("discovers the selected sidebar thread without reading its title", () => {
  const expression = activeThreadExpression();
  assert.match(expression, /data-codex-composer-root/);
  assert.match(expression, /data-above-composer-conversation-id/);
  assert.match(expression, /data-app-action-sidebar-thread-selected/);
  assert.match(expression, /data-app-action-sidebar-thread-id/);
  assert.doesNotMatch(expression, /thread-title/);
});

test("selects the newest resumed rollout segment for a thread", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-context-resume-test-"));
  const now = new Date();
  const directory = path.join(
    root,
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  );
  fs.mkdirSync(directory, { recursive: true });
  const threadId = "01a02fb7-847f-7ec1-8395-657e5341d95b";
  const resumeId = "01a03755-1111-7222-8333-444455556666";
  const makeFile = (filePath, timestamp, totalTokens = null) => {
    const meta = {
      timestamp,
      type: "session_meta",
      payload: { id: threadId, timestamp },
    };
    const token = {
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: { total_tokens: totalTokens },
          model_context_window: 828_400,
        },
        rate_limits: { primary: null },
      },
    };
    const lines = [JSON.stringify(meta)];
    if (totalTokens != null) lines.push(JSON.stringify(token));
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
  };
  const original = path.join(directory, `rollout-2026-01-01T00-00-00-${threadId}.jsonl`);
  const resumed = path.join(directory, `rollout-2026-01-02T00-00-00-${threadId}_${resumeId}.jsonl`);
  makeFile(original, "2026-01-01T00:00:00.000Z", 10_000);
  makeFile(resumed, "2026-01-02T00:00:00.000Z");

  assert.equal(rolloutPathForThread(root, threadId), resumed);
  assert.equal(readStatus(root, threadId).contextUsed, 10_000);
  makeFile(resumed, "2026-01-02T00:00:00.000Z", 20_000);
  assert.equal(readStatus(root, threadId).contextUsed, 20_000);
});

test("uses the parent token snapshot at the fork boundary until the child has usage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-context-fork-test-"));
  const now = new Date();
  const directory = path.join(
    root,
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  );
  fs.mkdirSync(directory, { recursive: true });
  const parentId = "01a0415f-b8db-7d71-b091-876a2261b939";
  const childId = "01a051be-e7a7-7f11-b367-0efff8c3af88";
  const meta = (id, timestamp, extra = {}) => JSON.stringify({
    timestamp,
    type: "session_meta",
    payload: { id, timestamp, ...extra },
  });
  const token = (ordinal, totalTokens) => JSON.stringify({
    ordinal,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        last_token_usage: { total_tokens: totalTokens },
        model_context_window: 828_400,
      },
      rate_limits: { primary: null },
    },
  });

  const parentPath = path.join(directory, `rollout-2026-01-01T00-00-00-${parentId}.jsonl`);
  const parentPrefix = `${meta(parentId, "2026-01-01T00:00:00.000Z")}\n${token(10, 100_000)}\n`;
  fs.writeFileSync(parentPath, `${parentPrefix}${token(20, 200_000)}\n`);
  const childPath = path.join(directory, `rollout-2026-01-02T00-00-00-${childId}.jsonl`);
  const childMeta = meta(childId, "2026-01-02T00:00:00.000Z", {
    forked_from_id: parentId,
    history_base: {
      thread_id: parentId,
      end_ordinal_exclusive: 15,
      end_byte_offset: Buffer.byteLength(parentPrefix),
    },
  });
  fs.writeFileSync(childPath, `${childMeta}\n`);

  const inherited = readStatus(root, childId);
  assert.equal(inherited.contextUsed, 100_000);
  assert.equal(inherited.contextSource, "fork-history-base");
  assert.equal(inherited.inheritedFromThreadId, parentId);
  assert.equal(inherited.threadId, childId);

  fs.appendFileSync(childPath, `${token(30, 300_000)}\n`);
  const childStatus = readStatus(root, childId);
  assert.equal(childStatus.contextUsed, 300_000);
  assert.equal(childStatus.contextSource, "focused-thread");
});

test("falls back to forked_from_id for legacy forks without history_base", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codex-context-legacy-fork-test-"));
  const root = path.join(base, "sessions");
  const archivedRoot = path.join(base, "archived_sessions");
  fs.mkdirSync(archivedRoot, { recursive: true });
  const now = new Date();
  const directory = path.join(
    root,
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  );
  fs.mkdirSync(directory, { recursive: true });
  const parentId = "01a0415f-b8db-7d71-b091-876a2261b939";
  const childId = "01a04746-64c9-7341-8649-4e3a9219fd4f";
  const parentMeta = JSON.stringify({
    type: "session_meta",
    payload: { id: parentId, timestamp: "2026-01-01T00:00:00.000Z" },
  });
  const parentToken = JSON.stringify({
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        last_token_usage: { total_tokens: 42_000 },
        model_context_window: 258_400,
      },
      rate_limits: { primary: null },
    },
  });
  const childMeta = JSON.stringify({
    type: "session_meta",
    payload: {
      id: childId,
      timestamp: "2026-01-02T00:00:00.000Z",
      forked_from_id: parentId,
    },
  });
  fs.writeFileSync(
    path.join(archivedRoot, `rollout-2026-01-01T00-00-00-${parentId}.jsonl`),
    `${parentMeta}\n${parentToken}\n`,
  );
  fs.writeFileSync(
    path.join(directory, `rollout-2026-01-02T00-00-00-${childId}.jsonl`),
    `${childMeta}\n`,
  );

  const status = readStatus(root, childId);
  assert.equal(status.contextUsed, 42_000);
  assert.equal(status.contextSource, "fork-parent-fallback");
  assert.equal(status.threadId, childId);
});

test("stops safely when malformed fork metadata forms a cycle", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-context-fork-cycle-test-"));
  const now = new Date();
  const directory = path.join(
    root,
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  );
  fs.mkdirSync(directory, { recursive: true });
  const firstId = "01a0415f-b8db-7d71-b091-876a2261b939";
  const secondId = "01a04746-64c9-7341-8649-4e3a9219fd4f";
  const writeFork = (id, parentId, stamp) => {
    const metadata = JSON.stringify({
      type: "session_meta",
      payload: { id, timestamp: stamp, forked_from_id: parentId },
    });
    fs.writeFileSync(
      path.join(directory, `rollout-${stamp.slice(0, 10)}T00-00-00-${id}.jsonl`),
      `${metadata}\n`,
    );
  };
  writeFork(firstId, secondId, "2026-01-01T00:00:00.000Z");
  writeFork(secondId, firstId, "2026-01-02T00:00:00.000Z");

  assert.equal(readStatus(root, firstId), null);
});
