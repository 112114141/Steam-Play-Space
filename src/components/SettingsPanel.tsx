import {Radar, Minimize2, X, Settings} from "lucide-react";
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
			</div>
		</>
	);
}