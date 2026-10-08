// // src/components/LobbyBrowser.tsx
//
// import { useState, useEffect, useCallback } from "react";
// import { invoke } from "@tauri-apps/api/core";
// import { LobbyInfo } from "../types";
// import { toast } from "react-hot-toast";
// import { RefreshCw, Users, LogIn } from "lucide-react";
//
// interface Props {
//     onJoinLobby: (lobbyId: string) => void;
//     isJoining: boolean;
// }
//
// export function LobbyBrowser({ onJoinLobby, isJoining }: Props) {
//     const [lobbies, setLobbies] = useState<LobbyInfo[]>([]);
//     const [isLoading, setIsLoading] = useState(false);
//
//     const fetchLobbies = useCallback(async () => {
//         setIsLoading(true);
//         try {
//             const result = await invoke<LobbyInfo[]>("search_lobbies");
//             setLobbies(result);
//         } catch (e) {
//             toast.error("搜索大厅失败: " + String(e));
//         } finally {
//             setIsLoading(false);
//         }
//     }, []);
//
//     useEffect(() => {
//         fetchLobbies();
//     }, [fetchLobbies]);
//
//     return (
//         <div className="space-y-4">
//             <div className="flex items-center justify-between">
//                 <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
//                     公开房间列表
//                 </h3>
//                 <button
//                     onClick={fetchLobbies}
//                     disabled={isLoading || isJoining}
//                     className="btn-secondary text-xs flex items-center gap-1.5 p-1.5"
//                     title="刷新列表"
//                 >
//                     <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
//                 </button>
//             </div>
//
//             <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
//                 {isLoading && lobbies.length === 0 && (
//                     <p className="text-center text-slate-500 text-sm py-4">正在搜索...</p>
//                 )}
//                 {!isLoading && lobbies.length === 0 && (
//                     <p className="text-center text-slate-500 text-sm py-4">未找到公开房间。</p>
//                 )}
//                 {lobbies.map((lobby) => (
//                     <div key={lobby.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-950/50 border border-white/5 group">
//                         <div className="overflow-hidden">
//                             <p className="font-semibold text-slate-200 truncate">{lobby.name}</p>
//                             <div className="flex items-center gap-2 text-xs text-slate-400">
//                                 <Users size={12} />
//                                 <span>{lobby.member_count} / {lobby.max_members}</span>
//                             </div>
//                         </div>
//                         <button
//                             onClick={() => onJoinLobby(lobby.id)}
//                             disabled={isJoining || isLoading}
//                             className="btn-primary bg-green-600 hover:bg-green-500 text-xs flex items-center gap-1.5 whitespace-nowrap"
//                         >
//                             <LogIn size={14}/>
//                             加入
//                         </button>
//                     </div>
//                 ))}
//             </div>
//         </div>
//     );
// }