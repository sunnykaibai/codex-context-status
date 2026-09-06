# Codex Context Status

在 ChatGPT macOS 输入框内持久显示当前 Codex 对话的上下文占用。

0.2 版改用 ChatGPT 自带的 Context 指示器。它由应用按当前对话更新，正常 `Cmd-Q` 退出重开后仍然有效；设置保存在应用包之外，普通的 ChatGPT 自动更新也不会删除它。

> [!IMPORTANT]
> 这是非官方 macOS 工具，与 OpenAI 没有关联，也未获得 OpenAI 背书。ChatGPT 和 Codex 是 OpenAI 的商标。

## 原生模式（推荐）

```zsh
git clone https://github.com/sunnykaibai/codex-context-status.git
cd codex-context-status
./install.sh
```

安装器会启用 ChatGPT 原生的 `show-context-window-usage` 设置，并停用旧的 CDP 注入服务。如果 ChatGPT 正在运行，请完整退出一次，然后直接打开官方 `/Applications/ChatGPT.app`。

使用 `./scripts/doctor-native.sh` 检查安装结果。

原生指示器位于输入框底部工具栏。把鼠标移到图标上，会显示占用百分比和“已用 token / 上下文窗口 token”。组件和数据都由 ChatGPT 自身管理，因此切换对话、恢复对话和 fork 对话时，不需要再扫描本地 rollout 文件。

## 为什么 0.2 版要更换实现

0.1.x 通过 Chromium DevTools Protocol（CDP）插入“Context + 周额度 + 重置时间”文字栏。CDP 参数只能在 Electron 进程启动时加入。后台 LaunchAgent 无法给已经从官方 Dock 图标打开的 ChatGPT 补参数，应用更新器重启 ChatGPT 时也可能不带这个参数。

原生开关保存在 `~/.codex/.codex-global-state.json`，不在 `/Applications/ChatGPT.app` 内。安装器会原子更新主状态文件和 Codex 的恢复副本，并保留一份首次修改前的安全备份：`~/.codex/.codex-global-state.json.codex-context-status.bak`。

这个方案不会修改或重新签名 ChatGPT 应用。

## 旧版 Context + 周额度组合栏

ChatGPT 当前的原生组件只显示上下文占用，没有提供把周额度和重置时间加入输入框的受支持扩展接口。

如果你更喜欢原来的组合文字栏，可以运行 `./install-legacy.sh`，然后完整退出 ChatGPT，并打开 `~/Applications/ChatGPT Context Status.app`。这个模式仍有原来的限制：完整退出或更新器重启后，必须通过特殊启动器启动 ChatGPT 并打开 CDP 端口。

## 安全性

原生模式不会打开调试端口。Legacy 模式会在 `127.0.0.1:17654` 开启 CDP；端口开启时，同一 macOS 用户下的其他进程可以检查或修改 renderer。启用 Legacy 模式前请阅读 [SECURITY.md](SECURITY.md)。

## 卸载

```zsh
./uninstall.sh
```

## 开发验证

```zsh
npm test
npm run check
zsh -n install.sh install-legacy.sh uninstall.sh scripts/*.sh
plutil -lint app/Info.plist launchd/*.plist
```

## 许可证

[MIT](LICENSE)
