const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const iconv = require("iconv-lite");
const Lark = require("@larksuiteoapi/node-sdk");

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const TMUX_SESSION_NAME = process.env.TMUX_SESSION_NAME || "default";
const API_PORT = process.env.API_PORT || 9091;
const NO_INJECT = process.env.NO_INJECT === "true";
const TMOUT_TMUX = parseInt(process.env.TMOUT_TMUX) || 5000;
const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "bot.log");

// --- dual-output logger ---

fs.mkdirSync(LOG_DIR, { recursive: true });

function ts() {
  return new Date().toISOString();
}

function log(...args) {
  const line = `[${ts()}] ` + args.join(" ");
  process.stdout.write(line + "\n");
  fs.appendFileSync(LOG_FILE, line + "\n", "utf-8");
}

function logError(...args) {
  const line = `[${ts()}] [ERROR] ` + args.join(" ");
  process.stderr.write(line + "\n");
  fs.appendFileSync(LOG_FILE, line + "\n", "utf-8");
}

// --- config validation ---

if (!APP_ID || !APP_SECRET) {
  logError("请设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET");
  process.exit(1);
}

log("启动配置:");
log("  - Tmux Session: " + TMUX_SESSION_NAME);
log("  - App ID: " + APP_ID.substring(0, 10) + "...");
log("  - API Port: " + API_PORT);
log("  - 注入模式: " + (NO_INJECT ? "关闭" : "开启"));
log("  - Tmux 超时: " + TMOUT_TMUX + "ms");
log("  - 日志文件: " + LOG_FILE);

const client = new Lark.Client({ appId: APP_ID, appSecret: APP_SECRET });

const wsClient = new Lark.WSClient({
  appId: APP_ID,
  appSecret: APP_SECRET,
  loggerLevel: Lark.LoggerLevel.info,
});

// --- shell helpers ---

function execWithTimeout(cmd, timeoutMs) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

// --- tmux helpers ---

const PASTE_FILE = os.tmpdir().replace(/\\/g, "/") + "/feishu-tmux-paste.txt";

function pasteToTmux(text) {
  return new Promise((resolve, reject) => {
    try {
      fs.writeFileSync(PASTE_FILE, text, "utf-8");
    } catch (e) {
      return reject(e);
    }

    const cmd = [
      `tmux load-buffer ${PASTE_FILE}`,
      `tmux paste-buffer -p -t ${TMUX_SESSION_NAME}`,
      `tmux send-keys -t ${TMUX_SESSION_NAME} C-m`,
    ].join(" && ");

    execWithTimeout(cmd, TMOUT_TMUX).then(resolve).catch(reject);
  });
}

// --- Feishu reply ---

async function replyToSender(params, replyText) {
  const { chat_type, chat_id, open_id } = params;
  const isGroup = chat_type === "group";
  const receiveIdType = isGroup ? "chat_id" : "open_id";
  const receiveId = isGroup ? chat_id : open_id;

  await client.im.v1.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: receiveId,
      msg_type: "text",
      content: JSON.stringify({ text: replyText }),
    },
  });
}

// --- Message format ---

function buildMessageBlock(params) {
  const { chat_type, chat_id, open_id, message_id, text } = params;
  return [
    "```json",
    JSON.stringify({ chat_type, chat_id, open_id, message_id, text }, null, 2),
    "```",
  ].join("\n");
}

// --- Startup injection ---

function loadServiceDoc() {
  const docPath = path.join(__dirname, "SERVICE_API.md");
  return fs.readFileSync(docPath, "utf-8").replace(/\{\{API_PORT\}\}/g, API_PORT);
}

function injectServiceInfo() {
  if (NO_INJECT) {
    log("[init] 注入模式已关闭，跳过");
    return;
  }

  const serviceDoc = loadServiceDoc();

  // 1. write to Claude Code project memory
  const memoryFrontmatter = [
    "---",
    "name: feishu-tmux-bot-api",
    "description: feishu-tmux-bot service API",
    "metadata:",
    "  type: reference",
    "---",
    "",
  ].join("\n");

  try {
    const memoryDir =
      process.env.USERPROFILE +
      "/.claude/projects/C--Projects-feishu-tmux-bot/memory";
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryDir + "/feishu-tmux-bot-api.md",
      memoryFrontmatter + serviceDoc,
      "utf-8"
    );
    log("[init] 服务信息已写入 Claude Code 项目记忆");
  } catch (e) {
    logError("[init] 写入记忆失败: " + e.message);
  }

  // 2. paste condensed summary into tmux
  const initText = [
    "```text",
    "feishu-tmux-bot v1.0",
    "",
    "[Inbound]",
    "  飞书消息 -> JSON block -> 本终端",
    "  {chat_type, chat_id, open_id, message_id, text}",
    "",
    "[Outbound]",
    "  回复群聊: curl -X POST http://localhost:" + API_PORT + "/send -H 'Content-Type: application/json' -d '{\"chat_type\":\"group\",\"chat_id\":\"oc_xxx\",\"open_id\":\"ou_xxx\",\"text\":\"...\"}'",
    "  回复私聊: curl -X POST http://localhost:" + API_PORT + "/send -H 'Content-Type: application/json' -d '{\"chat_type\":\"p2p\",\"chat_id\":\"oc_xxx\",\"open_id\":\"ou_xxx\",\"text\":\"...\"}'",
    "",
    "[Routing] group->chat_id  p2p->open_id",
    "```",
  ].join("\n");

  setTimeout(() => {
    log("[init] 向 tmux 注入服务摘要...");
    pasteToTmux(initText)
      .then(() => log("[init] 服务摘要已注入 tmux"))
      .catch((e) => logError("[init] 注入失败: " + e.message));
  }, 2000);
}

// --- HTTP outbound API ---

function parseBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    );
    req.on("end", () => {
      const buffer = Buffer.concat(chunks);
      if (!buffer.length) return resolve(null);

      const tryParse = (text) => {
        try { return JSON.parse(text); } catch { return null; }
      };

      let json = tryParse(buffer.toString("utf8"));
      if (json) return resolve(json);

      json = tryParse(iconv.decode(buffer, "gbk"));
      if (json) return resolve(json);

      resolve(null);
    });
  });
}

const apiServer = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok", ts: new Date().toISOString() }));
    return;
  }

  if (req.method === "POST" && req.url === "/send") {
    const body = await parseBody(req);
    if (!body || !body.text) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "缺少 text 字段" }));
      return;
    }

    const { chat_type, chat_id, open_id, text } = body;
    log("[api] 回复: chat_type=" + chat_type + " text=" + text.substring(0, 40));

    try {
      await replyToSender({ chat_type, chat_id, open_id }, text);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      logError("[api] 失败: " + error.message);
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ ok: false, error: "not found" }));
});

// --- Health check ---

function healthCheck() {
  execWithTimeout("tmux has-session -t " + TMUX_SESSION_NAME, 3000)
    .then(() => log("[健康检查] tmux session " + TMUX_SESSION_NAME + " 正常运行"))
    .catch(() => logError("[健康检查] tmux session " + TMUX_SESSION_NAME + " 不存在!"));
}

setInterval(healthCheck, 30 * 60 * 1000);
healthCheck();

// --- Start ---

let lastWsReadyAt = 0;
let lastMessageAt = 0;

// connection lifecycle — exit on error so pm2/systemd restarts
wsClient.onReady = () => {
  lastWsReadyAt = Date.now();
  log("[ws] 长连接已建立，开始接收消息");
};
wsClient.onError = (err) => {
  logError("[ws] 连接错误: " + (err.message || err));
  logError("[ws] 异常退出，等待进程管理器重启...");
  process.exit(1);
};
wsClient.onReconnecting = () => log("[ws] 正在重连...");
wsClient.onReconnected = () => {
  lastWsReadyAt = Date.now();
  log("[ws] 重连成功");
};

// catch-all: log every incoming event for debugging
const dispatcher = new Lark.EventDispatcher({});
const _invoke = dispatcher.invoke.bind(dispatcher);
dispatcher.invoke = function (eventType, data) {
  log("[event] 收到事件: " + eventType);
  return _invoke(eventType, data);
};

dispatcher.register({
  "im.message.receive_v1": async (data) => {
    const msg = data.message;
    const sender = data.sender;
    const chatType = msg.chat_type;
    const chatId = msg.chat_id;
    const messageId = msg.message_id;
    const openId = sender?.sender_id?.open_id || "";
    const content = JSON.parse(msg.content || "{}");
    const text = content.text || "";
    const msgType = msg.msg_type;

    log("[收到消息] chat_type=" + chatType + " msg_type=" + msgType + " text=" + text.substring(0, 40));
    lastMessageAt = Date.now();

    if (!text.trim()) {
      // non-text messages (image, file, sticker, etc.) — log and skip
      if (msgType && msgType !== "text") {
        log("[message] 非文本消息，跳过: msg_type=" + msgType);
      } else {
        await replyToSender(
          { chat_type: chatType, chat_id: chatId, open_id: openId },
          "消息内容为空"
        );
      }
      return;
    }

    try {
      const inputBlock = buildMessageBlock({
        chat_type: chatType,
        chat_id: chatId,
        open_id: openId,
        message_id: messageId,
        text: text,
      });
      if (!NO_INJECT) {
        await pasteToTmux(inputBlock);
      } else {
        log("[message] 注入已关闭，跳过 paste: " + text.substring(0, 40));
      }
    } catch (error) {
      logError("处理失败: " + error.message);
      await replyToSender(
        { chat_type: chatType, chat_id: chatId, open_id: openId },
        "执行失败: " + error.message
      );
    }
  },

  "im.message.message_read_v1": async () => {
    // suppress SDK warning, no action needed
  },
});

wsClient.start({ eventDispatcher: dispatcher });

apiServer.listen(API_PORT, () => {
  log("API 服务: http://localhost:" + API_PORT);
  injectServiceInfo();
});

log("机器人已启动，正在监听消息...");

// app-level heartbeat — monitor connection health
setInterval(() => {
  log(
    "[heartbeat] wsReadyAt=" +
      (lastWsReadyAt ? new Date(lastWsReadyAt).toISOString() : "never") +
      " lastMessageAt=" +
      (lastMessageAt ? new Date(lastMessageAt).toISOString() : "never")
  );
}, 60 * 1000);

process.on("SIGINT", () => {
  log("收到 SIGINT，正在停止...");
  wsClient.stop();
  apiServer.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("收到 SIGTERM，正在停止...");
  wsClient.stop();
  apiServer.close();
  process.exit(0);
});
