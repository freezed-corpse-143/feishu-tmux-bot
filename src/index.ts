import { startBot } from "./bot.js";
import { loadConfig } from "./config.js";
import { ensureLogDir } from "./logger.js";

ensureLogDir();

const filterName =
	process.env.BOT || process.argv.find((a) => a.startsWith("--bot="))?.split("=")[1];

const bots = loadConfig();
if (!bots.length) {
	console.error("没有有效的 bot 配置");
	process.exit(1);
}

let selected = bots;
if (filterName) {
	selected = bots.filter((b) => b.name === filterName);
	if (!selected.length) {
		console.error(`未找到 bot: ${filterName}`);
		process.exit(1);
	}
}

console.log(`启动 ${selected.length} 个 bot: ${selected.map((b) => b.name).join(", ")}`);

const runners: Promise<any>[] = [];
for (const cfg of selected) {
	runners.push(startBot(cfg));
}

function shutdown() {
	console.log("\n正在停止...");
	Promise.all(runners).then((list) => {
		for (const r of list) {
			r.wsClient.stop();
			r.apiApp.close();
		}
		process.exit(0);
	});
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
