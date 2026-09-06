# Codex Context Status

在 ChatGPT macOS 输入框内显示当前 Codex 对话的上下文占用和账户额度。

```text
完全访问   Context 123K / 828K  14.9%  |  周额度 79%  09-04 00:52
```

状态栏是输入框工具栏的真实 DOM 子节点，不是浮动的 macOS 窗口；输入框尺寸变化时，它会跟随输入框移动。

> [!IMPORTANT]
> 这是非官方实验性 macOS 工具，与 OpenAI 没有关联，也未获得 OpenAI 背书。ChatGPT 和 Codex 是 OpenAI 的商标。

## 安装

```zsh
git clone https://github.com/sunnykaibai/codex-context-status.git
cd codex-context-status
./install.sh
```

安装器不会结束或自动重启 ChatGPT。如果当前进程已经开启 CDP，状态栏会立即出现。完整退出后，请打开 `~/Applications/ChatGPT Context Status.app`，然后运行 `./scripts/doctor.sh` 检查状态。

## 显示内容

- 当前选中本地对话的 `last_token_usage.total_tokens`
- 运行时实际报告的 `model_context_window`
- 上下文占用百分比
- ChatGPT 已认证 `/wham/usage` 客户端返回的主要额度剩余比例和重置时间

工具不会把累计的 `total_token_usage` 当成当前上下文长度。

## 退出和更新的边界

Chromium DevTools Protocol（CDP）只能在 Electron 启动时开启，无法事后附加到已经运行的 ChatGPT 进程。专用启动器负责加入仅监听本机回环地址的 CDP 参数。这个项目不会为了替换正常启动的 ChatGPT 而主动结束应用。

工具不会修改或重新签名官方 `/Applications/ChatGPT.app`。未来版本仍可能修改私有的输入框 DOM，更新器重启时也可能省略 CDP 参数；`./scripts/doctor.sh` 会准确报告这两类故障。

## 原生紧凑模式

ChatGPT 自带一个只显示 Context 的小图标。它不依赖 CDP，但不显示周额度和重置时间，也不能保留这套文字栏视觉。需要切换时运行：

```zsh
./install-native.sh
```

## 安全性

完整状态栏会在 `127.0.0.1:17654` 开启 CDP。端口开启时，同一 macOS 用户下的其他进程可以检查或修改 renderer。安装前请阅读 [SECURITY.md](SECURITY.md)。

## 卸载

```zsh
./uninstall.sh
```

## 开发验证

```zsh
npm test
npm run check
zsh -n install.sh install-native.sh install-legacy.sh uninstall.sh scripts/*.sh
plutil -lint app/Info.plist launchd/*.plist
```

## 许可证

[MIT](LICENSE)
