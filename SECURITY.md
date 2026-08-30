# Security

## Local debugging endpoint

This project starts ChatGPT with Chromium DevTools Protocol on `127.0.0.1:17654`. CDP has no authentication and can inspect or modify renderer content. Any process running as the same macOS user may be able to connect while ChatGPT is running.

The launcher explicitly binds to loopback. Do not change the debugging address to `0.0.0.0` or expose the port through port forwarding, containers, SSH tunnels, or network proxies.

## Local data

The injector reads JSONL events under `~/.codex/sessions` for token counts and context-window size. For current account limits, it asks ChatGPT's existing authenticated client to request `/wham/usage`. The injected expression returns only `used_percent`, `limit_window_seconds`, `reset_at`, and a fetch timestamp. Credentials and the endpoint's account fields remain inside the renderer.

The project does not need message content, cookies, API keys, email addresses, user IDs, or account IDs.

The diagnostic log contains DOM selector results, element rectangles, and errors. It should not contain conversation text.

## Trust boundary

Install only from a source tree you have reviewed. The installer creates:

- `~/Applications/ChatGPT Context Status.app`
- `~/Library/Application Support/CodexContextStatus/`
- `~/Library/LaunchAgents/io.github.sunnykaibai.codex-context-status.injector.plist`
- `~/Library/Logs/CodexContextStatus.log`

The official `/Applications/ChatGPT.app` is not modified or re-signed.

## Reporting a vulnerability

Open a GitHub security advisory for vulnerabilities that expose conversation data, widen the debugging listener beyond loopback, or execute untrusted content. Avoid posting sensitive reproduction data in a public issue.
