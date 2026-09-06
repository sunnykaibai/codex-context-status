import test from "node:test";
import assert from "node:assert/strict";

import {
  SETTING_KEY,
  STATE_KEY,
  withNativeContextSetting,
} from "../src/native-setting.mjs";

test("enables the native context indicator without changing sibling state", () => {
  const input = {
    untouched: { value: 1 },
    [STATE_KEY]: { existing: "value" },
  };
  const output = withNativeContextSetting(input, true);

  assert.deepEqual(output, {
    untouched: { value: 1 },
    [STATE_KEY]: { existing: "value", [SETTING_KEY]: true },
  });
  assert.equal(input[STATE_KEY][SETTING_KEY], undefined);
});

test("creates persisted atom state when it is absent", () => {
  assert.deepEqual(withNativeContextSetting({ untouched: true }, true), {
    untouched: true,
    [STATE_KEY]: { [SETTING_KEY]: true },
  });
});

test("can explicitly disable the native indicator", () => {
  const output = withNativeContextSetting(
    { [STATE_KEY]: { [SETTING_KEY]: true } },
    false,
  );
  assert.equal(output[STATE_KEY][SETTING_KEY], false);
});

test("rejects malformed persisted atom state", () => {
  assert.throws(
    () => withNativeContextSetting({ [STATE_KEY]: [] }, true),
    /must be a JSON object/,
  );
});
