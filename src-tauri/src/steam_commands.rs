use crate::app_state::{AppState, TunnelState};
use crate::error::{AppError, AppResult};
use crate::net_manager;
use serde::Serialize;
use steamworks::networking_types::NetworkingConnectionState;
use steamworks::{FriendFlags, LobbyId, LobbyType, SteamError, SteamId};
use tauri::{Manager, State};
use tokio::sync::oneshot;
use std::os::windows::process::CommandExt;

#[derive(Serialize, Clone)]
pub struct FriendInfo {
    pub id: String,
    pub name: String,
    pub state: String,
    pub game_id: u32,
    pub state_priority: u8,
    pub in_this_game: bool,
    pub lobby_id: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct LobbyInfo {
    pub id: String,
    pub name: String,
    pub member_count: usize,
    pub max_members: usize,
}

#[derive(Serialize)]
pub struct JoinLobbyResult {
    pub lobby_id: String,
    pub host_id: String,
    pub host_protocol: String,
}

#[derive(Serialize, Clone)]
pub struct NetworkStatusInfo {
    #[serde(rename = "isHost")]
    pub is_host: bool,
    #[serde(rename = "isConnected")]
    pub is_connected: bool,
    #[serde(rename = "tcpClientCount")]
    pub tcp_client_count: usize,
    #[serde(rename = "statusMessage")]
    pub status_message: String,
    pub ping: i32,
    #[serde(rename = "connectionType")]
    pub connection_type: String,
    #[serde(rename = "lobbyId")]
    pub lobby_id: Option<String>,
    #[serde(rename = "bytesSent")]
    pub bytes_sent: u64,
    #[serde(rename = "bytesReceived")]
    pub bytes_received: u64,
}

#[derive(Serialize, Clone)]
pub struct MemberInfo {
    pub id: String,
    pub name: String,
    pub ping: i32,
    pub relay: String,
}

#[tauri::command]
pub fn get_friends(state: State<'_, AppState>) -> Vec<FriendInfo> {
    let friends = state.steam_client.friends();
    let list = friends.get_friends(FriendFlags::IMMEDIATE);
    let mut result: Vec<FriendInfo> = list
        .into_iter()
        .map(|f| {
            let (state_str, priority) = match f.state() {
                steamworks::FriendState::Online => ("在线", 0u8),
                steamworks::FriendState::LookingToPlay => ("游戏中", 0u8),
                steamworks::FriendState::LookingToTrade => ("交易中", 1u8),
                steamworks::FriendState::Away => ("离开", 1u8),
                steamworks::FriendState::Snooze => ("离开", 1u8),
                steamworks::FriendState::Busy => ("忙碌", 2u8),
                steamworks::FriendState::Invisible => ("隐身", 3u8),
                steamworks::FriendState::Offline => ("离线", 4u8),
            };
            let (game_id, lobby_id) = match f.game_played() {
                Some(g) => {
                    let game_id = g.game.app_id().0;
                    let lobby_raw = g.lobby.raw();
                    let lobby_id = if lobby_raw != 0 { Some(lobby_raw.to_string()) } else { None };
                    (game_id, lobby_id)
                }
                None => (0u32, None),
            };
            let in_this_game = game_id == 480;

            FriendInfo {
                id: f.id().raw().to_string(),
                name: f.name(),
                state: state_str.to_string(),
                game_id,
                state_priority: priority,
                in_this_game,
                lobby_id,
            }
        })
        .collect();
    result.sort_by_key(|f| f.state_priority);
    result
}

/// 后端代理 Steam API，避免前端 CORS 问题
#[tauri::command]
pub async fn resolve_game_name(app_id: u32) -> Option<String> {
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={}&l=schinese",
        app_id
    );
    if let Ok(resp) = reqwest::get(&url).await {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            return json[&app_id.to_string()]["data"]["name"]
                .as_str()
                .map(|s| s.to_string());
        }
    }
    None
}

#[tauri::command]
pub async fn create_lobby(state: State<'_, AppState>, protocol: String) -> AppResult<String> {
    let (tx, rx) = oneshot::channel();
    {
        let matchmaking = state.steam_client.matchmaking();
        matchmaking.create_lobby(
            LobbyType::Public,
            4,
            move |result: Result<LobbyId, SteamError>| {
                let _ = tx.send(result);
            },
        );
    }
    let lobby_id = rx
        .await
        .map_err(|_| AppError::Internal("Canceled".to_string()))?
        .map_err(AppError::from)?;

    {
        let mut tunnel_state = state.state.lock();
        *tunnel_state = TunnelState::Hosting(lobby_id);
        log::info!("State updated to Hosting({})", lobby_id.raw());
    }

    let friends = state.steam_client.friends();
    friends.set_rich_presence("steam_display", Some("#Status_InLobby"));
    friends.set_rich_presence("connect", Some(&lobby_id.raw().to_string()));
    state.steam_client.matchmaking().set_lobby_data(lobby_id, "protocol", &protocol);
    Ok(lobby_id.raw().to_string())
}

#[tauri::command]
pub async fn search_lobbies(state: State<'_, AppState>) -> AppResult<Vec<LobbyInfo>> {
    let (tx, rx) = oneshot::channel();
    {
        let matchmaking = state.steam_client.matchmaking();
        matchmaking.request_lobby_list(move |lobbies: Result<Vec<LobbyId>, SteamError>| {
            let _ = tx.send(lobbies);
        });
    }
    let lobbies = rx
        .await
        .map_err(|_| AppError::Internal("Canceled".to_string()))?
        .map_err(AppError::from)?;

    let matchmaking = state.steam_client.matchmaking();
    let mut result = Vec::new();
    for lobby_id in lobbies {
        let member_count = matchmaking.lobby_member_count(lobby_id);
        let member_limit = matchmaking.lobby_member_limit(lobby_id).unwrap_or(4);
        let name = format!("Lobby {}", lobby_id.raw());
        result.push(LobbyInfo {
            id: lobby_id.raw().to_string(),
            name,
            member_count,
            max_members: member_limit,
        });
    }
    Ok(result)
}

#[tauri::command]
pub async fn join_lobby(
    state: State<'_, AppState>,
    lobby_id_str: String,
) -> AppResult<JoinLobbyResult> {
    let lobby_id_u64 = lobby_id_str
        .parse::<u64>()
        .map_err(|_| AppError::Parse("Invalid Lobby ID".to_string()))?;
    let lobby_id = LobbyId::from_raw(lobby_id_u64);

    // Use stop_network to correctly reset token and connections
    net_manager::stop_network(&state);

    let (tx, rx) = oneshot::channel();
    {
        let matchmaking = state.steam_client.matchmaking();
        matchmaking.join_lobby(lobby_id, move |result: Result<LobbyId, ()>| {
            let _ = tx.send(result);
        });
    }
    let joined_lobby_id = rx
        .await
        .map_err(|_| AppError::Internal("Canceled".to_string()))?
        .map_err(|_| AppError::Lobby(format!("Failed to join lobby {}", lobby_id_str)))?;

    {
        let mut tunnel_state = state.state.lock();
        *tunnel_state = TunnelState::Joined(joined_lobby_id);
        log::info!("State updated to Joined({})", joined_lobby_id.raw());
    }

    state
        .steam_client
        .friends()
        .set_rich_presence("steam_display", Some("#Status_InLobby"));
    state
        .steam_client
        .friends()
        .set_rich_presence("connect", Some(&lobby_id_str));
    let (host_id, host_protocol) = {
        let matchmaking = state.steam_client.matchmaking();
        let owner = matchmaking.lobby_owner(joined_lobby_id);
        let protocol = matchmaking
            .lobby_data(joined_lobby_id, "protocol")
            .unwrap_or_else(|| "TCP".to_string());
        (owner, protocol)
    };
    Ok(JoinLobbyResult {
        lobby_id: joined_lobby_id.raw().to_string(),
        host_id: host_id.raw().to_string(),
        host_protocol,
    })
}

#[tauri::command]
pub async fn connect_to_host(
    state: State<'_, AppState>,
    host_id_str: String,
    local_port: u16,
) -> AppResult<()> {
    let host_id_u64 = host_id_str
        .parse::<u64>()
        .map_err(|_| AppError::Parse("Invalid Host ID".to_string()))?;
    let host_id = SteamId::from_raw(host_id_u64);
    let my_id = state.steam_client.user().steam_id();
    if host_id != my_id {
        net_manager::start_network_client(&state, host_id, local_port).await
    } else {
        Err(AppError::Network(
            "Cannot connect to yourself. You are the host.".to_string(),
        ))
    }
}

#[tauri::command]
pub fn leave_lobby(state: State<'_, AppState>) {
    let lobby_id_opt = {
        let mut tunnel_state = state.state.lock();
        let id_opt = match *tunnel_state {
            TunnelState::Hosting(id) => Some(id),
            TunnelState::Joined(id) => Some(id),
            TunnelState::Idle => None,
        };
        *tunnel_state = TunnelState::Idle;
        id_opt
    };

    net_manager::stop_network(&state);

    if let Some(lobby_id) = lobby_id_opt {
        state.steam_client.matchmaking().leave_lobby(lobby_id);
        state.steam_client.friends().clear_rich_presence();
        log::info!("Left lobby and cleared rich presence.");
    }
}

#[tauri::command]
pub fn start_hosting(state: State<'_, AppState>, local_port: u16) -> AppResult<()> {
    {
        let mut port = state.local_game_port.lock();
        *port = local_port;
    }
    net_manager::start_network_host(&state)
}

#[tauri::command]
pub fn stop_hosting(state: State<'_, AppState>) {
    leave_lobby(state);
}

#[tauri::command]
pub fn send_invite(state: State<'_, AppState>, friend_id_str: String) -> AppResult<()> {
    let friend_id_u64 = friend_id_str
        .parse::<u64>()
        .map_err(|_| AppError::Parse("Invalid Friend ID".to_string()))?;
    let friend_id = SteamId::from_raw(friend_id_u64);
    let tunnel_state = state.state.lock();

    let lobby_id = match *tunnel_state {
        TunnelState::Hosting(id) => Some(id),
        TunnelState::Joined(id) => Some(id),
        TunnelState::Idle => None,
    };

    match lobby_id {
        Some(lobby_id) => {
            let mm_ptr = unsafe { steamworks::sys::SteamAPI_SteamMatchmaking_v009() };
            let result = unsafe {
                steamworks::sys::SteamAPI_ISteamMatchmaking_InviteUserToLobby(
                    mm_ptr,
                    lobby_id.raw(),
                    friend_id.raw(),
                )
            };
            let friend_name = state.steam_client.friends().get_friend(friend_id).name();
            log::info!(
                "📨 InviteUserToLobby → {}: {}",
                friend_name,
                if result { "成功" } else { "失败" }
            );
            if !result {
                return Err(AppError::Network("邀请发送失败".to_string()));
            }
            Ok(())
        }
        None => Err(AppError::Lobby("Not in a lobby".to_string())),
    }
}

#[tauri::command]
pub fn get_lobby_members(state: State<'_, AppState>) -> Vec<MemberInfo> {
    let tunnel_state = *state.state.lock();
    let lobby_id_opt = match tunnel_state {
        TunnelState::Hosting(id) => Some(id),
        TunnelState::Joined(id) => Some(id),
        TunnelState::Idle => None,
    };

    if let Some(lobby_id) = lobby_id_opt {
        let matchmaking = state.steam_client.matchmaking();
        let friends = state.steam_client.friends();
        let members = matchmaking.lobby_members(lobby_id);
        let my_id = state.steam_client.user().steam_id();

        // 从 HashMap 中查找每个成员的连接状态
        let connections = state.connections.lock();
        let sockets = state.steam_client.networking_sockets();
        let conn_count = connections.len();

        members
            .into_iter()
            .map(|member_id| {
                let friend_obj = friends.get_friend(member_id);
                let member_id_str = member_id.raw().to_string();

                let mut ping = -1;
                let mut relay = "Unknown".to_string();

                if member_id == my_id {
                    ping = 0;
                    relay = "本地 (Local)".to_string();
                } else if let Some(conn) = connections.get(&member_id) {
                    log::debug!(
                        "🔍 查询成员 {} 的连接状态 ({} 条活动连接中)",
                        friend_obj.name(),
                        conn_count
                    );
                    match sockets.get_realtime_connection_status(conn, 0) {
                        Ok((info, _lanes)) => {
                            ping = info.ping();
                            let state_result = info.connection_state();
                            relay = match state_result {
                                Ok(state) => {
                                    log::debug!(
                                        "✅ 成员 {} 连接状态: {:?}, ping={}ms",
                                        friend_obj.name(),
                                        state,
                                        ping
                                    );
                                    match state {
                                        NetworkingConnectionState::Connected => {
                                            "P2P (Connected)".to_string()
                                        }
                                        _ => format!("{:?}", state),
                                    }
                                }
                                Err(_) => {
                                    log::warn!(
                                        "⚠️ 成员 {} 无法获取连接状态枚举值",
                                        friend_obj.name()
                                    );
                                    format!("ping={}", ping)
                                }
                            };
                        }
                        Err(e) => {
                            log::warn!(
                                "⚠️ 成员 {} 的 get_realtime_connection_status 失败: {:?}",
                                friend_obj.name(),
                                e
                            );
                            relay = "Error".to_string();
                        }
                    }
                } else {
                    log::debug!(
                        "📌 成员 {} (id={}) 不在活动连接表中 (my_id={})",
                        friend_obj.name(),
                        member_id_str,
                        my_id.raw()
                    );
                }

                MemberInfo {
                    id: member_id_str,
                    name: friend_obj.name(),
                    ping,
                    relay,
                }
            })
            .collect()
    } else {
        Vec::new()
    }
}

#[tauri::command]
pub fn get_network_status(state: State<'_, AppState>) -> NetworkStatusInfo {
    let tunnel_state = *state.state.lock();
    let connections = state.connections.lock();
    let client_count = connections.len();
    let is_host = matches!(tunnel_state, TunnelState::Hosting(_));

    let mut ping = -1;
    let mut connection_type = "未连接 (Not Connected)".to_string();
    let mut is_connected = false;

    // 从 HashMap 中获取第一个连接的实时状态作为概览
    let sockets = state.steam_client.networking_sockets();
    if let Some((_id, conn)) = connections.iter().next() {
        if let Ok((info, _lanes)) = sockets.get_realtime_connection_status(conn, 0) {
            ping = info.ping();
            if let Ok(state) = info.connection_state() {
                is_connected = state == NetworkingConnectionState::Connected;
                connection_type = match state {
                    NetworkingConnectionState::Connected => "P2P (Connected)".to_string(),
                    _ => format!("{:?}", state),
                };
            }
        }
    }

    let status_message = match tunnel_state {
        TunnelState::Hosting(_) => format!("正在主持 ({} 名玩家连接)", client_count),
        TunnelState::Joined(_) => "已加入大厅".to_string(),
        TunnelState::Idle => "空闲".to_string(),
    };

    let lobby_id = match tunnel_state {
        TunnelState::Hosting(id) => Some(id.raw().to_string()),
        TunnelState::Joined(id) => Some(id.raw().to_string()),
        TunnelState::Idle => None,
    };

    NetworkStatusInfo {
        is_host,
        is_connected,
        tcp_client_count: client_count,
        status_message,
        ping,
        connection_type,
        lobby_id,
        bytes_sent: state.bytes_sent.load(std::sync::atomic::Ordering::Relaxed),
        bytes_received: state.bytes_received.load(std::sync::atomic::Ordering::Relaxed),
    }
}

/// 获取当前登录用户的 Steam ID
#[tauri::command]
pub fn get_local_user_id(state: State<'_, AppState>) -> String {
    state.steam_client.user().steam_id().raw().to_string()
}

/// 在托盘弹出窗口中使用：显示主窗口
#[tauri::command]
pub fn show_main_window(app_handle: tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.center();
    }
}

/// 在托盘弹出窗口中使用：关闭主窗口（完全退出）
#[tauri::command]
pub fn quit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}
#[derive(Serialize, Clone)]
pub struct PortProcessInfo {
    pub port: u16,
    pub pid: u32,
    pub process_name: String,
    pub protocol: String,
}

/// 扫描本地正在监听的 TCP/UDP 端口及其所属进程名
#[tauri::command]
pub async fn scan_local_ports() -> AppResult<Vec<PortProcessInfo>> {
    let netstat_output = std::process::Command::new("netstat")
        .args(["-ano"])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| AppError::Internal(format!("netstat 执行失败: {}", e)))?;

    let netstat_stdout = String::from_utf8_lossy(&netstat_output.stdout);
    let mut port_pid_proto_list: Vec<(u16, u32, String)> = Vec::new();

    for line in netstat_stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }
        let proto = parts[0].to_uppercase();
        if proto != "TCP" && proto != "UDP" {
            continue;
        }
        let is_listening = parts.iter().any(|&p| p == "LISTENING");
        if proto == "TCP" && !is_listening {
            continue;
        }
        if let Some(port_str) = parts[1].rsplit(':').next() {
            if let Ok(port) = port_str.parse::<u16>() {
                if port > 0 {
                    if let Ok(pid) = parts[parts.len() - 1].parse::<u32>() {
                        port_pid_proto_list.push((port, pid, proto));
                    }
                }
            }
        }
    }

    if port_pid_proto_list.is_empty() {
        return Ok(Vec::new());
    }

    let tasklist_output = std::process::Command::new("tasklist")
        .args(["/fo", "csv", "/nh"])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| AppError::Internal(format!("tasklist 执行失败: {}", e)))?;

    let tasklist_stdout = String::from_utf8_lossy(&tasklist_output.stdout);
    let mut pid_name_map: std::collections::HashMap<u32, String> =
        std::collections::HashMap::new();

    for line in tasklist_stdout.lines() {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() >= 2 {
            let name = parts[0].trim_matches('"');
            let pid_str = parts[1].trim_matches('"');
            if let Ok(pid) = pid_str.parse::<u32>() {
                pid_name_map.insert(pid, name.to_string());
            }
        }
    }

    let mut result: Vec<PortProcessInfo> = Vec::new();
    let mut seen_ports = std::collections::HashSet::new();
    let mut tcp_ports = std::collections::HashSet::new();

    for (port, _, proto) in &port_pid_proto_list {
        if proto == "TCP" {
            tcp_ports.insert(*port);
        }
    }

    for (port, pid, proto) in &port_pid_proto_list {
        if seen_ports.contains(port) {
            if proto == "TCP" {
                if let Some(entry) = result.iter_mut().find(|e| e.port == *port) {
                    entry.protocol = "TCP".to_string();
                }
            }
            continue;
        }
        seen_ports.insert(*port);
        let process_name = pid_name_map
            .get(pid)
            .cloned()
            .unwrap_or_else(|| "unknown".to_string());
        result.push(PortProcessInfo {
            port: *port,
            pid: *pid,
            process_name,
            protocol: proto.clone(),
        });
    }

    result.sort_by_key(|info| info.port);
    Ok(result)
}
/// 房主启动 UDP 隧道
#[tauri::command]
pub async fn start_udp_host(state: State<'_, AppState>, local_port: u16) -> AppResult<()> {
    net_manager::stop_network(&state);
    {
        let mut port = state.local_game_port.lock();
        *port = local_port;
    }
    crate::udp_net_manager::start_udp_host(&state, local_port).map(|_| ())
}

/// 好友连接 UDP 隧道
#[tauri::command]
pub async fn start_udp_client(
    state: State<'_, AppState>,
    host_id_str: String,
    local_port: u16,
) -> AppResult<()> {
    net_manager::stop_network(&state);
    let host_id_u64 = host_id_str
        .parse::<u64>()
        .map_err(|_| AppError::Parse("Invalid Host ID".to_string()))?;
    let host_id = SteamId::from_raw(host_id_u64);
    let my_id = state.steam_client.user().steam_id();
    if host_id != my_id {
        crate::udp_net_manager::start_udp_client(&state, host_id, local_port).map(|_| ())
    } else {
        Err(AppError::Network(
            "Cannot connect to yourself. You are the host.".to_string(),
        ))
    }
}

/// 停止 UDP 隧道
#[tauri::command]
pub fn stop_udp_tunnel(state: State<'_, AppState>) {
    crate::udp_net_manager::stop_udp_tunnel(&state);
}
