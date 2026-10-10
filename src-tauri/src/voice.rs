use crate::app_state::{AppState, TunnelState};
use crate::error::{AppError, AppResult};
use steamworks::SendType;
use tauri::{Emitter, State};
use std::sync::atomic::{AtomicU32, Ordering};
use std::thread;

const VOICE_CHANNEL: i32 = 3;

static VOICE_SEQ: AtomicU32 = AtomicU32::new(0);

#[derive(serde::Serialize, Clone)]
pub struct VoiceUser {
    pub id: String,
    pub name: String,
    pub speaking: bool,
}

#[tauri::command]
pub fn send_voice_data(
    state: State<'_, AppState>,
    data: Vec<u8>,
) -> AppResult<()> {
    if !state.voice_active.load(Ordering::Relaxed) {
        return Ok(());
    }

    let tunnel_state = *state.state.lock();
    let lobby_id = match tunnel_state {
        TunnelState::Hosting(id) => id,
        TunnelState::Joined(id) => id,
        TunnelState::Idle => return Ok(()),
    };

    let matchmaking = state.steam_client.matchmaking();
    let members = matchmaking.lobby_members(lobby_id);
    let my_id = state.steam_client.user().steam_id();
    let networking = state.steam_client.networking();

    let seq = VOICE_SEQ.fetch_add(1, Ordering::Relaxed);
    let mut packet = Vec::with_capacity(4 + data.len());
    packet.extend_from_slice(&seq.to_le_bytes());
    packet.extend_from_slice(&data);

    for member in &members {
        if *member != my_id {
            networking.send_p2p_packet_on_channel(*member, SendType::Unreliable, &packet, VOICE_CHANNEL);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn join_voice(state: State<'_, AppState>) -> AppResult<()> {
    state.voice_active.store(true, Ordering::Relaxed);
    let my_id = state.steam_client.user().steam_id();
    let lobby_id = match *state.state.lock() {
        TunnelState::Hosting(id) => id,
        TunnelState::Joined(id) => id,
        TunnelState::Idle => return Err(AppError::Lobby("不在大厅中".to_string())),
    };
    state.steam_client.matchmaking().set_lobby_data(
        lobby_id,
        &format!("voice_{}", my_id.raw()),
        "1",
    );
    log::info!("语音频道已加入");
    Ok(())
}

#[tauri::command]
pub fn leave_voice(state: State<'_, AppState>) -> AppResult<()> {
    state.voice_active.store(false, Ordering::Relaxed);
    let my_id = state.steam_client.user().steam_id();
    let lobby_id = match *state.state.lock() {
        TunnelState::Hosting(id) => id,
        TunnelState::Joined(id) => id,
        TunnelState::Idle => return Ok(()),
    };
    state.steam_client.matchmaking().delete_lobby_data(lobby_id, &format!("voice_{}", my_id.raw()));
    log::info!("语音频道已离开");
    Ok(())
}

#[tauri::command]
pub fn is_voice_active(state: State<'_, AppState>) -> bool {
    state.voice_active.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn get_voice_users(state: State<'_, AppState>) -> Vec<VoiceUser> {
    let tunnel_state = *state.state.lock();
    let lobby_id = match tunnel_state {
        TunnelState::Hosting(id) => id,
        TunnelState::Joined(id) => id,
        TunnelState::Idle => return Vec::new(),
    };

    let matchmaking = state.steam_client.matchmaking();
    let members = matchmaking.lobby_members(lobby_id);
    let friends = state.steam_client.friends();
    let my_id = state.steam_client.user().steam_id();

    members
        .into_iter()
        .filter_map(|m| {
            let key = format!("voice_{}", m.raw());
            if matchmaking.lobby_data(lobby_id, &key).as_deref() == Some("1") {
                let name = if m == my_id { "我".to_string() } else { friends.get_friend(m).name() };
                Some(VoiceUser {
                    id: m.raw().to_string(),
                    name,
                    speaking: m == my_id && state.voice_active.load(Ordering::Relaxed),
                })
            } else {
                None
            }
        })
        .collect()
}

pub fn start_voice_receiver(app_handle: tauri::AppHandle, client: steamworks::Client) {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    let last_speak: Arc<Mutex<HashMap<u64, Instant>>> = Arc::new(Mutex::new(HashMap::new()));

    thread::spawn(move || {
        let networking = client.networking();
        let mut buf = [0u8; 1200];
        log::info!("[VOICE_RECV] 语音接收线程已启动，监听 channel {}", VOICE_CHANNEL);
        loop {
            if let Some(_size) = networking.is_p2p_packet_available_on_channel(VOICE_CHANNEL) {
                if let Some((steam_id, n)) = networking.read_p2p_packet_from_channel(&mut buf, VOICE_CHANNEL) {
                    networking.accept_p2p_session(steam_id);
                    if n == 0 { continue; }

                    let id_raw = steam_id.raw();
                    {
                        let mut map = last_speak.lock().unwrap();
                        map.insert(id_raw, Instant::now());
                        map.retain(|_, t| t.elapsed() < Duration::from_millis(500));
                    }

                    let _ = app_handle.emit("voice-data", serde_json::json!({
                        "sender_id": id_raw.to_string(),
                        "data": buf[..n].to_vec(),
                    }));
                }
            } else {
                std::thread::sleep(Duration::from_millis(1));
            }
        }
    });
}