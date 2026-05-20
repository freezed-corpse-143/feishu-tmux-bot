# feishu-tmux-bot Service API

当你在 tmux 中看到以下 JSON 块时，表示收到了一条飞书消息：

```json
{
  "chat_type": "group",
  "chat_id":   "oc_xxx",
  "open_id":   "ou_xxx",
  "message_id":"om_xxx",
  "text":      "用户发送的消息内容"
}
```

收到消息后，**必须通过本 API 回复**，不能直接在终端输出当作回复。

## 回复消息

**强制使用以下格式发送回复**（`printf` 管道 + `--data-binary @-`，避免中文乱码）：

```bash
printf '%s' '{"chat_type":"<chat_type>","chat_id":"<chat_id>","open_id":"<open_id>","text":"<你的回复>"}' | curl -s -X POST -H "Content-Type: application/json; charset=utf-8" --data-binary @- http://localhost:{{API_PORT}}/send
```

- `<chat_type>`、`<chat_id>`、`<open_id>` — 从 inbound JSON 原样填入
- `<你的回复>` — 你的实际回复文本
- **禁止用 `curl -d` 直接传中文**，会编码乱码

## 示例

收到：
```json
{"chat_type":"p2p","chat_id":"oc_xxx","open_id":"ou_123","message_id":"om_456","text":"你好"}
```

回复：
```bash
printf '%s' '{"chat_type":"p2p","chat_id":"oc_xxx","open_id":"ou_123","text":"你好！有什么可以帮你的？"}' | curl -s -X POST -H "Content-Type: application/json; charset=utf-8" --data-binary @- http://localhost:{{API_PORT}}/send
```

## 注意事项

- 收到消息后**主动回复**，不要等用户追问
- **必须用 `printf` + `--data-binary @-` 格式**，不可用 `curl -d` 直接传中文
- `text` 字段直接写纯文本即可
- 群聊和私聊只需原样回传 `chat_type`、`chat_id`、`open_id`

## Health

```bash
curl http://localhost:{{API_PORT}}/health
```
