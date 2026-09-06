# Codex Context Status

Show the active Codex context window and account usage limit directly inside the ChatGPT macOS composer.

```text
Full access   Context 123K / 828K  14.9%  |  Weekly 79%  09-04 00:52
```

The status is a real child of the composer toolbar DOM. It is not a floating macOS window and moves with the composer when the input area changes size.

> [!IMPORTANT]
> This is an unofficial, experimental macOS utility. It is not affiliated with or endorsed by OpenAI. ChatGPT and Codex are trademarks of OpenAI.

[简体中文说明](README.zh-CN.md)

## Install

```zsh
git clone https://github.com/sunnykaibai/codex-context-status.git
cd codex-context-status
./install.sh
```

If ChatGPT is running, quit it once after installation. A one-shot task will reopen the app with the full status bar. Do not reopen it manually during this first transition.

Afterwards, a user-level startup supervisor checks every new ChatGPT main process. Opening the official Dock icon or an updater relaunch without CDP causes one early automatic restart through the context-enabled launcher. The supervisor sends `TERM` only to the newly observed main process and refuses to force-kill it if graceful termination fails.

Run `./scripts/doctor.sh` after the automatic reopen.

## What it shows

- Tokens for the currently selected local conversation from `last_token_usage.total_tokens`
- The runtime-reported `model_context_window`
- Context occupancy percentage
- Remaining primary usage limit and reset time from ChatGPT's authenticated `/wham/usage` client

The utility deliberately does not use cumulative `total_token_usage` as the current context size.

## How it survives restarts and updates

Chromium DevTools Protocol (CDP) must be enabled when Electron starts; it cannot be attached to an already running ChatGPT process. The launcher supplies the loopback-only CDP arguments, while the supervisor corrects starts from the official icon and updater relaunches that omit them.

The official `/Applications/ChatGPT.app` is never modified or re-signed. A future ChatGPT release can still change its private composer DOM; `./scripts/doctor.sh` reports that separately from startup recovery.

## Compact native alternative

ChatGPT also contains a native context-only indicator. It survives updates without CDP, but it does not show the weekly quota or reset time and does not preserve this project's text-bar appearance. To switch to it, run:

```zsh
./install-native.sh
```

## Security

The full bar binds CDP to `127.0.0.1:17654`. Another process running as the same macOS user can inspect or modify the renderer while that port is open. Read [SECURITY.md](SECURITY.md) before installing.

## Uninstall

```zsh
./uninstall.sh
```

## Development

```zsh
npm test
npm run check
zsh -n install.sh install-native.sh install-legacy.sh uninstall.sh scripts/*.sh
plutil -lint app/Info.plist launchd/*.plist
```

## License

[MIT](LICENSE)
