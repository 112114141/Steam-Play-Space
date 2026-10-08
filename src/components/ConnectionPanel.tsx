import {invoke} from "@tauri-apps/api/core";
import {
	Gamepad2,
	Link2,
	Plus,
	Search,
	CheckCircle2,
	XCircle,
	RefreshCw,
	Radar
} from "lucide-react";
import {useState, useEffect, useCallback, useRef} from "react";
import {toast} from "react-hot-toast";
import {useApp} from "../AppContext";
import {JoinLobbyResult} from "../types";

interface PortProcessInfo {
	port: number;
	pid: number;
	process_name: string;
	protocol: string;
}

export function ConnectionPanel() {
	const {localPort, setLocalPort, setCurrentLobbyId, refreshStatus, setLastHostId, settings, setSettings} = useApp();
	const [lobbyIdInput, setLobbyIdInput] = useState(
		() => localStorage.getItem("p2p_last_lobby_id") || ""
	);
	const [loading, setLoading] = useState<"host" | "join" | null>(null);
	const [portInfos, setPortInfos] = useState<PortProcessInfo[]>([]);
	const [scanning, setScanning] = useState(false);
	const [processSearch, setProcessSearch] = useState("");
	const [autoDetect, setAutoDetect] = useState(settings.autoDetectDefault);
	const prevPortsRef = useRef<Set<number>>(new Set());

	const scanPorts = useCallback(async () => {
		setScanning(true);
		try {
			const infos = await invoke<PortProcessInfo[]>("scan_local_ports");
			setPortInfos(infos);
			prevPortsRef.current = new Set(infos.map((i) => i.port));
		} catch (e) {
			console.error("端口扫描失败:", e);
		} finally {
			setScanning(false);
		}
	}, []);

	useEffect(() => {
		scanPorts();
	}, [scanPorts]);

	useEffect(() => {
		if (!autoDetect) return;

		const interval = setInterval(async () => {
			try {
				const infos = await invoke<PortProcessInfo[]>("scan_local_ports");
				setPortInfos(infos);

				const currentPortSet = new Set(infos.map((i) => i.port));
				const newPorts = infos.filter(
					(i) => !prevPortsRef.current.has(i.port)
				);

				if (newPorts.length > 0) {
					const first = newPorts[0];
					setLocalPort(first.port);
					if (settings.autoProtocolSwitch) {
						setSettings({protocol: first.protocol === "UDP" ? "UDP" : "TCP"});
					}
					toast.success(
						`检测到新端口 ${first.port} (${first.process_name})`,
						{icon: "📡"}
					);
				}

				prevPortsRef.current = currentPortSet;
			} catch (e) {
				console.error("自动检测失败:", e);
			}
		}, 2000);

		return () => clearInterval(interval);
	}, [autoDetect, settings.autoProtocolSwitch, setLocalPort, setSettings]);

	const isPortListening = portInfos.some((info) => info.port === localPort);

	const filteredPorts =
		processSearch.trim() === ""
			? portInfos
			: portInfos.filter((info) =>
					info.process_name
						.toLowerCase()
						.includes(processSearch.toLowerCase())
				);

	const handleCreateLobby = async () => {
		setLoading("host");
		const toastId = "create-lobby";
		try {
			toast.loading("创建 Steam 房间...", {id: toastId});
			const id = await invoke<string>("create_lobby", {protocol: settings.protocol});
			toast.loading("启动 P2P 监听...", {id: toastId});
			if (settings.protocol === "UDP") {
				await invoke("start_udp_host", {localPort});
			} else {
				await invoke("start_hosting", {localPort});
			}
			toast.success(`${settings.protocol} 房间创建成功`, {icon: "🎮", id: toastId});
			setCurrentLobbyId(id);
			await refreshStatus();
		} catch (e: any) {
			toast.error(
				"创建失败: " +
					(typeof e === "string" ? e : e.message || JSON.stringify(e)),
				{id: toastId}
			);
		} finally {
			setLoading(null);
		}
	};

	const handleJoinLobby = async () => {
		if (!lobbyIdInput) {
			toast.error("请输入房间 ID");
			return;
		}
		localStorage.setItem("p2p_last_lobby_id", lobbyIdInput);
		setLoading("join");
		const toastId = "join-lobby";
		try {
			toast.loading("加入 Steam 房间...", {id: toastId});
			const result = await invoke<JoinLobbyResult>("join_lobby", {
				lobbyIdStr: lobbyIdInput
			});
			toast.loading("建立 P2P 隧道...", {id: toastId});
			const hostProtocol = result.host_protocol === "UDP" ? "UDP" : "TCP";
			if (hostProtocol !== settings.protocol) {
				setSettings({protocol: hostProtocol});
			}
			if (hostProtocol === "UDP") {
				await invoke("start_udp_client", {
					hostIdStr: result.host_id,
					localPort
				});
			} else {
				await invoke("connect_to_host", {
					hostIdStr: result.host_id,
					localPort
				});
			}
			toast.success(`${hostProtocol} 隧道已打通`, {icon: "🚀", id: toastId});
			setCurrentLobbyId(result.lobby_id);
			setLastHostId(result.host_id);
			await refreshStatus();
		} catch (e: any) {
			const msg = typeof e === "string" ? e : e.message || JSON.stringify(e);
			toast.error(
				msg.includes("timed out") ? "连接超时" : "加入失败: " + msg,
				{id: toastId}
			);
		} finally {
			setLoading(null);
		}
	};

	return (
		<div className="w-full space-y-5">
			{portInfos.length > 0 && (
				<div className="p-3 rounded-2xl border border-primary/20 bg-primary/5 space-y-2">
					<div className="flex items-center gap-2 text-[11px] font-bold text-primary">
						<Search className="w-3.5 h-3.5" />
						检测到本地监听端口
					</div>
					<input
						type="text"
						value={processSearch}
						onChange={(e) => setProcessSearch(e.target.value)}
						className="w-full h-9 px-3 text-xs bg-background/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
						placeholder="搜索进程名过滤..."
					/>
					<div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
						{filteredPorts.map((info) => (
							<button
								key={`${info.port}-${info.pid}`}
								onClick={() => {
									setLocalPort(info.port);
									if (settings.autoProtocolSwitch) {
										setSettings({protocol: info.protocol === "UDP" ? "UDP" : "TCP"});
									}
								}}
								className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all active:scale-95 ${
									localPort === info.port
										? "bg-primary text-primary-foreground"
										: "bg-primary/10 hover:bg-primary/20 text-primary"
								}`}
								title={`PID: ${info.pid} | ${info.protocol}`}
							>
								{info.port}
								<span className={`ml-1.5 text-[9px] font-sans ${info.protocol === "UDP" ? "text-orange-400" : "text-green-400"}`}>
									{info.protocol}
								</span>
								<span className="opacity-60 ml-1 font-sans">
									{info.process_name}
								</span>
							</button>
						))}
						{filteredPorts.length === 0 && (
							<span className="text-xs text-muted-foreground px-2 py-1">
								无匹配进程
							</span>
						)}
					</div>
				</div>
			)}

			<div className="space-y-1">
				<div className="flex items-center justify-between ml-2">
					<label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
						本地服务端口
					</label>
					<div className="flex items-center gap-3 mr-2">
						<button
							onClick={() => setAutoDetect(!autoDetect)}
							className={`flex items-center gap-1 text-[10px] font-bold transition-colors ${
								autoDetect
									? "text-primary"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<Radar
								className={`w-3.5 h-3.5 ${autoDetect ? "animate-pulse" : ""}`}
							/>
							自动检测
							{autoDetect ? " ON" : " OFF"}
						</button>
						<button
							onClick={scanPorts}
							disabled={scanning}
							className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
						>
							<RefreshCw
								className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`}
							/>
							刷新
						</button>
					</div>
				</div>
				<div className="relative">
					<Gamepad2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
					<input
						type="number"
						value={localPort}
						onChange={(e) =>
							setLocalPort(parseInt(e.target.value, 10) || 0)
						}
						className="w-full h-14 pl-12 pr-12 text-lg font-mono font-semibold bg-muted/30 border border-border rounded-2xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-center"
						placeholder="25565"
					/>
					{portInfos.length > 0 && (
						<div className="absolute right-4 top-1/2 -translate-y-1/2">
							{isPortListening ? (
								<CheckCircle2 className="w-5 h-5 text-green-500" />
							) : (
								<XCircle className="w-5 h-5 text-muted-foreground/40" />
							)}
						</div>
					)}
				</div>
				{portInfos.length > 0 && (
					<p
						className={`text-[11px] ml-2 ${isPortListening ? "text-green-500" : "text-muted-foreground"}`}
					>
						{isPortListening
							? "✓ 端口正在监听，服务已就绪"
							: "端口未监听，请先在游戏中开启联机"}
					</p>
				)}
			{autoDetect && (
				<p className="text-[11px] ml-2 text-primary/70">
					📡 每 2 秒扫描，检测到新端口将自动填入
				</p>
			)}
			<div className="flex items-center gap-2 ml-2 mt-1">
				{settings.autoProtocolSwitch ? (
					<p className="text-[11px] text-muted-foreground">
						协议: <span className={settings.protocol === "UDP" ? "text-orange-400 font-bold" : "text-green-500 font-bold"}>{settings.protocol}</span>
						<span className="ml-1 opacity-60">(自动检测)</span>
					</p>
				) : (
					<div className="flex items-center gap-1">
						<span className="text-[11px] text-muted-foreground">协议:</span>
						<button
							onClick={() => setSettings({protocol: "TCP"})}
							className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
								settings.protocol === "TCP"
									? "bg-green-500/20 text-green-500"
									: "bg-muted/30 text-muted-foreground hover:text-foreground"
							}`}
						>
							TCP
						</button>
						<button
							onClick={() => setSettings({protocol: "UDP"})}
							className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
								settings.protocol === "UDP"
									? "bg-orange-400/20 text-orange-400"
									: "bg-muted/30 text-muted-foreground hover:text-foreground"
							}`}
						>
							UDP
						</button>
					</div>
				)}
			</div>
			</div>

			<div className="grid grid-cols-2 gap-3">
				<button
					onClick={handleCreateLobby}
					disabled={loading !== null}
					className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-[0.98] disabled:opacity-50"
				>
					<div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
						<Plus className="w-5 h-5 text-primary" />
					</div>
					<span className="font-bold text-foreground text-sm">
						{loading === "host" ? "创建中..." : "创建房间"}
					</span>
					<span className="text-[10px] text-muted-foreground">作为房主</span>
				</button>

				<button
					onClick={handleJoinLobby}
					disabled={loading !== null}
					className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-[0.98] disabled:opacity-50"
				>
					<div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
						<Link2 className="w-5 h-5 text-primary" />
					</div>
					<span className="font-bold text-foreground text-sm">
						{loading === "join" ? "加入中..." : "加入房间"}
					</span>
					<span className="text-[10px] text-muted-foreground">需要房间 ID</span>
				</button>
			</div>

			<div className="space-y-1">
				<label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-2">
					房间 ID
				</label>
				<div className="relative">
					<Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
					<input
						type="text"
						value={lobbyIdInput}
						onChange={(e) => setLobbyIdInput(e.target.value)}
						className="w-full h-12 pl-11 pr-4 text-sm font-mono bg-muted/30 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
						placeholder="粘贴房主提供的房间 ID"
					/>
				</div>
			</div>

			<p className="text-[11px] text-muted-foreground text-center leading-relaxed">
				创建房间后可邀请好友加入，对方通过房间 ID 即可连接。
			</p>
		</div>
	);
}
