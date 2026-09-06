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

如果 ChatGPT 正在运行，安装后请完整退出一次。一次性任务会自动用完整状态栏重新打开应用；首次切换期间不要手动抢先打开。

此后，用户级启动守护程序会检查每一个新的 ChatGPT 主进程。如果你从官方 Dock 图标启动，或者更新器重启应用时没有携带 CDP 参数，守护程序会在启动初期自动重开一次，并改用带 Context 状态栏的启动器。它只会向刚发现的主进程发送 `TERM`；如果应用不能正常退出，守护程序不会强制结束进程。

自动重开后，运行 `./scripts/doctor.sh` 检查状态。

## 显示内容

- 当前选中本地对话的 `last_token_usage.total_tokens`
- 运行时实际报告的 `model_context_window`
- 上下文占用百分比
- ChatGPT 已认证 `/wham/usage` 客户端返回的主要额度剩余比例和重置时间

工具不会把累计的 `total_token_usage` 当成当前上下文长度。

## 为什么退出和更新后仍能恢复

Chromium DevTools Protocol（CDP）只能在 Electron 启动时开启，无法事后附加到已经运行的 ChatGPT 进程。启动器负责加入仅监听本机回环地址的 CDP 参数，守护程序负责纠正官方图标启动和更新器重启时缺少参数的情况。

工具不会修改或重新签名官方 `/Applications/ChatGPT.app`。未来版本仍可能修改私有的输入框 DOM；`./scripts/doctor.sh` 会把 DOM 不兼容和启动恢复失败分别报告。

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
