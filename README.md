# MiniPet OpenClaw Companion

MiniPet OpenClaw Companion 是一个 Windows 优先的中文桌宠 MVP。它把 OpenClaw Gateway、联网搜索、PPT、浏览器控制、文件处理和本地 OpenAI-compatible API 包装成低打扰桌面入口。

桌宠只负责入口、进度、权限提醒和结果展示；真正执行任务的是 OpenClaw Gateway / Skills / MCP。

## 安装

```powershell
cd D:\minipet
pnpm install
```

## 本地启动

```powershell
pnpm run dev
```

首次启动会进入引导页：

- 素材目录默认 `D:\minipet\design\one`
- OpenClaw Gateway 默认尝试 `ws://127.0.0.1:18789` 和 `ws://localhost:18789`
- API Base URL 默认 `https://newkey.versecraft.cn/`
- 安全模式默认开启

## 打包目录

```powershell
pnpm run dist:win
```

输出安装包在 `release/`，同时会生成可直接运行的 `release/win-unpacked`。

## 常用校验

```powershell
pnpm run typecheck
pnpm test
pnpm run build
```

## 配置 OpenClaw

在设置页的 “Gateway / 大模型 API” 中填写：

- Gateway 地址：一行一个 WebSocket 地址
- OpenClaw Token / Password：可留空，保存时使用 Electron `safeStorage`
- 会话默认 `main`

OpenClaw 不在线时，MiniPet 自动进入演示模式。联网搜索、PPT、浏览器和文件工具会提示需要连接 OpenClaw；普通聊天会尝试本地 OpenAI-compatible API。

## 配置 API Key

打开设置页 “大模型 API”：

- Base URL：默认 `https://newkey.versecraft.cn/`
- Model：默认 `minipet`，也可以在高级入口手动修改
- API Key：用户输入，MiniPet 不会写死或写入日志

如果 endpoint 不支持原始 Base URL，客户端会自动尝试 `/v1` 规范化地址，例如 `https://newkey.versecraft.cn/v1/`。

## 素材映射

MiniPet 自动扫描 `png/jpg/jpeg/webp/gif`，并按文件名关键词匹配状态：

- Idle_Welcome
- Listening
- Thinking
- Working_Guide
- Success_Cheer
- Idle_Calm
- Sleepy_Rest
- Shy_Smile
- Surprised_Alert
- Apology_Sad
- Reminder_Warning
- Laptop_Working

如果没有图片，会显示 CSS 绘制的简约占位宠物。你可以在设置页手动把图片映射到每种桌宠状态。

## 快捷入口

- 问一下
- 联网搜索
- 生成 PPT
- 控制浏览器
- 处理文件
- 会话记录 / 任务时间线
- 模型设置
- 技能面板
- 安全模式
- 停止任务

## 安全默认值

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- 渲染端没有 fs、shell、process、API Key 或 OpenClaw token
- 外链、文件、OpenClaw 方法都会经过安全检查
- 高风险操作写入审计日志，日志自动脱敏

详见 [SECURITY.md](./SECURITY.md) 和 [docs/PERMISSION_MODES.md](./docs/PERMISSION_MODES.md)。
