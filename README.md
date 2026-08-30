# Codex Context Status

Show the active Codex context window and account usage limit directly inside the ChatGPT macOS composer.

```text
Full access   Context 123K / 828K  14.9%  |  Weekly 79%  09-04 00:52
```

The status is a real child of the composer toolbar DOM. It is not a floating macOS window and it moves with the composer when the input area changes size.

> [!IMPORTANT]
> This is an unofficial, experimental macOS utility. It is not affiliated with or endorsed by OpenAI. ChatGPT and Codex are trademarks of OpenAI.

[简体中文说明](README.zh-CN.md)

## What it shows

- Active conversation tokens from `last_token_usage.total_tokens`
- The runtime-reported `model_context_window`
- Context occupancy percentage
- Remaining primary usage limit and reset time from ChatGPT's authenticated `/wham/usage` client

The utility deliberately does not use cumulative `total_token_usage` as the current context size.

## Requirements

- macOS
- ChatGPT desktop app installed at `/Applications/ChatGPT.app`
- A local Codex conversation that writes events under `~/.codex/sessions`

The installer prefers the Node.js runtime bundled with ChatGPT and falls back to a compatible system Node.js. No npm dependencies are required.

Tested with ChatGPT desktop `26.825.31414`. The composer DOM is private implementation detail and can change in future releases.

## Install

```zsh
git clone https://github.com/sunnykaibai/codex-context-status.git
cd codex-context-status
./install.sh
```

Then:

1. Quit ChatGPT completely.
2. Open `~/Applications/ChatGPT Context Status.app`.
3. Run `./scripts/doctor.sh`.

Use the installed launcher whenever ChatGPT has been fully quit. If ChatGPT is already running with the loopback debugging port, the launcher simply activates it.

## Uninstall

```zsh
./uninstall.sh
```

The uninstaller removes the injected node, stops the background service, and moves installed files to Trash. Quit ChatGPT and reopen the official app normally to close the debugging port.

## How it works

1. The launcher starts the official ChatGPT app with Chromium DevTools Protocol bound to `127.0.0.1:17654`.
2. A user-level `launchd` service reads the newest local Codex rollout file for active context tokens and the runtime context window.
3. Through CDP, the service discovers ChatGPT's authenticated API client at runtime and requests `/wham/usage` every 30 seconds. Only percentage, window length, and reset time leave the renderer.
4. If the live request is temporarily unavailable, the service falls back to the last `rate_limits` snapshot in the rollout.
5. It inserts a status node immediately after `[data-composer-navigation-target="permissions"]` and restores it after React rerenders.

The project does not modify `ChatGPT.app`, upload session contents, or include extracted OpenAI application code.

## Security model

Remote debugging is powerful: another process running as your macOS user can inspect or modify the ChatGPT renderer while the port is open. This project reduces exposure by binding the endpoint to loopback only, but CDP does not provide authentication.

The live usage request reuses ChatGPT's authenticated client. Credentials stay inside the renderer; the background process receives only percentage, window length, and reset time.

Do not use this project on an untrusted shared macOS account. Read [SECURITY.md](SECURITY.md) before installing.

## Known limitations

- The displayed conversation is the most recently modified rollout file from the last three local calendar days. A background task can temporarily become the newest rollout.
- Composer selectors may change after a ChatGPT desktop update. `./scripts/doctor.sh` reports `FAIL embedded composer node` when injection no longer matches.
- Only the primary usage-limit window is displayed.
- macOS is the only supported platform in this release.

## Why this is not a plugin

Official plugin UI is rendered as an iframe alongside a conversation. The current plugin surface does not provide a supported way to add a persistent control to the host composer. See [OpenAI's plugin UI documentation](https://developers.openai.com/plugins/build/chatgpt-ui).

## Development

```zsh
npm test
npm run check
zsh -n install.sh uninstall.sh scripts/*.sh
plutil -lint app/Info.plist launchd/*.plist
```

## License

[MIT](LICENSE)
