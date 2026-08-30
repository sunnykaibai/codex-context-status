# Codex Context Status

把当前 Codex 对话的上下文占用和账号额度直接显示在 ChatGPT macOS 输入框工具栏中。

```text
完全访问   上下文 123K / 828K  14.9%  |  周额度 79%  09-04 00:52
```

状态节点是输入框工具栏真正的 DOM 子节点，不是浮动的 macOS 窗口。输入框高度变化时，状态会随工具栏一起移动。

> [!IMPORTANT]
> 这是非官方的实验性 macOS 工具，与 OpenAI 没有关联，也未获得 OpenAI 背书。ChatGPT 和 Codex 是 OpenAI 的商标。

## 显示内容

- `last_token_usage.total_tokens`：当前选中的本地对话所占用的 token 数量
- `model_context_window`：本次运行实际报告的上下文上限
- 上下文占用百分比
- 通过 ChatGPT 已认证的 `/wham/usage` 客户端取得主要额度窗口的剩余百分比和重置时间

工具不会把累计的 `total_token_usage` 错当成当前上下文占用。

## 安装条件

- macOS
- `/Applications/ChatGPT.app`
- 本地 Codex 对话会在 `~/.codex/sessions` 下写入事件

安装脚本优先使用 ChatGPT 自带的 Node.js；没有 npm 依赖，也不会自动下载第三方软件。

当前已在 ChatGPT 桌面端 `26.825.31414` 上验证。输入框 DOM 属于应用内部实现，后续版本可能改变。

## 安装

```zsh
git clone https://github.com/sunnykaibai/codex-context-status.git
cd codex-context-status
./install.sh
```

随后执行：

1. 完全退出 ChatGPT。
2. 打开 `~/Applications/ChatGPT Context Status.app`。
3. 运行 `./scripts/doctor.sh`。

ChatGPT 完全退出后，应通过安装生成的启动器重新打开。若本地调试端口已经存在，启动器只会激活当前 ChatGPT。

## 卸载

```zsh
./uninstall.sh
```

卸载脚本会移除输入框中的状态节点、停止后台服务，并把安装文件移到废纸篓。随后正常重启官方 ChatGPT，即可关闭调试端口。

## 工作机制

1. 启动器让官方 ChatGPT 使用仅绑定 `127.0.0.1:17654` 的 Chromium DevTools Protocol。
2. 服务从当前输入框 DOM 读取活动 thread ID，并把它映射到对应的本地 rollout 文件；侧边栏选中项只作为回退。切换对话后不需要发送消息。
3. 用户级 `launchd` 服务从该 rollout 文件读取当前上下文和运行时窗口上限。
4. 服务通过 CDP 在运行时发现 ChatGPT 已认证的 API 客户端，每 30 秒请求一次 `/wham/usage`。只有百分比、窗口长度和重置时间会离开渲染进程。
5. 实时请求暂时失败时，服务回退到 rollout 中最后一条 `rate_limits` 快照。
6. 服务在权限控件 `[data-composer-navigation-target="permissions"]` 后插入状态节点；React 重绘后会自动恢复。

项目不会修改 `ChatGPT.app`，不会上传会话内容，也不包含从 OpenAI 应用中解包的代码。

## 安全边界

CDP 具有读取和修改渲染页面的能力。同一 macOS 用户下的其他进程也能访问没有认证的本地调试端口。项目把端口限制在回环地址，但不能为 CDP 增加认证。

额度请求复用 ChatGPT 自己的认证客户端，凭据不会返回给后台进程；后台只收到百分比、窗口长度和重置时间。

不要在不可信的共享 macOS 账号中使用。安装前请阅读 [SECURITY.md](SECURITY.md)。

## 已知限制

- 无法读取当前选中 thread 的 DOM 标记时，工具才会回退到最近三个本地日期目录中最后更新的 rollout。
- ChatGPT 更新可能改变输入框选择器。运行 `./scripts/doctor.sh`，若出现 `FAIL embedded composer node`，说明当前版本不再兼容。
- 当前只显示主要额度窗口。
- 当前版本只支持 macOS。

## 为什么不做成插件

官方插件 UI 作为 iframe 显示在会话内容旁边，当前没有受支持的接口可以把常驻控件加入宿主输入框。参见 [OpenAI 官方插件 UI 文档](https://developers.openai.com/plugins/build/chatgpt-ui)。

## 开发与验证

```zsh
npm test
npm run check
zsh -n install.sh uninstall.sh scripts/*.sh
plutil -lint app/Info.plist launchd/*.plist
```

## 许可证

[MIT](LICENSE)
