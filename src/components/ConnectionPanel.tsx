import {invoke} from "@tauri-apps/api/core";
import {
	Gamepad2,
	Link2,
	Plus,
	Search,
	CheckCircle2,
	XCircle,
	RefreshCw,
	Radar,
	Star,
	Copy,
	ChevronDown,
	ChevronRight,
	AlertTriangle,
} from "lucide-react";
import {useState, useEffect, useCallback, useRef, useMemo} from "react";
import {toast} from "react-hot-toast";
import {useApp} from "../AppContext";
import {JoinLobbyResult} from "../types";

interface PortProcessInfo {
	port: number;
	pid: number;
	process_name: string;
	protocol: string;
	friendly_name: string | null;
	category: string;
}

const GAME_PRESETS = [
	{name: "MC", port: 25565, protocol: "TCP"},
	{name: "Terraria", port: 7777, protocol: "TCP"},
	{name: "Valheim", port: 2456, protocol: "UDP"},
	{name: "L4D2", port: 27015, protocol: "UDP"},
	{name: "帕鲁", port: 8211, protocol: "UDP"},
	{name: "PZ", port: 16261, protocol: "UDP"},
];

interface ContextMenu {
	x: number;
	y: number;
	info: PortProcessInfo;
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
	const [showConfirmModal, setShowConfirmModal] = useState(false);
	const [dontShowAgain, setDontShowAgain] = useState(false);

	const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
	const [newPorts, setNewPorts] = useState<Set<number>>(new Set());
	const [showFolded, setShowFolded] = useState(false);

	const [focusProcesses, setFocusProcesses] = useState<Set<string>>(() => {
		const saved = localStorage.getItem("p2p_focus_processes");
		return saved ? new Set(JSON.parse(saved)) : new Set();
	});
	const [foldedProcesses, setFoldedProcesses] = useState<Set<string>>(() => {
		const saved = localStorage.getItem("p2p_folded_processes");
		return saved ? new Set(JSON.parse(saved)) : new Set();
	});
	const [portUsageCount, setPortUsageCount] = useState<Record<number, number>>(() => {
		const saved = localStorage.getItem("p2p_port_usage_count");
		return saved ? JSON.parse(saved) : {};
	});

	const saveFocusProcesses = (s: Set<string>) => {
		localStorage.setItem("p2p_focus_processes", JSON.stringify([...s]));
		setFocusProcesses(s);
	};
	const saveFoldedProcesses = (s: Set<string>) => {
		localStorage.setItem("p2p_folded_processes", JSON.stringify([...s]));
		setFoldedProcesses(s);
	};
	const incrementPortUsage = (port: number) => {
		setPortUsageCount((prev) => {
			const next = {...prev, [port]: (prev[port] || 0) + 1};
			localStorage.setItem("p2p_port_usage_count", JSON.stringify(next));
			return next;
		});
	};

	const scanPorts = useCallback(async () => {
		setScanning(true);
		try {
			const infos = await invoke<PortProcessInfo[]>("scan_local_ports");
			setPortInfos(infos);

			const currentPortSet = new Set(infos.map((i) => i.port));

			if (prevPortsRef.current.size > 0) {
				const newSet = new Set<number>();
				for (const info of infos) {
					if (!prevPortsRef.current.has(info.port)) {
						newSet.add(info.port);
					}
				}
				if (newSet.size > 0) {
					setNewPorts(newSet);
					setTimeout(() => setNewPorts(new Set()), 3000);
				}
			}

			if (autoDetect && prevPortsRef.current.size > 0) {
				const newGamePorts = infos.filter(
					(i) => !prevPortsRef.current.has(i.port) && i.category === "game"
				);
				if (newGamePorts.length > 0) {
					const first = newGamePorts[0];
					setLocalPort(first.port);
					if (settings.autoProtocolSwitch) {
						setSettings({protocol: first.protocol === "UDP" ? "UDP" : "TCP"});
					}
					toast.success(
						`检测到 ${first.friendly_name || first.process_name} (${first.port})`,
						{icon: "🎮"}
					);
				}
			}

			prevPortsRef.current = currentPortSet;
		} catch (e) {
			console.error("端口扫描失败:", e);
		} finally {
			setScanning(false);
		}
	}, [autoDetect, settings.autoProtocolSwitch, setLocalPort, setSettings]);

	useEffect(() => {
		scanPorts();
	}, [scanPorts]);

	useEffect(() => {
		if (!autoDetect) return;
		const interval = setInterval(scanPorts, 2000);
		return () => clearInterval(interval);
	}, [autoDetect, scanPorts]);

	useEffect(() => {
		const handler = () => setContextMenu(null);
		window.addEventListener("click", handler);
		return () => window.removeEventListener("click", handler);
	}, []);

	const {focusPorts, gamePorts, otherPorts, foldedPorts} = useMemo(() => {
		const search = processSearch.trim().toLowerCase();
		const filtered = portInfos.filter((info) => {
			if (search === "") return true;
			return (
				info.process_name.toLowerCase().includes(search) ||
				info.port.toString().includes(search) ||
				(info.friendly_name?.toLowerCase().includes(search) ?? false)
			);
		});

		const focus: PortProcessInfo[] = [];
		const game: PortProcessInfo[] = [];
		const other: PortProcessInfo[] = [];
		const folded: PortProcessInfo[] = [];

		for (const info of filtered) {
			const lowerName = info.process_name.toLowerCase();
			if (foldedProcesses.has(lowerName)) {
				folded.push(info);
			} else if (focusProcesses.has(lowerName)) {
				focus.push(info);
			} else if (info.category === "game") {
				game.push(info);
			} else if (info.category === "system") {
				folded.push(info);
			} else {
				other.push(info);
			}
		}

		const sortByUsage = (a: PortProcessInfo, b: PortProcessInfo) => {
			const ua = portUsageCount[a.port] || 0;
			const ub = portUsageCount[b.port] || 0;
			if (ub !== ua) return ub - ua;
			return a.port - b.port;
		};
		focus.sort(sortByUsage);
		game.sort(sortByUsage);
		other.sort(sortByUsage);
		folded.sort(sortByUsage);

		return {focusPorts: focus, gamePorts: game, otherPorts: other, foldedPorts: folded};
	}, [portInfos, processSearch, focusProcesses, foldedProcesses, portUsageCount]);

	const isPortListening = portInfos.some((info) => info.port === localPort);
	const occupiedBy = portInfos.find((info) => info.port === localPort);

	const selectPort = (info: PortProcessInfo) => {
		setLocalPort(info.port);
		incrementPortUsage(info.port);
		if (settings.autoProtocolSwitch) {
			setSettings({protocol: info.protocol === "UDP" ? "UDP" : "TCP"});
		}
	};

	const toggleFocus = (processName: string) => {
		const lower = processName.toLowerCase();
		const newSet = new Set(focusProcesses);
		if (newSet.has(lower)) newSet.delete(lower);
		else newSet.add(lower);
		saveFocusProcesses(newSet);
	};
	const toggleFold = (processName: string) => {
		const lower = processName.toLowerCase();
		const newSet = new Set(foldedProcesses);
		if (newSet.has(lower)) newSet.delete(lower);
		else newSet.add(lower);
		saveFoldedProcesses(newSet);
	};
	const copyPort = async (port: number) => {
		try {
			await navigator.clipboard.writeText(port.toString());
			toast.success(`已复制 ${port}`);
		} catch {}
	};

	const renderPortItem = (info: PortProcessInfo) => {
		const isSelected = localPort === info.port;
		const isFocus = focusProcesses.has(info.process_name.toLowerCase());
		const isNew = newPorts.has(info.port);
		const displayName = info.friendly_name || info.process_name;

		return (
			<button
				key={`${info.port}-${info.pid}`}
				onClick={() => selectPort(info)}
				onContextMenu={(e) => {
					e.preventDefault();
					setContextMenu({x: e.clientX, y: e.clientY, info});
				}}
				className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all active:scale-95 border ${
					isSelected
						? "bg-primary text-primary-foreground border-primary"
						: isFocus
						? "bg-yellow-500/15 text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/25"
						: info.category === "game"
						? "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20"
						: "bg-primary/10 hover:bg-primary/20 text-primary border-transparent"
				}`}
				title={`PID: ${info.pid} | ${info.protocol} | ${info.process_name}`}
			>
				{isNew && <span className="mr-1 text-[9px]">🆕</span>}
				{info.port}
				<span className={`ml-1.5 text-[9px] font-sans ${info.protocol === "UDP" ? "text-orange-400" : "text-green-400"}`}>
					{info.protocol}
				</span>
				<span className="opacity-70 ml-1 font-sans text-[10px]">
					{displayName}
				</span>
			</button>
		);
	};

	const renderGroup = (label: string, ports: PortProcessInfo[], icon?: string, className?: string) => {
		if (ports.length === 0) return null;
		return (
			<div className="space-y-1">
				<div className={`text-[10px] font-bold flex items-center gap-1 ${className || "text-muted-foreground"}`}>
					{icon && <span>{icon}</span>}
					{label}
				</div>
				<div className="flex flex-wrap gap-2">
					{ports.map(renderPortItem)}
				</div>
			</div>
		);
	};

	const doCreateLobby = async () => {
		if (localPort < 1 || localPort > 65535) {
			toast.error("端口号必须在 1-65535 之间");
			return;
		}
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

	const handleCreateLobby = async () => {
		if (settings.showRoomConfirm) {
			setShowConfirmModal(true);
			return;
		}
		await doCreateLobby();
	};

	const confirmCreateLobby = async () => {
		if (dontShowAgain) {
			setSettings({showRoomConfirm: false});
		}
		setShowConfirmModal(false);
		setDontShowAgain(false);
		await doCreateLobby();
	};

	const handleJoinLobby = async () => {
		if (!lobbyIdInput) {
			toast.error("请输入房间 ID");
			return;
		}
		if (localPort < 1 || localPort > 65535) {
			toast.error("端口号必须在 1-65535 之间");
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
			<div className="p-3 rounded-2xl border border-primary/20 bg-primary/5 space-y-2">
				<div className="flex items-center gap-2 text-[11px] font-bold text-primary">
					<Search className="w-3.5 h-3.5" />
					本地监听端口
					<span className="ml-auto text-[10px] font-normal opacity-60">
						右键端口可重点关注/折叠
					</span>
				</div>
				<input
					type="text"
					value={processSearch}
					onChange={(e) => setProcessSearch(e.target.value)}
					className="w-full h-9 px-3 text-xs bg-background/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					placeholder="搜索端口号或进程名..."
				/>
				{portInfos.length === 0 ? (
					<div className="text-center py-6 text-xs text-muted-foreground leading-relaxed">
						暂未检测到监听端口
						<br />
						请先在游戏中创建局域网房间
					</div>
				) : (
					<div className="max-h-56 overflow-y-auto space-y-2">
						{renderGroup("重点关注", focusPorts, "⭐", "text-yellow-500")}
						{renderGroup("游戏端口", gamePorts, "🎮", "text-green-500")}
						{renderGroup("其他端口", otherPorts)}
						{foldedPorts.length > 0 && (
							<div className="space-y-1">
								<button
									onClick={() => setShowFolded(!showFolded)}
									className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
								>
									{showFolded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
									已折叠 ({foldedPorts.length})
								</button>
								{showFolded && (
									<div className="flex flex-wrap gap-2 opacity-60">
										{foldedPorts.map(renderPortItem)}
									</div>
								)}
							</div>
						)}
						{focusPorts.length === 0 && gamePorts.length === 0 && otherPorts.length === 0 && foldedPorts.length === 0 && (
							<span className="text-xs text-muted-foreground px-2 py-1">
								无匹配端口
							</span>
						)}
					</div>
				)}
			</div>

			<div className="space-y-1">
				<div className="flex flex-wrap gap-1.5 ml-2 mb-1">
					{GAME_PRESETS.map((preset) => (
						<button
							key={preset.port}
							onClick={() => {
								setLocalPort(preset.port);
								incrementPortUsage(preset.port);
								if (settings.autoProtocolSwitch) {
									setSettings({protocol: preset.protocol as "TCP" | "UDP"});
								}
							}}
							className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
								localPort === preset.port
									? "bg-primary text-primary-foreground"
									: "bg-muted/30 text-muted-foreground hover:text-foreground"
							}`}
							title={`${preset.port} ${preset.protocol}`}
						>
							{preset.name}
						</button>
					))}
				</div>
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
						min={1}
						max={65535}
						value={localPort}
						onChange={(e) => {
							const v = parseInt(e.target.value, 10);
							setLocalPort(isNaN(v) ? 0 : v);
						}}
						className={`w-full h-14 pl-12 pr-12 text-lg font-mono font-semibold bg-muted/30 border rounded-2xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all text-center ${
							localPort < 1 || localPort > 65535
								? "border-red-500 focus:ring-red-500/50"
								: "border-border focus:ring-ring"
						}`}
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
							? `✓ 端口正在监听 (${occupiedBy?.friendly_name || occupiedBy?.process_name})`
							: "端口未监听，请先在游戏中开启联机"}
					</p>
				)}
				{(localPort < 1 || localPort > 65535) && (
					<p className="text-[11px] ml-2 text-red-500">
						⚠ 端口号必须在 1-65535 之间
					</p>
				)}
				{occupiedBy && occupiedBy.category !== "game" && !focusProcesses.has(occupiedBy.process_name.toLowerCase()) && (
					<p className="text-[11px] ml-2 text-yellow-500 flex items-center gap-1">
						<AlertTriangle className="w-3 h-3" />
						该端口被 {occupiedBy.process_name} 占用，确定是游戏端口？
					</p>
				)}
			{autoDetect && (
				<p className="text-[11px] ml-2 text-primary/70">
					📡 每 2 秒扫描，检测到游戏端口将自动填入
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

			{contextMenu && (
				<>
					<div
						className="fixed inset-0 z-[199]"
						onClick={() => setContextMenu(null)}
					/>
					<div
						className="fixed z-[200] bg-card border border-border rounded-lg shadow-xl py-1 text-xs min-w-[160px]"
						style={{
							left: Math.min(contextMenu.x, window.innerWidth - 180),
							top: Math.min(contextMenu.y, window.innerHeight - 120),
						}}
					>
						<button
							onClick={() => {
								toggleFocus(contextMenu.info.process_name);
								setContextMenu(null);
							}}
							className="w-full px-4 py-2 text-left hover:bg-primary/10 flex items-center gap-2 text-foreground"
						>
							<Star className="w-3 h-3" />
							{focusProcesses.has(contextMenu.info.process_name.toLowerCase()) ? "取消重点关注" : "重点关注此进程"}
						</button>
						<button
							onClick={() => {
								toggleFold(contextMenu.info.process_name);
								setContextMenu(null);
							}}
							className="w-full px-4 py-2 text-left hover:bg-primary/10 flex items-center gap-2 text-foreground"
						>
							<ChevronRight className="w-3 h-3" />
							{foldedProcesses.has(contextMenu.info.process_name.toLowerCase()) ? "取消折叠" : "折叠此进程"}
						</button>
						<button
							onClick={() => {
								copyPort(contextMenu.info.port);
								setContextMenu(null);
							}}
							className="w-full px-4 py-2 text-left hover:bg-primary/10 flex items-center gap-2 text-foreground"
						>
							<Copy className="w-3 h-3" />
							复制端口号
						</button>
					</div>
				</>
			)}

			{showConfirmModal && (
				<>
					<div
						className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[150]"
						onClick={() => setShowConfirmModal(false)}
					/>
					<div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm mx-4 p-6 rounded-3xl bg-card border border-border shadow-2xl space-y-4 z-[160]">
						<h3 className="text-base font-black text-foreground text-center">
							🎮 准备开房间了？
						</h3>
						<p className="text-sm text-muted-foreground text-center leading-relaxed">
							请确认你已在游戏中创建好局域网房间，并选择了对应的端口号。
						</p>
						<div className="flex gap-3">
							<button
								onClick={() => {
									setShowConfirmModal(false);
									setDontShowAgain(false);
								}}
								className="flex-1 h-11 rounded-xl border border-border bg-muted/30 text-sm font-bold text-muted-foreground hover:bg-muted/50 transition-colors"
							>
								否，返回
							</button>
							<button
								onClick={confirmCreateLobby}
								className="flex-1 h-11 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
							>
								是，创建房间
							</button>
						</div>
						<label className="flex items-center justify-center gap-2 text-xs text-muted-foreground cursor-pointer">
							<input
								type="checkbox"
								checked={dontShowAgain}
								onChange={(e) => setDontShowAgain(e.target.checked)}
								className="accent-primary"
							/>
							以后不再显示此提示
						</label>
					</div>
				</>
			)}
		</div>
	);
}
