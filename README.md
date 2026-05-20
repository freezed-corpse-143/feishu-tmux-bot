# feishu-tmux-bot

飞书机器人，将收到的消息转发为 tmux 键盘输入。

## 前置条件

- Node.js >= 14
- tmux 已运行目标 session

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（编辑 .env 填入凭证和端口）
cp .env .env.local

# 3. 启动
set -a && source .env && set +a
npm start
```

按 `Ctrl+C` 停止。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `FEISHU_APP_ID` | 飞书应用 App ID | 必填 |
| `FEISHU_APP_SECRET` | 飞书应用 App Secret | 必填 |
| `TMUX_SESSION_NAME` | 目标 tmux session 名称 | `default` |
| `API_PORT` | HTTP API 端口 | `9091` |

## 工作原理

通过飞书 WebSocket 长连接接收消息，将消息文本作为键盘输入发送到指定 tmux session。

详见 [SERVICE_API.md](./SERVICE_API.md)。
