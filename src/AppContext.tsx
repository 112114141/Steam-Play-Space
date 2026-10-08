// src/AppContext.tsx

import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {
	createContext,
	ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState
} from "react";
import {toast} from "react-hot-toast";
import {NetworkStatus} from "./types";

interface InvitePayload {
	lobby_id: string;
	friend_id: string;
	friend_name: string;
}

interface AppSettings {
	autoDetectDefault: boolean;
	minimizeToTray: boolean;
	autoProtocolSwitch: boolean;
	protocol: "TCP" | "UDP";
	micDeviceId: string;
	speakerDeviceId: string;
	micVolume: number;
	noiseSuppression: boolean;
	echoCancellation: boolean;
	autoGainControl: boolean;
}

interface AppState {
	networkStatus: NetworkStatus;
	currentLobbyId: string | null;
	localPort: number;
	pendingInvite: InvitePayload | null;
	richPresenceJoin: InvitePayload | null;
	lastHostId: string | null;
	settings: AppSettings;
}

interface AppContextType extends AppState {
	setLocalPort: (port: number) => void;
	setCurrentLobbyId: (id: string | null) => void;
	setLastHostId: (id: string | null) => void;
	setSettings: (settings: Partial<AppSettings>) => void;
	refreshStatus: () => Promise<void>;
	clearPendingInvite: () => void;
	clearRichPresenceJoin: () => void;
	hydrated: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const initialNetworkStatus: NetworkStatus = {
	isHost: false,
	isConnected: false,
	tcpClientCount: 0,
	statusMessage: "Initializing...",
	ping: 0,
	connectionType: "Unknown",
	lobbyId: null,
	bytesSent: 0,
	bytesReceived: 0
};

const defaultSettings: AppSettings = {
	autoDetectDefault: true,
	minimizeToTray: true,
	autoProtocolSwitch: true,
	protocol: "TCP",
	micDeviceId: "",
	speakerDeviceId: "",
	micVolume: 100,
	noiseSuppression: true,
	echoCancellation: true,
	autoGainControl: true,
};

const loadSettings = (): AppSettings => {
	const saved = localStorage.getItem("p2p_settings");
	if (saved) {
		try {
			return {...defaultSettings, ...JSON.parse(saved)};
		} catch {
			return defaultSettings;
		}
	}
	return defaultSettings;
};

export const AppProvider = ({children}: {children: ReactNode}) => {
	const [state, setState] = useState<AppState>({
		networkStatus: initialNetworkStatus,
		currentLobbyId: null,
		localPort: parseInt(localStorage.getItem("p2p_last_port") || "25565", 10),
		pendingInvite: null,
		richPresenceJoin: null,
		lastHostId: null,
		settings: loadSettings()
	});
	const [hydrated, setHydrated] = useState(false);
	const wasConnectedRef = useRef(false);

	const refreshStatus = useCallback(async () => {
		try {
			const status = await invoke<NetworkStatus>("get_network_status");
			setState((prevState) => ({
				...prevState,
				networkStatus: status,
				currentLobbyId: status.lobbyId ?? prevState.currentLobbyId
			}));
		} catch (e) {
			console.error("Failed to get network status:", e);
		}
	}, []);

	const setLocalPort = (port: number) => {
		localStorage.setItem("p2p_last_port", port.toString());
		setState((prevState) => ({...prevState, localPort: port}));
	};

	const setCurrentLobbyId = (id: string | null) => {
		setState((prevState) => ({
			...prevState,
			currentLobbyId: id,
			pendingInvite: null,
			richPresenceJoin: null
		}));
	};

	const setLastHostId = (id: string | null) => {
		setState((prevState) => ({...prevState, lastHostId: id}));
	};

	const setSettings = (newSettings: Partial<AppSettings>) => {
		setState((prev) => {
			const updated = {...prev.settings, ...newSettings};
			localStorage.setItem("p2p_settings", JSON.stringify(updated));
			return {...prev, settings: updated};
		});
	};

	const clearPendingInvite = () => {
		setState((prevState) => ({...prevState, pendingInvite: null}));
	};

	const clearRichPresenceJoin = () => {
		setState((prevState) => ({...prevState, richPresenceJoin: null}));
	};

	useEffect(() => {
		refreshStatus().finally(() => setHydrated(true));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!hydrated) return;
		const interval = setInterval(refreshStatus, 1000);
		return () => clearInterval(interval);
	}, [refreshStatus, hydrated]);

	useEffect(() => {
		const wasConnected = wasConnectedRef.current;
		const {isConnected, isHost} = state.networkStatus;

		if (
			wasConnected &&
			!isConnected &&
			!isHost &&
			state.lastHostId &&
			state.currentLobbyId
		) {
			toast.loading("连接断开，正在重连...", {id: "reconnect"});
			if (state.settings.protocol === "UDP") {
				invoke("start_udp_client", {
					hostIdStr: state.lastHostId,
					localPort: state.localPort
				})
					.then(() => {
						toast.success("重连成功", {id: "reconnect"});
					})
					.catch(() => {
						toast.error("重连失败，请手动重试", {id: "reconnect"});
					});
			} else {
				invoke("connect_to_host", {
					hostIdStr: state.lastHostId,
					localPort: state.localPort
				})
					.then(() => {
						toast.success("重连成功", {id: "reconnect"});
					})
					.catch(() => {
						toast.error("重连失败，请手动重试", {id: "reconnect"});
					});
			}
		}
		wasConnectedRef.current = isConnected;
	}, [
		state.networkStatus.isConnected,
		state.networkStatus.isHost,
		state.lastHostId,
		state.currentLobbyId,
		state.localPort,
		state.settings.protocol
	]);

	useEffect(() => {
		const unlisten = listen<InvitePayload>("invite-received", (event) => {
			toast(`📨 ${event.payload.friend_name} 邀请你加入房间`, {
				icon: "🎮",
				duration: 10000
			});
			setState((prevState) => ({
				...prevState,
				pendingInvite: event.payload
			}));
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	useEffect(() => {
		const unlisten = listen<InvitePayload>("rich-presence-join", (event) => {
			setState((prevState) => ({
				...prevState,
				richPresenceJoin: event.payload
			}));
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	useEffect(() => {
		const unlisten = listen("lobby-member-changed", () => {
			refreshStatus();
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, [refreshStatus]);

	const value = {
		...state,
		setLocalPort,
		setCurrentLobbyId,
		setLastHostId,
		setSettings,
		refreshStatus,
		clearPendingInvite,
		clearRichPresenceJoin,
		hydrated
	};
	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
	const context = useContext(AppContext);
	if (context === undefined) {
		throw new Error("useApp must be used within an AppProvider");
	}
	return context;
};
