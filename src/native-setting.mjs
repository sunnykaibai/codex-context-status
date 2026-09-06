#!/usr/bin/env node

import { chmod, copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const STATE_KEY = "electron-persisted-atom-state";
export const SETTING_KEY = "show-context-window-usage";

export function withNativeContextSetting(state, enabled) {
  if (state == null || Array.isArray(state) || typeof state !== "object") {
    throw new TypeError("Codex global state must be a JSON object");
  }

  const next = structuredClone(state);
  const atoms = next[STATE_KEY];
  if (atoms != null && (Array.isArray(atoms) || typeof atoms !== "object")) {
    throw new TypeError(`${STATE_KEY} must be a JSON object`);
  }

  next[STATE_KEY] = { ...(atoms ?? {}), [SETTING_KEY]: Boolean(enabled) };
  return next;
}

async function writeJsonAtomically(path, value, mode) {
  const tempPath = `${path}.codex-context-status.tmp-${process.pid}`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await chmod(tempPath, mode);
  await rename(tempPath, path);
}

export async function setNativeContextSetting({
  enabled = true,
  codexHome = process.env.CODEX_HOME || join(homedir(), ".codex"),
} = {}) {
  const statePath = join(codexHome, ".codex-global-state.json");
  const backupPath = `${statePath}.bak`;
  const safetyBackupPath = `${statePath}.codex-context-status.bak`;
  const raw = await readFile(statePath, "utf8");
  const current = JSON.parse(raw);
  const previous = current?.[STATE_KEY]?.[SETTING_KEY];
  const next = withNativeContextSetting(current, enabled);
  const fileStat = await stat(statePath);

  await mkdir(dirname(statePath), { recursive: true });
  try {
    await stat(safetyBackupPath);
  } catch {
    await copyFile(statePath, safetyBackupPath);
    await chmod(safetyBackupPath, fileStat.mode);
  }

  await writeJsonAtomically(statePath, next, fileStat.mode);

  // Codex itself maintains this recovery copy. Keep both files consistent so
  // startup fallback cannot silently restore the old setting.
  await writeJsonAtomically(backupPath, next, fileStat.mode);

  return { statePath, backupPath, safetyBackupPath, previous, enabled };
}

async function readStatus(codexHome = process.env.CODEX_HOME || join(homedir(), ".codex")) {
  const statePath = join(codexHome, ".codex-global-state.json");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  return {
    statePath,
    enabled: state?.[STATE_KEY]?.[SETTING_KEY] === true,
    value: state?.[STATE_KEY]?.[SETTING_KEY] ?? null,
  };
}

async function main() {
  const command = process.argv[2] ?? "enable";
  if (command === "status") {
    const result = await readStatus();
    console.log(JSON.stringify(result));
    process.exitCode = result.enabled ? 0 : 1;
    return;
  }
  if (command !== "enable" && command !== "disable") {
    throw new Error("Usage: native-setting.mjs [enable|disable|status]");
  }

  const result = await setNativeContextSetting({ enabled: command === "enable" });
  console.log(
    `${result.enabled ? "Enabled" : "Disabled"} Codex's native context window indicator in ${result.statePath}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
