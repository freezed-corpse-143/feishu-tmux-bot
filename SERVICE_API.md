# feishu-tmux-bot Service API

## 启动注入

Bot 启动后向 tmux 注入一行铭牌 + 能力发现提示：

```
[feishu-tmux-bot :9091]  发现能力: curl -s localhost:9091/capabilities
```

## 能力发现

```bash
curl -s http://localhost:{{API_PORT}}/capabilities
```

返回所有可用端点及版本号。

## 端点

### GET /health

健康检查。

```bash
curl http://localhost:{{API_PORT}}/health
# → {"status":"ok","ts":"2026-05-25T..."}
```

### POST /send

回复纯文本消息（向后兼容）。

```bash
curl -s -X POST http://localhost:{{API_PORT}}/send \
  -H 'Content-Type: application/json' \
  -d '{"message_id":"om_xxx","text":"回复内容"}'
```

### POST /reply

统一回复接口，支持 `text` 和 `post` 格式。

```bash
# 纯文本
curl -s -X POST http://localhost:{{API_PORT}}/reply \
  -H 'Content-Type: application/json' \
  -d '{"message_id":"om_xxx","text":"回复内容"}'

# 富文本 (post)
curl -s -X POST http://localhost:{{API_PORT}}/reply \
  -H 'Content-Type: application/json' \
  -d '{"message_id":"om_xxx","format":"post","content":{"zh_cn":{"title":"标题","content":[[{"tag":"text","text":"正文"}]]}}}'
```

### POST /react

添加或删除表情回复。

```bash
# 添加
curl -s -X POST http://localhost:{{API_PORT}}/react \
  -H 'Content-Type: application/json' \
  -d '{"message_id":"om_xxx","emoji":"thumbsup"}'

# 删除 Bot 自己的 reaction
curl -s -X POST http://localhost:{{API_PORT}}/react \
  -H 'Content-Type: application/json' \
  -d '{"message_id":"om_xxx","emoji":"thumbsup","action":"remove"}'
```

### POST /upload

上传文件或图片到飞书，返回 `image_key` 或 `file_key`。

```bash
curl -s -X POST http://localhost:{{API_PORT}}/upload \
  -F 'file=@/path/to/image.png'

# → {"ok":true,"image_key":"img_xxx"}
```

### GET /download/:message_id

下载消息中的媒体资源到本地 `downloads/` 目录。

```bash
curl -s http://localhost:{{API_PORT}}/download/om_xxx
# → {"ok":true,"path":"downloads/om_xxx_img_abc.image","file_key":"img_abc"}
```

### GET /history/:chat_id

拉取聊天历史（最近消息）。

```bash
curl -s 'http://localhost:{{API_PORT}}/history/oc_chat_id?limit=20'
# → {"ok":true,"messages":[...],"has_more":false}
```

### GET /message/:message_id

获取单条消息详情。

```bash
curl -s http://localhost:{{API_PORT}}/message/om_xxx
# → {"ok":true,"message":{"message_id":"om_xxx","msg_type":"text",...}}
```

### POST /card

发送交互式卡片。

```bash
curl -s -X POST http://localhost:{{API_PORT}}/card \
  -H 'Content-Type: application/json' \
  -d '{
    "message_id":"om_xxx",
    "title":"卡片标题",
    "markdown":"这是 **卡片内容**",
    "buttons":[{"label":"确认","type":"primary"}]
  }'
```

## 向后兼容

`POST /send` 保留原有行为不变。所有依赖旧 API 的客户端无需修改。
