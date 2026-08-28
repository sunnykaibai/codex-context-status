import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compactTokens,
  injectionExpression,
  readStatus,
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
