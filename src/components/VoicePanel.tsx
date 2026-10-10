import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX} from "lucide-react";
import {useEffect, useState, useRef} from "react";
import {useApp} from "../AppContext";
import {voiceManager} from "../voice";

interface VoiceUser {
	id: string;
	name: string;
	speaking: boolean;
}

export function VoicePanel() {
	const {settings} = useApp();
	const [inVoice, setInVoice] = useState(false);
	const [muted, setMuted] = useState(false);
	const [voiceUsers, setVoiceUsers] = useState<VoiceUser[]>([]);
	const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
	const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set());
	const mutedUsersRef = useRef<Set<string>>(new Set());
	const myIdRef = useRef<string | null>(null);

	useEffect(() => {
		invoke<string>("get_local_user_id").then((id) => { myIdRef.current = id; }).catch(console.error);
		invoke<boolean>("is_voice_active").then(setInVoice).catch(console.error);
	}, []);

	useEffect(() => {
		const interval = setInterval(() => {
			if (inVoice) {
				invoke<VoiceUser[]>("get_voice_users")
					.then(setVoiceUsers)
					.catch(() => {});
			}
		}, 1000);
		return () => clearInterval(interval);
	}, [inVoice]);

	useEffect(() => {
		const unlistenVoice = listen<{sender_id: string; data: number[]}>("voice-data", (event) => {
			if (!inVoice) return;
			const {sender_id, data} = event.payload;
			if (mutedUsersRef.current.has(sender_id)) return;
			voiceManager.playAudioData(data);
			setSpeakingIds((prev) => {
				const next = new Set(prev);
				next.add(sender_id);
				return next;
			});
			setTimeout(() => {
				setSpeakingIds((prev) => {
					const next = new Set(prev);
					next.delete(sender_id);
					return next;
				});
			}, 600);
		});
		return () => {
			unlistenVoice.then((fn) => fn());
		};
	}, [inVoice]);

	const handleJoinVoice = async () => {
		try {
			await voiceManager.start({
				micDeviceId: settings.micDeviceId,
				speakerDeviceId: settings.speakerDeviceId,
				micVolume: settings.micVolume,
				noiseSuppression: settings.noiseSuppression,
				echoCancellation: settings.echoCancellation,
				autoGainControl: settings.autoGainControl,
			});
			await invoke("join_voice");
			setInVoice(true);
			setMuted(false);
		} catch (e) {
			console.error("加入语音失败:", e);
			voiceManager.stop();
		}
	};

	const handleLeaveVoice = async () => {
		voiceManager.stop();
		await invoke("leave_voice").catch(console.error);
		setInVoice(false);
		setMuted(false);
		setVoiceUsers([]);
		setMutedUsers(new Set());
		mutedUsersRef.current = new Set();
	};

	const handleToggleMute = () => {
		const newMuted = !muted;
		voiceManager.setMuted(newMuted);
		setMuted(newMuted);
	};

	const handleToggleMuteUser = (userId: string) => {
		setMutedUsers((prev) => {
			const next = new Set(prev);
			if (next.has(userId)) {
				next.delete(userId);
				voiceManager.resetJitterBuffer();
			} else {
				next.add(userId);
			}
			mutedUsersRef.current = next;
			return next;
		});
	};

	if (!inVoice) {
		return (
			<div className="flex items-center gap-2 px-6 py-2 border-t border-border">
				<button
					onClick={handleJoinVoice}
					className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-xs font-bold hover:bg-emerald-500/20 transition-colors active:scale-95"
				>
					<Phone className="w-3.5 h-3.5" />
					加入语音
				</button>
				<span className="text-[10px] text-muted-foreground/60">
					全房间语音会议室
				</span>
			</div>
		);
	}

	return (
		<div className="px-6 py-2 border-t border-border space-y-2">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
						<Volume2 className="w-3.5 h-3.5 animate-pulse" />
						语音频道
					</span>
					<span className="text-[10px] text-muted-foreground">
						{voiceUsers.length} 人在频道
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					<button
						onClick={handleToggleMute}
						className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors active:scale-95 ${
							muted
								? "bg-red-500/20 text-red-500"
								: "bg-muted/50 text-foreground hover:bg-muted"
						}`}
						title={muted ? "取消静音" : "静音麦克风"}
					>
						{muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
					</button>
					<button
						onClick={handleLeaveVoice}
						className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors active:scale-95"
						title="离开语音"
					>
						<PhoneOff className="w-4 h-4" />
					</button>
				</div>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{voiceUsers.map((user) => {
					const isMe = user.id === myIdRef.current;
					const isSpeaking = !isMe && speakingIds.has(user.id) && !mutedUsers.has(user.id);
					const userIsMuted = mutedUsers.has(user.id);
					return (
						<div
							key={user.id}
							className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
								isSpeaking
									? "bg-emerald-500/30 text-emerald-500 ring-1 ring-emerald-500/50"
									: "bg-muted/40 text-muted-foreground"
							}`}
						>
							{isSpeaking && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
							{user.name}
							{(isMe && muted) && <MicOff className="w-2.5 h-2.5" />}
							{!isMe && (
							<button
								onClick={() => handleToggleMuteUser(user.id)}
								className={`ml-1 flex items-center justify-center w-5 h-5 rounded-full transition-colors ${userIsMuted ? "bg-red-500/30 text-red-500" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}
								title={userIsMuted ? "取消静音此人" : "静音此人"}
							>
								{userIsMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
							</button>
						)}
						</div>
					);
				})}
			</div>
		</div>
	);
}