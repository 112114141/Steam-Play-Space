import {invoke} from "@tauri-apps/api/core";
import {open} from "@tauri-apps/plugin-dialog";
import {Radar, Minimize2, X, Settings, ArrowLeftRight, Mic, Volume2, RefreshCw, Waves, Folder, AlertCircle} from "lucide-react";
import {useApp} from "../AppContext";
import {useEffect, useState} from "react";

interface Props {
	isOpen: boolean;
	onClose: () => void;
}

export function SettingsPanel({isOpen, onClose}: Props) {
	const {settings, setSettings} = useApp();
	const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
	const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);

	const refreshDevices = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({audio: true});
			stream.getTracks().forEach((t) => t.stop());
			const devices = await navigator.mediaDevices.enumerateDevices();
			setAudioInputs(devices.filter((d) => d.kind === "audioinput"));
			setAudioOutputs(devices.filter((d) => d.kind === "audiooutput"));
		} catch (e) {
			console.error("获取设备列表失败:", e);
		}
	};

	const selectSaveFolder = async () => {
		try {
			const selected = await open({directory: true, multiple: false});
			if (typeof selected === "string") {
				setSettings({fileSavePath: selected});
				await invoke("set_file_save_path", {path: selected});
			}
		} catch (e) {
			console.error("选择文件夹失败:", e);
		}
	};

	const resetSaveFolder = async () => {
		setSettings({fileSavePath: ""});
		await invoke("set_file_save_path", {path: ""});
	};

	useEffect(() => {
		if (isOpen) {
			refreshDevices();
			invoke<string>("get_file_save_path").then((p) => {
				if (p !== settings.fileSavePath) {
					setSettings({fileSavePath: p});
				}
			}).catch(() => {});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<>
			<div
				className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[150]"
				onClick={onClose}
			/>
			<div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm mx-4 p-6 rounded-3xl bg-card border border-border shadow-2xl space-y-5 z-[160]">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Settings className="w-5 h-5 text-primary" />
						<h2 className="text-lg font-black text-foreground">设置</h2>
					</div>
					<button
						onClick={onClose}
						className="p-2 rounded-lg hover:bg-muted transition-colors"
					>
						<X className="w-4 h-4 text-muted-foreground" />
					</button>
				</div>

				<div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border">
					<div className="flex items-center gap-3">
						<Radar className="w-5 h-5 text-primary" />
						<div>
							<p className="text-sm font-bold text-foreground">
								端口轮询默认开启
							</p>
							<p className="text-xs text-muted-foreground">
								启动时自动检测游戏端口
							</p>
						</div>
					</div>
					<button
						onClick={() =>
							setSettings({
								autoDetectDefault: !settings.autoDetectDefault
							})
						}
						className={`w-12 h-7 rounded-full transition-colors relative ${
							settings.autoDetectDefault
								? "bg-primary"
								: "bg-muted-foreground/30"
						}`}
					>
						<div
							className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
								settings.autoDetectDefault
									? "translate-x-6"
									: "translate-x-1"
							}`}
						/>
					</button>
				</div>

				<div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border">
					<div className="flex items-center gap-3">
						<Minimize2 className="w-5 h-5 text-primary" />
						<div>
							<p className="text-sm font-bold text-foreground">
								退出时最小化到托盘
							</p>
							<p className="text-xs text-muted-foreground">
								关闭窗口时隐藏到系统托盘
							</p>
						</div>
					</div>
					<button
						onClick={() =>
							setSettings({minimizeToTray: !settings.minimizeToTray})
						}
						className={`w-12 h-7 rounded-full transition-colors relative ${
							settings.minimizeToTray
								? "bg-primary"
								: "bg-muted-foreground/30"
						}`}
					>
						<div
							className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
								settings.minimizeToTray
									? "translate-x-6"
									: "translate-x-1"
							}`}
						/>
					</button>
				</div>

				<div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<ArrowLeftRight className="w-5 h-5 text-primary" />
							<div>
								<p className="text-sm font-bold text-foreground">
									协议自动切换
								</p>
								<p className="text-xs text-muted-foreground">
									根据端口类型自动选择 TCP/UDP
								</p>
							</div>
						</div>
						<button
							onClick={() =>
								setSettings({autoProtocolSwitch: !settings.autoProtocolSwitch})
							}
							className={`w-12 h-7 rounded-full transition-colors relative ${
								settings.autoProtocolSwitch
									? "bg-primary"
									: "bg-muted-foreground/30"
							}`}
						>
							<div
								className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
									settings.autoProtocolSwitch
										? "translate-x-6"
										: "translate-x-1"
								}`}
							/>
						</button>
					</div>

					{!settings.autoProtocolSwitch && (
						<div className="flex items-center gap-2 pt-2 border-t border-border">
							<span className="text-xs text-muted-foreground">手动选择:</span>
							<button
								onClick={() => setSettings({protocol: "TCP"})}
								className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
									settings.protocol === "TCP"
										? "bg-green-500/20 text-green-500"
										: "bg-muted/30 text-muted-foreground hover:text-foreground"
								}`}
							>
								TCP
							</button>
							<button
								onClick={() => setSettings({protocol: "UDP"})}
								className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
									settings.protocol === "UDP"
										? "bg-orange-400/20 text-orange-400"
										: "bg-muted/30 text-muted-foreground hover:text-foreground"
								}`}
							>
								UDP
							</button>
						</div>
					)}

					<div className="pt-2 border-t border-border space-y-1.5">
						<p className="text-[11px] text-muted-foreground leading-relaxed">
							<span className="text-green-500 font-bold">TCP</span>：可靠传输，保证数据送达和顺序。适用于大多数游戏（Minecraft、Terraria、Project Zomboid 等）。
						</p>
						<p className="text-[11px] text-muted-foreground leading-relaxed">
							<span className="text-orange-400 font-bold">UDP</span>：不可靠传输，低延迟但不保证送达。适用于 UDP 游戏（Valheim、L4D2、幻兽帕鲁 等）。
						</p>
						<p className="text-[11px] text-muted-foreground leading-relaxed">
							自动切换通过 netstat 检测端口协议类型，准确率约 90%。同端口有 TCP+UDP 时优先 TCP。
						</p>
					</div>
				</div>

				<div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-3">
					<div className="flex items-center gap-3">
						<AlertCircle className="w-5 h-5 text-primary" />
						<div className="flex-1">
							<p className="text-sm font-bold text-foreground">开房间确认弹窗</p>
							<p className="text-xs text-muted-foreground">创建房间前提示确认游戏已就绪</p>
						</div>
					</div>
					<div className="flex items-center justify-between pt-2 border-t border-border">
						<span className="text-xs text-muted-foreground">
							{settings.showRoomConfirm ? "已开启" : "已关闭"}
						</span>
						<button
							onClick={() => setSettings({showRoomConfirm: !settings.showRoomConfirm})}
							className={`w-12 h-7 rounded-full transition-colors relative ${
								settings.showRoomConfirm ? "bg-primary" : "bg-muted-foreground/30"
							}`}
						>
							<div
								className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
									settings.showRoomConfirm ? "translate-x-6" : "translate-x-1"
								}`}
							/>
						</button>
					</div>
				</div>

				<div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-3">
					<div className="flex items-center gap-3">
						<Folder className="w-5 h-5 text-primary" />
						<div className="flex-1">
							<p className="text-sm font-bold text-foreground">文件保存位置</p>
							<p className="text-xs text-muted-foreground">接收的文件保存到此目录</p>
						</div>
					</div>
					<div className="pt-2 border-t border-border space-y-2">
						<div className="px-3 py-2 rounded-lg bg-card border border-border text-xs text-foreground truncate">
							{settings.fileSavePath || "默认：桌面"}
						</div>
						<div className="flex gap-2">
							<button
								onClick={selectSaveFolder}
								className="flex-1 h-9 rounded-lg bg-primary/10 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
							>
								选择文件夹
							</button>
							{settings.fileSavePath && (
								<button
									onClick={resetSaveFolder}
									className="px-3 h-9 rounded-lg bg-muted/30 text-xs font-bold text-muted-foreground hover:bg-muted/50 transition-colors"
								>
									恢复默认
								</button>
							)}
						</div>
					</div>
				</div>

				<div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-3">
					<div className="flex items-center gap-3">
						<Mic className="w-5 h-5 text-primary" />
						<div className="flex-1">
							<p className="text-sm font-bold text-foreground">语音设置</p>
							<p className="text-xs text-muted-foreground">麦克风、扬声器、降噪</p>
						</div>
						<button
							onClick={refreshDevices}
							className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-muted-foreground hover:text-foreground transition-colors"
						>
							<RefreshCw className="w-3 h-3" />
							刷新
						</button>
					</div>

					<div className="space-y-2 pt-2 border-t border-border">
						<div>
							<label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">麦克风</label>
							<select
								value={settings.micDeviceId}
								onChange={(e) => setSettings({micDeviceId: e.target.value})}
								className="w-full h-9 mt-1 px-3 rounded-lg bg-card border border-border text-xs text-foreground outline-none focus:border-primary/50"
							>
								<option value="">系统默认</option>
								{audioInputs.map((d) => (
									<option key={d.deviceId} value={d.deviceId}>{d.label || `设备 ${d.deviceId.slice(0, 8)}`}</option>
								))}
							</select>
						</div>

						<div>
							<label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">扬声器</label>
							<select
								value={settings.speakerDeviceId}
								onChange={(e) => setSettings({speakerDeviceId: e.target.value})}
								className="w-full h-9 mt-1 px-3 rounded-lg bg-card border border-border text-xs text-foreground outline-none focus:border-primary/50"
							>
								<option value="">系统默认</option>
								{audioOutputs.map((d) => (
									<option key={d.deviceId} value={d.deviceId}>{d.label || `设备 ${d.deviceId.slice(0, 8)}`}</option>
								))}
							</select>
						</div>

						<div>
							<div className="flex items-center justify-between">
								<label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">麦克风音量</label>
								<span className="text-[10px] text-primary font-bold">{settings.micVolume}%</span>
							</div>
							<input
								type="range"
								min="0"
								max="200"
								value={settings.micVolume}
								onChange={(e) => setSettings({micVolume: parseInt(e.target.value)})}
								className="w-full mt-1 accent-primary"
							/>
						</div>
					</div>

					<div className="space-y-2 pt-2 border-t border-border">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Waves className="w-4 h-4 text-primary" />
								<span className="text-xs font-bold text-foreground">回声消除</span>
							</div>
							<button
								onClick={() => setSettings({echoCancellation: !settings.echoCancellation})}
								className={`w-10 h-6 rounded-full transition-colors relative ${settings.echoCancellation ? "bg-primary" : "bg-muted-foreground/30"}`}
							>
								<div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.echoCancellation ? "translate-x-5" : "translate-x-1"}`} />
							</button>
						</div>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Waves className="w-4 h-4 text-primary" />
								<span className="text-xs font-bold text-foreground">降噪</span>
							</div>
							<button
								onClick={() => setSettings({noiseSuppression: !settings.noiseSuppression})}
								className={`w-10 h-6 rounded-full transition-colors relative ${settings.noiseSuppression ? "bg-primary" : "bg-muted-foreground/30"}`}
							>
								<div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.noiseSuppression ? "translate-x-5" : "translate-x-1"}`} />
							</button>
						</div>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Volume2 className="w-4 h-4 text-primary" />
								<span className="text-xs font-bold text-foreground">自动增益</span>
							</div>
							<button
								onClick={() => setSettings({autoGainControl: !settings.autoGainControl})}
								className={`w-10 h-6 rounded-full transition-colors relative ${settings.autoGainControl ? "bg-primary" : "bg-muted-foreground/30"}`}
							>
								<div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.autoGainControl ? "translate-x-5" : "translate-x-1"}`} />
							</button>
						</div>
						<p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-1">
							降噪/回声消除/自动增益由浏览器原生实现，性能开销极小。关闭可降低延迟但音质可能下降。
						</p>
					</div>
				</div>

				<div className="pt-3 border-t border-border text-center">
					<p className="text-[11px] text-muted-foreground">
						Made By{" "}
						<span
							onClick={() => invoke("open_url", {url: "https://github.com/112114141"})}
							className="text-blue-500 font-bold cursor-pointer hover:underline"
						>
							112114141
						</span>
					</p>
				</div>
			</div>
		</>
	);
}