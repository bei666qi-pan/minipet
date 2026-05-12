# Security

MiniPet 的安全目标是：默认适合中文新手用户，避免桌宠在无确认时操作文件、浏览器、系统命令或第三方技能。

## 权限模式

- 演示模式：OpenClaw 不在线时默认启用。不执行 OpenClaw 工具。
- 安全模式：默认模式。阻止删除文件、提交表单、安装技能、修改配置、shell、读取密钥等高风险行为。
- 辅助模式：允许更多任务，但写文件、下载、填写表单、生成文件等中风险行为需要确认。
- 完全访问模式：需要输入确认短语。仍会对删除、覆盖、shell、安装技能、付款、发消息、读取 secrets 等动作强确认。
- 管理员高级开关：仅在完全访问模式下额外开启，才允许请求 `operator.admin` 或安装技能。

## 密钥

API Key 和 OpenClaw token 使用 Electron `safeStorage` 加密保存。若当前环境不支持安全加密，UI 会提示用户，允许仅本次会话使用。

密钥不会：

- 写死在源码
- 暴露给 React renderer
- 写入审计日志
- 出现在 OpenClaw 事件预览中

## Electron 安全

BrowserWindow 使用：

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- `allowRunningInsecureContent: false`

Preload 只暴露白名单 IPC。Renderer 不直接访问 fs、shell、process、密钥或 token。

## 第三方 Skill 风险

MiniPet 只显示推荐技能，不自动安装。安装第三方 skill 可能带来未审计代码风险。安装或更新 skill 必须使用 Full Access，并打开管理员高级开关。

## 文件安全

默认不会扫描全盘。安全模式只读取用户主动选择或拖入的文件。删除、覆盖和写入重要位置必须确认。

## 浏览器控制安全

安全模式不允许自动提交表单、付款、删除、发送消息或读取敏感凭证。完全访问模式也会对付款、删除、发送消息、提交敏感信息做二次确认。

## 日志

审计日志写入 `%APPDATA%\minipet\logs\audit.log`。日志会脱敏 token、password、secret、API key 和 bearer token。
