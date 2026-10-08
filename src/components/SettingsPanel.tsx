import {invoke} from "@tauri-apps/api/core";
import {Radar, Minimize2, X, Settings, ArrowLeftRight} from "lucide-react";
import {useApp} from "../AppContext";

interface Props {
	isOpen: boolean;
	onClose: () => void;
}

export function SettingsPanel({isOpen, onClose}: Props) {
	const {settings, setSettings} = useApp();

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