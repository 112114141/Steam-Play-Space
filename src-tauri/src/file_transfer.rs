use crate::app_state::{AppState, TunnelState};
use crate::error::{AppError, AppResult};
use steamworks::SendType;
use tauri::{Emitter, State};
use std::fs;
use std::path::PathBuf;
use std::thread;

const FILE_CHANNEL: i32 = 2;
const CHUNK_SIZE: usize = 60 * 1024;

const MSG_FILE_META: u8 = 1;
const MSG_FILE_CHUNK: u8 = 2;
const MSG_FILE_COMPLETE: u8 = 3;

fn build_meta(file_id: u32, name: &str, size: u64, mime: &str) -> Vec<u8> {
    let name_bytes = name.as_bytes();
    let mime_bytes = mime.as_bytes();
    let mut buf = Vec::with_capacity(1 + 4 + 2 + name_bytes.len() + 8 + 2 + mime_bytes.len());
    buf.push(MSG_FILE_META);
    buf.extend_from_slice(&file_id.to_le_bytes());
    buf.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
    buf.extend_from_slice(name_bytes);
    buf.extend_from_slice(&size.to_le_bytes());
    buf.extend_from_slice(&(mime_bytes.len() as u16).to_le_bytes());
    buf.extend_from_slice(mime_bytes);
    buf
}

fn build_chunk(file_id: u32, idx: u32, data: &[u8]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(1 + 4 + 4 + data.len());
    buf.push(MSG_FILE_CHUNK);
    buf.extend_from_slice(&file_id.to_le_bytes());
    buf.extend_from_slice(&idx.to_le_bytes());
    buf.extend_from_slice(data);
    buf
}

fn build_complete(file_id: u32) -> Vec<u8> {
    let mut buf = Vec::with_capacity(5);
    buf.push(MSG_FILE_COMPLETE);
    buf.extend_from_slice(&file_id.to_le_bytes());
    buf
}

fn guess_mime(name: &str) -> String {
    let ext = PathBuf::from(name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "png" => "image/png".to_string(),
        "jpg" | "jpeg" => "image/jpeg".to_string(),
        "gif" => "image/gif".to_string(),
        "bmp" => "image/bmp".to_string(),
        "webp" => "image/webp".to_string(),
        "svg" => "image/svg+xml".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

fn is_image_mime(mime: &str) -> bool {
    mime.starts_with("image/")
}

#[derive(serde::Serialize, Clone)]
pub struct FileMessage {
    pub file_id: u32,
    pub file_name: String,
    pub file_size: u64,
    pub mime_type: String,
    pub sender_id: String,
    pub sender_name: String,
    pub is_image: bool,
    pub timestamp: String,
    pub saved_path: String,
}

#[tauri::command]
pub async fn send_file_to_lobby(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    file_path: String,
) -> AppResult<()> {
    let file_data = fs::read(&file_path).map_err(|e| AppError::Internal(format!("读取文件失败: {}", e)))?;
    let file_name = PathBuf::from(&file_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or("unknown".to_string());
    let mime_type = guess_mime(&file_name);
    let file_size = file_data.len() as u64;

    let tunnel_state = *state.state.lock();
    let lobby_id = match tunnel_state {
        TunnelState::Hosting(id) => id,
        TunnelState::Joined(id) => id,
        TunnelState::Idle => return Err(AppError::Lobby("不在大厅中".to_string())),
    };

    let matchmaking = state.steam_client.matchmaking();
    let members = matchmaking.lobby_members(lobby_id);
    let my_id = state.steam_client.user().steam_id();
    let networking = state.steam_client.networking();

    if members.len() <= 1 {
        return Err(AppError::Lobby("房间内没有其他成员".to_string()));
    }

    let file_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| (d.as_millis() as u32) ^ 0x55555555)
        .unwrap_or(1);

    let meta = build_meta(file_id, &file_name, file_size, &mime_type);
    for member in &members {
        if *member != my_id {
            networking.send_p2p_packet_on_channel(*member, SendType::Reliable, &meta, FILE_CHANNEL);
        }
    }

    let total_chunks = (file_data.len() + CHUNK_SIZE - 1) / CHUNK_SIZE.max(1);
    for chunk_idx in 0..total_chunks {
        let start = chunk_idx * CHUNK_SIZE;
        let end = std::cmp::min(start + CHUNK_SIZE, file_data.len());
        let chunk = build_chunk(file_id, chunk_idx as u32, &file_data[start..end]);
        for member in &members {
            if *member != my_id {
                networking.send_p2p_packet_on_channel(*member, SendType::Reliable, &chunk, FILE_CHANNEL);
            }
        }
        let progress = ((chunk_idx + 1) as f64 / total_chunks as f64 * 100.0) as u8;
        let _ = app_handle.emit("file-progress", serde_json::json!({
            "file_id": file_id,
            "progress": progress,
            "file_name": &file_name,
            "direction": "send",
        }));
    }

    let complete = build_complete(file_id);
    for member in &members {
        if *member != my_id {
            networking.send_p2p_packet_on_channel(*member, SendType::Reliable, &complete, FILE_CHANNEL);
        }
    }

    let my_name = state.steam_client.friends().get_friend(my_id).name();
    let _ = app_handle.emit("chat-file", FileMessage {
        file_id,
        file_name,
        file_size,
        mime_type: mime_type.clone(),
        sender_id: my_id.raw().to_string(),
        sender_name: my_name,
        is_image: is_image_mime(&mime_type),
        timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
        saved_path: file_path,
    });

    Ok(())
}

pub fn start_file_receiver(app_handle: tauri::AppHandle, client: steamworks::Client) {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    struct RecvFile {
        name: String,
        size: u64,
        mime: String,
        data: Vec<u8>,
        sender_id: String,
        sender_name: String,
    }

    let receiving: Arc<Mutex<HashMap<u32, RecvFile>>> = Arc::new(Mutex::new(HashMap::new()));

    thread::spawn(move || {
        let networking = client.networking();
        let mut buf = [0u8; 120 * 1024];
        loop {
            if let Some(_size) = networking.is_p2p_packet_available_on_channel(FILE_CHANNEL) {
                if let Some((steam_id, n)) = networking.read_p2p_packet_from_channel(&mut buf, FILE_CHANNEL) {
                    networking.accept_p2p_session(steam_id);
                    if n == 0 { continue; }
                    let data = &buf[..n];
                    let msg_type = data[0];

                    match msg_type {
                        1 if data.len() >= 7 => {
                            let file_id = u32::from_le_bytes([data[1], data[2], data[3], data[4]]);
                            let name_len = u16::from_le_bytes([data[5], data[6]]) as usize;
                            if data.len() < 7 + name_len + 10 { continue; }
                            let file_name = String::from_utf8_lossy(&data[7..7 + name_len]).to_string();
                            let off = 7 + name_len;
                            let file_size = u64::from_le_bytes([
                                data[off], data[off+1], data[off+2], data[off+3],
                                data[off+4], data[off+5], data[off+6], data[off+7],
                            ]);
                            let mime_len = u16::from_le_bytes([data[off+8], data[off+9]]) as usize;
                            if data.len() < off + 10 + mime_len { continue; }
                            let mime_type = String::from_utf8_lossy(&data[off+10..off+10+mime_len]).to_string();

                            let sender_name = client.friends().get_friend(steam_id).name();
                            let mut map = receiving.lock().unwrap();
                            map.insert(file_id, RecvFile {
                                name: file_name,
                                size: file_size,
                                mime: mime_type,
                                data: Vec::with_capacity(file_size as usize),
                                sender_id: steam_id.raw().to_string(),
                                sender_name,
                            });
                        }
                        2 if data.len() >= 9 => {
                            let file_id = u32::from_le_bytes([data[1], data[2], data[3], data[4]]);
                            let mut map = receiving.lock().unwrap();
                            if let Some(file) = map.get_mut(&file_id) {
                                file.data.extend_from_slice(&data[9..]);
                                let progress = if file.size > 0 {
                                    (file.data.len() as f64 / file.size as f64 * 100.0) as u8
                                } else { 100 };
                                let _ = app_handle.emit("file-progress", serde_json::json!({
                                    "file_id": file_id,
                                    "progress": progress,
                                    "file_name": &file.name,
                                    "direction": "recv",
                                }));
                            }
                        }
                        3 if data.len() >= 5 => {
                            let file_id = u32::from_le_bytes([data[1], data[2], data[3], data[4]]);
                            let mut map = receiving.lock().unwrap();
                            if let Some(file) = map.remove(&file_id) {
                                let download_dir = dirs::download_dir()
                                    .unwrap_or_else(|| PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".to_string())))
                                    .join("SteamPlaySpace");
                                let _ = fs::create_dir_all(&download_dir);
                                let saved_path = download_dir.join(&file.name);
                                let saved_path = if saved_path.exists() {
                                    let stem = PathBuf::from(&file.name).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or("file".to_string());
                                    let ext = PathBuf::from(&file.name).extension().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
                                    let base = if ext.is_empty() { format!("{}_{}", stem, file_id) } else { format!("{}_{}.{}", stem, file_id, ext) };
                                    download_dir.join(base)
                                } else {
                                    saved_path
                                };
                                let _ = fs::write(&saved_path, &file.data);
                                let saved_str = saved_path.to_string_lossy().to_string();
                                let _ = app_handle.emit("chat-file", FileMessage {
                                    file_id,
                                    file_name: file.name,
                                    file_size: file.size,
                                    mime_type: file.mime.clone(),
                                    sender_id: file.sender_id,
                                    sender_name: file.sender_name,
                                    is_image: is_image_mime(&file.mime),
                                    timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
                                    saved_path: saved_str,
                                });
                            }
                        }
                        _ => {}
                    }
                }
            } else {
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
        }
    });
}