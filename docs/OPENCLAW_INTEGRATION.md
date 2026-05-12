# OpenClaw 集成

## 默认连接

MiniPet 默认尝试：

- `ws://127.0.0.1:18789`
- `ws://localhost:18789`

Handshake：

```json
{
  "role": "operator",
  "scopes": ["operator.read", "operator.write"],
  "sessionKey": "main"
}
```

Token / password 从设置页输入，经 `safeStorage` 保存，不暴露给 renderer。

## 方法

MVP 尝试调用：

- `health`
- `status`
- `chat.send`
- `chat.history`
- `sessions.list`
- `models.list`
- `logs.tail`

如果 Gateway 不支持某方法，UI 显示“当前 OpenClaw 版本不支持此功能”，不假装成功。

## 事件

OpenClaw WebSocket 推送事件会被解析为：

- `requestId`
- `localRequestId`
- `sessionId`
- `messageId`
- `method`
- `status`
- `text`
- `payload`

任务更新只匹配同一个 `localRequestId` 或已绑定的 request id。任务进入 `success/error/stopped` 后，晚到事件不会把它重新改成 running。

## 失败处理

- Gateway 不在线：进入 Demo Mode
- `chat.send` 不支持：提示版本不支持
- 连接失败：保留桌宠 UI，普通聊天走 OpenAI-compatible API
- OpenAI-compatible endpoint 失败：自动尝试 `/v1` Base URL

## Prompt 模板

联网搜索、PPT、浏览器和文件处理均通过明确安全 prompt 发送给 OpenClaw。MiniPet 不自动提交表单，不默认读取全盘，不自动安装技能。
