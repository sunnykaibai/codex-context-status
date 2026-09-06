# Codex Context Status

Persistently show the active Codex context-window usage inside the ChatGPT macOS composer.

Version 0.2 uses the context indicator built into ChatGPT itself. It follows the selected conversation, survives normal `Cmd-Q` restarts, and is stored outside the application bundle, so ordinary app updates do not remove it.

> [!IMPORTANT]
> This is an unofficial macOS utility. It is not affiliated with or endorsed by OpenAI. ChatGPT and Codex are trademarks of OpenAI.

[简体中文说明](README.zh-CN.md)

## Native mode (recommended)

```zsh
git clone https://github.com/sunnykaibai/codex-context-status.git
cd codex-context-status
./install.sh
```

The installer enables ChatGPT's native `show-context-window-usage` preference and disables the old CDP injector service. If ChatGPT is already open, quit it once and reopen the official `/Applications/ChatGPT.app`.

Verify the installation with `./scripts/doctor-native.sh`.

The native indicator is part of the composer footer. Hovering it shows the percentage and the used/context-window token counts. Because ChatGPT owns the component and its data, it updates with the active conversation and handles resumed and forked conversations without scanning rollout files.

## Why v0.2 changed the architecture

Versions 0.1.x inserted a combined context and weekly-quota bar through Chromium DevTools Protocol (CDP). CDP must be enabled when the Electron process starts. A background LaunchAgent cannot add that flag to an app already opened from the official Dock icon, and the built-in updater can relaunch ChatGPT without it.

The native preference is stored in `~/.codex/.codex-global-state.json`, not inside `/Applications/ChatGPT.app`. The installer updates both the primary state and Codex's recovery copy atomically, and keeps a one-time safety copy at `~/.codex/.codex-global-state.json.codex-context-status.bak`.

No ChatGPT application files are modified or re-signed.

## Legacy combined context + quota bar

The native ChatGPT component currently shows context usage only. ChatGPT does not expose a supported composer extension point for adding the weekly quota and reset time.

If you prefer the old combined text bar, run `./install-legacy.sh`, completely quit ChatGPT, and open `~/Applications/ChatGPT Context Status.app`. This mode retains the original limitation: after a full quit or an updater relaunch, it works only when ChatGPT starts with the special launcher and CDP port.

## Security

Native mode does not open a debugging port. Legacy mode binds CDP to `127.0.0.1:17654`; another process running as the same macOS user can inspect or modify the renderer while that port is open. Read [SECURITY.md](SECURITY.md) before enabling Legacy mode.

## Uninstall

```zsh
./uninstall.sh
```

## Development

```zsh
npm test
npm run check
zsh -n install.sh install-legacy.sh uninstall.sh scripts/*.sh
plutil -lint app/Info.plist launchd/*.plist
```

## License

[MIT](LICENSE)
