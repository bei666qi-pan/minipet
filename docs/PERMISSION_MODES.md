# 权限模式矩阵

| 操作 | 演示模式 | 安全模式 | 辅助模式 | 完全访问 | 管理员高级 |
| --- | --- | --- | --- | --- | --- |
| 普通聊天 | 允许 | 允许 | 允许 | 允许 | 不需要 |
| 联网搜索 | 禁止 OpenClaw，允许 UI 演示 | 允许 | 允许 | 允许 | 不需要 |
| 本地生成 Word / PPT / Excel | 禁止 | 允许 | 允许 | 允许 | 不需要 |
| 联网生成或补资料 | 禁止 OpenClaw | 允许 | 允许 | 允许 | 不需要 |
| 浏览器读取页面 | 禁止 OpenClaw | 允许 | 允许 | 允许 | 不需要 |
| 浏览器填写表单 | 禁止 | 禁止 | 确认后允许 | 确认后允许 | 不需要 |
| 浏览器提交表单 | 禁止 | 禁止 | 高风险确认 | 强确认 | 不需要 |
| 读取用户选择文件 | 禁止 OpenClaw | 允许 | 允许 | 允许 | 不需要 |
| 写文件 / 下载 | 禁止 | 禁止或需输出确认 | 确认后允许 | 确认后允许 | 不需要 |
| 删除 / 覆盖重要文件 | 禁止 | 禁止 | 禁止或强确认 | 强确认 | 视 OpenClaw 方法而定 |
| system.run / shell | 禁止 | 禁止 | 禁止 | 强确认 | 可能需要 |
| 安装或更新 skill | 禁止 | 禁止 | 禁止 | 禁止 | Full Access + 管理员高级开关 |
| 修改 OpenClaw 配置 | 禁止 | 禁止 | 禁止 | 禁止 | Full Access + 管理员高级开关 |
| 付款 / 下单 | 禁止 | 禁止 | 禁止 | 强确认 | 不建议 |
| 发送邮件 / 消息 | 禁止 | 禁止 | 高风险确认 | 强确认 | 不需要 |
| 读取 secrets / 凭证 | 禁止 | 禁止 | 禁止 | 强确认且默认阻断 | 不建议 |

## scopes

- Demo Mode：无 scopes
- Safe Mode：`operator.read`，必要时 `operator.write` 仅用于 `chat.send`
- Assisted Mode：`operator.read + operator.write + operator.approvals`
- Full Access：`operator.read + operator.write + operator.approvals + operator.pairing`
- Admin Advanced：额外请求 `operator.admin`
