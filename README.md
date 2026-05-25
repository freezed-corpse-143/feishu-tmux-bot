# feishu-tmux-bot

飞书机器人，将收到的消息转发为 tmux 键盘输入。

## 前置条件

- Node.js >= 18
- tmux 已运行目标 session

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 配置
cp config.example.toml config.toml
# 编辑 config.toml，填入真实的 app_id / app_secret
# app_secret 支持 ${ENV_VAR} 环境变量引用

# 3. 开发模式启动
npm run dev

# 4. 或生产构建
npm run build
npm start
```

按 `Ctrl+C` 停止。

## 运行指定 bot

```bash
# 通过环境变量
BOT=mybot1 npm run dev

# 或命令行参数
npm run dev -- --bot=mybot1
```

## 配置

`config.toml` 支持多 bot 配置：

```toml
[[bots]]
name = "mybot1"
app_id = "cli_xxxxxxxxxxxxx"
app_secret = "${FEISHU_APP_SECRET_1}"  # 支持环境变量引用
session = "mybot1"
pane = ":0.0"
port = 9091
```

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（tsx 热重载） |
| `npm run build` | 构建到 dist/ |
| `npm start` | 运行构建产物 |
| `npm test` | 运行测试 |
| `npm run test:watch` | 测试监听模式 |
| `npm run lint` | 代码检查 |
| `npm run format` | 代码格式化 |

## 项目结构

```
src/
  types.ts          —— 核心类型定义
  logger.ts         —— 日志模块
  config.ts         —— 配置加载 & Zod 校验
  route-store.ts    —— message_id → ChatRoute 路由存储（TTL + 异步写盘）
  tmux.ts           —— tmux 交互（send-keys + 消息队列 + session 自愈）
  api-server.ts     —— Fastify HTTP API（/health, /send）
  bot.ts            —— Bot 编排层（WS 事件 → tmux 注入）
  index.ts          —— 入口（多 bot 管理 + graceful shutdown）
```

## 工作原理

通过飞书 WebSocket 长连接接收消息，将消息文本作为键盘输入发送到指定 tmux session。

详见 [SERVICE_API.md](./SERVICE_API.md)。
