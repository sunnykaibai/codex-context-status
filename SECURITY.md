# Security

## Native mode

The default installer enables a ChatGPT-owned preference in `~/.codex/.codex-global-state.json`. It does not modify the ChatGPT application bundle, inspect conversations, open a network listener, or reuse authenticated requests.

The installer preserves a one-time copy of the pre-install state at `~/.codex/.codex-global-state.json.codex-context-status.bak`. Updates are written to a temporary file in the same directory and atomically renamed into place.

## Legacy local debugging endpoint

The optional `install-legacy.sh` starts ChatGPT with Chromium DevTools Protocol on `127.0.0.1:17654`. CDP has no authentication and can inspect or modify renderer content. Any process running as the same macOS user may be able to connect while ChatGPT is running.

The launcher explicitly binds to loopback. Do not change the debugging address to `0.0.0.0` or expose the port through port forwarding, containers, SSH tunnels, or network proxies.

## Legacy local data

The injector reads JSONL events under `~/.codex/sessions` for token counts and context-window size. For current account limits, it asks ChatGPT's existing authenticated client to request `/wham/usage`. The injected expression returns only `used_percent`, `limit_window_seconds`, `reset_at`, and a fetch timestamp. Credentials and the endpoint's account fields remain inside the renderer.

The project does not need message content, cookies, API keys, email addresses, user IDs, or account IDs.

The diagnostic log contains DOM selector results, element rectangles, and errors. It should not contain conversation text.

## Trust boundary

Install only from a source tree you have reviewed. Legacy mode creates:

- `~/Applications/ChatGPT Context Status.app`
- `~/Library/Application Support/CodexContextStatus/`
- `~/Library/LaunchAgents/io.github.sunnykaibai.codex-context-status.injector.plist`
- `~/Library/Logs/CodexContextStatus.log`

The official `/Applications/ChatGPT.app` is not modified or re-signed.

## Reporting a vulnerability

Open a GitHub security advisory for vulnerabilities that expose conversation data, widen the debugging listener beyond loopback, or execute untrusted content. Avoid posting sensitive reproduction data in a public issue.
