import {invoke} from "@tauri-apps/api/core";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {ExternalLink, UserPlus, X} from "lucide-react";
import {useEffect, useState} from "react";

export function TrayMenuView() {
	const [inLobby, setInLobby] = useState(false);

	useEffect(() => {
		document.documentElement.classList.add("dark");
		document.body.style.background = "transparent";
		document.documentElement.style.background = "transparent";

		invoke<{lobbyId: string | null}>("get_network_status")
			.then((status) => {
				setInLobby(!!status.lobbyId);
			})
			.catch(() => {});
	}, []);

	const showWindow = async () => {
		await invoke("show_main_window");
		await getCurrentWindow().close();
	};

	const inviteFriends = async () => {
		await invoke("show_main_window");
		await invoke("emit_open_friends");
		await getCurrentWindow().close();
	};

	const quit = async () => {
		await invoke("quit_app", {}).catch(() => {});
	};

	return (
		<div className="h-screen w-screen bg-transparent flex items-start justify-center p-0 select-none">
			<div className="mt-2 w-[230px] rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
				<div className="px-4 py-3 border-b border-border">
					<p className="text-xs font-bold text-foreground">Steam Play Space</p>
				</div>

				<button
					onClick={showWindow}
					className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors text-left"
				>
					<ExternalLink className="w-4 h-4 text-muted-foreground" />
					打开
				</button>

				{inLobby && (
					<button
						onClick={inviteFriends}
						className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors text-left"
					>
						<UserPlus className="w-4 h-4 text-muted-foreground" />
						邀请好友
					</button>
				)}

				<div className="border-t border-border" />

				<button
					onClick={quit}
					className="w-full flex items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
				>
					<X className="w-4 h-4" />
					彻底关闭
				</button>
			</div>
		</div>
	);
}
