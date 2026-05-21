export interface BotConfig {
	name: string;
	app_id: string;
	app_secret: string;
	session: string;
	pane: string;
	port: number;
	no_inject?: boolean;
}

export interface ChatRoute {
	chat_type: "group" | "private";
	chat_id: string;
	open_id: string;
}

export interface Logger {
	log(...args: unknown[]): void;
	error(...args: unknown[]): void;
}

export interface RouteStore {
	put(key: string, value: ChatRoute): void;
	get(key: string): ChatRoute | undefined;
	has(key: string): boolean;
}
