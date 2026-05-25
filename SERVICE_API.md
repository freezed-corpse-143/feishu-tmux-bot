# feishu-tmux-bot Service API

收到消息时，tmux 中会出现：

```
[飞书消息 message_id=om_xxx]
用户消息内容

回复: printf '%s' '{"message_id":"om_xxx","text":"<你的回复>"}' | curl -s -X POST -H "Content-Type: application/json; charset=utf-8" --data-binary @- http://localhost:{{API_PORT}}/send
```

**使用方法**：把 `<你的回复>` 替换为实际回复文本，整行执行即可。

## 示例

收到：
```
[飞书消息 message_id=om_456]
你好

回复: printf '%s' '{"message_id":"om_456","text":"<你的回复>"}' | curl -s -X POST -H "Content-Type: application/json; charset=utf-8" --data-binary @- http://localhost:{{API_PORT}}/send
```

回复时替换 `<你的回复>`：
```bash
printf '%s' '{"message_id":"om_456","text":"你好！有什么可以帮你的？"}' | curl -s -X POST -H "Content-Type: application/json; charset=utf-8" --data-binary @- http://localhost:{{API_PORT}}/send
```

## 注意

- `message_id` 已自动填入，不要改动
- 只需替换 `<你的回复>` 部分
- **必须用 `printf` + `--data-binary @-`**，不可用 `curl -d` 直接传中文

## Health

```bash
curl http://localhost:{{API_PORT}}/health
```
