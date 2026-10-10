import {invoke, convertFileSrc} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {open} from "@tauri-apps/plugin-dialog";
import {openPath} from "@tauri-apps/plugin-opener";
import {FileText, Image, MessageCircle, Send, Download} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import {Virtuoso} from "react-virtuoso";
import {VoicePanel} from "./VoicePanel";

interface ChatMessage {
	sender_id: string;
	sender_name: string;
	text: string;
	timestamp: string;
}

interface FileMessage {
	file_id: number;
	file_name: string;
	file_size: number;
	mime_type: string;
	sender_id: string;
	sender_name: string;
	is_image: boolean;
	timestamp: string;
	saved_path: string;
}

interface ProgressInfo {
	progress: number;
	file_name: string;
	direction: string;
	speed?: number;
	time_left?: number;
}

type UnifiedMsg =
	| {kind: "text"; data: ChatMessage}
	| {kind: "file"; data: FileMessage};

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1073741824) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function ChatBox() {
	const [messages, setMessages] = useState<UnifiedMsg[]>([]);
	const [input, setInput] = useState("");
	const [myId, setMyId] = useState<string | null>(null);
	const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
	const [progressMap, setProgressMap] = useState<Map<number, ProgressInfo>>(new Map());
	const virtuosoRef = useRef<any>(null);

	useEffect(() => {
		invoke<string>("get_local_user_id").then(setMyId).catch(console.error);
		invoke<ChatMessage[]>("get_chat_history")
			.then((history) => {
				const sorted = history.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
				setMessages(sorted.map((d) => ({kind: "text", data: d})));
			})
			.catch(console.error);
	}, []);

	useEffect(() => {
		const unlistenText = listen<ChatMessage>("chat-message", (event) => {
			setMessages((prev) => {
				const next: UnifiedMsg[] = [...prev, {kind: "text", data: event.payload}];
				next.sort((a, b) => a.data.timestamp.localeCompare(b.data.timestamp));
				return next;
			});
		});
		const unlistenFile = listen<FileMessage>("chat-file", (event) => {
			setMessages((prev) => {
				const next: UnifiedMsg[] = [...prev, {kind: "file", data: event.payload}];
				next.sort((a, b) => a.data.timestamp.localeCompare(b.data.timestamp));
				return next;
			});
		});
		const unlistenProgress = listen<{file_id: number; progress: number; file_name: string; direction: string; speed?: number; time_left?: number}>("file-progress", (event) => {
			const {file_id, progress, file_name, direction, speed, time_left} = event.payload;
			setProgressMap((prev) => {
				const next = new Map(prev);
				next.set(file_id, {progress, file_name, direction, speed, time_left});
				return next;
			});
			if (progress >= 100) {
				setTimeout(() => {
					setProgressMap((prev) => {
						const next = new Map(prev);
						next.delete(file_id);
						return next;
					});
				}, 1500);
			}
		});
		const unlistenError = listen<{file_id: number; file_name: string; error: string}>("file-error", (event) => {
			const {file_id, error} = event.payload;
			setProgressMap((prev) => {
				const next = new Map(prev);
				next.delete(file_id);
				return next;
			});
			console.error("文件传输错误:", error);
		});
		const unlistenCancelled = listen<{file_id: number; file_name: string}>("file-cancelled", (event) => {
			const {file_id} = event.payload;
			setProgressMap((prev) => {
				const next = new Map(prev);
				next.delete(file_id);
				return next;
			});
		});
		return () => {
			unlistenText.then((fn) => fn());
			unlistenFile.then((fn) => fn());
			unlistenProgress.then((fn) => fn());
			unlistenError.then((fn) => fn());
			unlistenCancelled.then((fn) => fn());
		};
	}, []);

	const send = async () => {
		const text = input.trim();
		if (!text) return;
		try {
			await invoke("send_chat_message", {text});
			setInput("");
		} catch (e) {
			console.error("发送消息失败", e);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	};

	const handleSendFile = async () => {
		try {
			const filePath = await open({multiple: false});
			if (!filePath || typeof filePath !== "string") return;
			await invoke("send_file_to_lobby", {filePath});
		} catch (e) {
			console.error("发送文件失败", e);
		}
	};

	const handleSendImage = async () => {
		try {
			const imagePath = await open({
				multiple: false,
				filters: [{name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"]}],
			});
			if (!imagePath || typeof imagePath !== "string") return;
			await invoke("send_file_to_lobby", {filePath: imagePath});
		} catch (e) {
			console.error("发送图片失败", e);
		}
	};

	const isSelf = (id: string) => myId !== null && id === myId;

	const itemContent = useCallback(
		(_index: number, msg: UnifiedMsg) => {
			const self = isSelf(msg.data.sender_id);
			return (
				<div className={`flex flex-col px-6 py-1.5 ${self ? "items-end" : "items-start"}`}>
					<span
						className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold mb-1 ${
							self
								? "bg-primary/15 text-foreground/60"
								: "bg-muted-foreground/10 text-muted-foreground"
						}`}
					>
						{self ? "我" : msg.data.sender_name}
						<span className="ml-1.5 font-normal opacity-50">
							{msg.data.timestamp}
						</span>
					</span>
					{msg.kind === "text" ? (
						<div
							className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
								self
									? "bg-primary/20 text-foreground rounded-br-md"
									: "bg-muted rounded-bl-md"
							}`}
						>
							<p className="text-sm break-words">{msg.data.text}</p>
						</div>
					) : msg.data.is_image ? (
						<div
							className={`max-w-[75%] rounded-2xl p-2 ${
								self
									? "bg-primary/20 rounded-br-md"
									: "bg-muted rounded-bl-md"
							}`}
						>
							<img
								src={convertFileSrc(msg.data.saved_path)}
								alt={msg.data.file_name}
								className="rounded-xl max-w-full max-h-64 cursor-pointer object-contain"
								onClick={() => openPath(msg.data.saved_path).catch(console.error)}
							/>
							<p className="text-[10px] text-muted-foreground mt-1 px-1">
								{msg.data.file_name} · {formatSize(msg.data.file_size)}
							</p>
						</div>
					) : (
						<div
							className={`max-w-[75%] rounded-2xl px-4 py-3 flex items-center gap-3 ${
								self
									? "bg-primary/20 rounded-br-md"
									: "bg-muted rounded-bl-md"
							}`}
						>
							<div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
								<FileText className="w-5 h-5 text-primary" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-bold truncate">{msg.data.file_name}</p>
								<p className="text-[10px] text-muted-foreground">{formatSize(msg.data.file_size)}</p>
							</div>
							<button
								onClick={() => openPath(msg.data.saved_path).catch(console.error)}
								className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors active:scale-95 shrink-0"
							>
								<Download className="w-3 h-3" />
								打开
							</button>
						</div>
					)}
				</div>
			);
		},
		[myId]
	);

	return (
		<div className="rounded-2xl bg-muted/30 border border-border overflow-hidden flex flex-col relative">
			{!disclaimerAccepted && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-2xl p-6">
					<div className="text-center space-y-4 max-w-xs">
						<div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/20 flex items-center justify-center">
							<MessageCircle className="w-6 h-6 text-amber-500" />
						</div>
						<div>
							<h3 className="text-sm font-bold text-foreground mb-1">大厅聊天须知</h3>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Steam 聊天消息通过服务器广播，
								<b className="text-foreground">同房间所有人都能看到</b>。
								<br />
								<br />
								本聊天仅用于联机沟通，请自觉遵守：
								<br />
								· 不发送密码等敏感信息
								<br />
								· 不讨论政治、黄赌毒等敏感内容
								<br />· 发表内容需自行承担后果
							</p>
						</div>
						<button
							onClick={() => setDisclaimerAccepted(true)}
							className="h-10 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors active:scale-95"
						>
							知道了
						</button>
					</div>
				</div>
			)}

			<div className="flex items-center gap-2 px-6 pt-4 pb-3 text-xs text-muted-foreground uppercase tracking-wider font-bold">
				<MessageCircle className="w-4 h-4" />
				大厅聊天
			</div>

			{messages.length === 0 ? (
				<div className="flex items-center justify-center h-[300px] text-xs text-muted-foreground/60 italic">
					暂无消息
				</div>
			) : (
				<Virtuoso
					ref={virtuosoRef}
					data={messages}
					itemContent={itemContent}
					className="custom-scrollbar"
					style={{height: "400px"}}
					followOutput={"smooth"}
					increaseViewportBy={{top: 200, bottom: 200}}
				/>
			)}

			{progressMap.size > 0 && (
				<div className="px-6 py-1.5 space-y-1 border-t border-border/50">
					{Array.from(progressMap.entries()).map(([id, info]) => (
						<div key={id} className="flex items-center gap-2 text-[10px]">
							<span className="text-muted-foreground truncate max-w-[120px]">
								{info.direction === "send" ? "↑" : "↓"} {info.file_name}
							</span>
							<div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
								<div
									className="h-full bg-primary rounded-full transition-all"
									style={{width: `${info.progress}%`}}
								/>
							</div>
							<span className="text-muted-foreground w-8 text-right">{info.progress}%</span>
							{info.speed && info.speed > 0 && (
								<span className="text-muted-foreground/60 w-16 text-right">
									{info.speed > 1048576 ? `${(info.speed / 1048576).toFixed(1)}MB/s` : `${(info.speed / 1024).toFixed(0)}KB/s`}
								</span>
							)}
							{info.time_left && info.time_left > 0 && info.progress < 100 && (
								<span className="text-muted-foreground/60 w-12 text-right">
									{info.time_left > 60 ? `${Math.ceil(info.time_left / 60)}分` : `${Math.ceil(info.time_left)}秒`}
								</span>
							)}
						</div>
					))}
				</div>
			)}

			<VoicePanel />

			<div className="flex items-center gap-2 px-6 py-3 border-t border-border">
				<button
					onClick={handleSendImage}
					className="w-10 h-10 flex items-center justify-center rounded-xl bg-muted/50 text-foreground hover:bg-muted transition-colors active:scale-95 shrink-0"
					title="发送图片"
				>
					<Image className="w-4 h-4" />
				</button>
				<button
					onClick={handleSendFile}
					className="w-10 h-10 flex items-center justify-center rounded-xl bg-muted/50 text-foreground hover:bg-muted transition-colors active:scale-95 shrink-0"
					title="发送文件"
				>
					<FileText className="w-4 h-4" />
				</button>
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="输入消息..."
					className="flex-1 h-10 px-4 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
				/>
				<button
					onClick={send}
					disabled={!input.trim()}
					className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shrink-0"
				>
					<Send className="w-4 h-4" />
				</button>
			</div>
		</div>
	);
}
