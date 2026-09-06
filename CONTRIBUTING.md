# Contributing

Issues and pull requests are welcome.

Please keep these boundaries:

- Do not commit extracted ChatGPT application assets or OpenAI source bundles.
- Do not include rollout files, logs, screenshots with private conversations, credentials, or cookies.
- Keep native mode free of CDP and keep the optional Legacy debugging endpoint bound to `127.0.0.1`.
- Preserve the distinction between active `last_token_usage` and cumulative `total_token_usage`.
- Include the ChatGPT desktop version and `scripts/doctor-native.sh` output for native-mode reports. Include `scripts/doctor.sh` output when reporting Legacy selector breakage.

Run before submitting:

```zsh
npm test
npm run check
zsh -n install.sh install-legacy.sh uninstall.sh scripts/*.sh
plutil -lint app/Info.plist launchd/*.plist
```
