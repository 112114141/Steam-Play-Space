use crate::app_state::{AppState, TunnelState};
use crate::error::{AppError, AppResult};
use steamworks::SendType;
use tauri::{Emitter, State};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;
use std::thread;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

const FILE_CHANNEL: i32 = 2;
const CHUNK_SIZE: usize = 1100;

const MSG_FILE_META: u8 = 1;
const MSG_FILE_CHUNK: u8 = 2;
const MSG_FILE_COMPLETE: u8 = 3;
const MSG_FILE_CANCEL: u8 = 4;

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

fn build_chunk(file_id: u32, offset: u64, data: &[u8]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(1 + 4 + 8 + data.len());
    buf.push(MSG_FILE_CHUNK);
    buf.extend_from_slice(&file_id.to_le_bytes());
    buf.extend_from_slice(&offset.to_le_bytes());
    buf.extend_from_slice(data);
    buf
}

fn build_complete(file_id: u32) -> Vec<u8> {
    let mut buf = Vec::with_capacity(5);
    buf.push(MSG_FILE_COMPLETE);
    buf.extend_from_slice(&file_id.to_le_bytes());
    buf
}

fn build_cancel(file_id: u32) -> Vec<u8> {
    let mut buf = Vec::with_capacity(5);
    buf.push(MSG_FILE_CANCEL);
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
    let file_name = PathBuf::from(&file_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or("unknown".to_string());

    let file_size = fs::metadata(&file_path)
        .map_err(|e| AppError::Internal(format!("读取文件信息失败: {}", e)))?
        .len();

    let mime_type = guess_mime(&file_name);

    let tunnel_state = *state.state.lock();
    let lobby_id = match tunnel_state {
        TunnelState::Hosting(id) => id,
        TunnelState::Joined(id) => id,
        TunnelState::Idle => return Err(AppError::Lobby("不在大厅中".to_string())),
    };

    let matchmaking = state.steam_client.matchmaking();
    let members = matchmaking.lobby_members(lobby_id);
    let my_id = state.steam_client.user().steam_id();

    if members.len() <= 1 {
        return Err(AppError::Lobby("房间内没有其他成员".to_string()));
    }

    let file_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| (d.as_millis() as u32) ^ 0x55555555)
        .unwrap_or(1);

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut cancels = state.file_cancels.lock();
        cancels.insert(file_id, cancel_flag.clone());
    }

    let networking = state.steam_client.networking();
    let meta = build_meta(file_id, &file_name, file_size, &mime_type);
    log::info!("[FILE_SEND] 发送 META: file_id={}, name={}, size={}, mime={}, meta_len={}, members={}", file_id, file_name, file_size, mime_type, meta.len(), members.len());
    for member in &members {
        if *member != my_id {
            networking.send_p2p_packet_on_channel(*member, SendType::Reliable, &meta, FILE_CHANNEL);
        }
    }

    let app_handle_clone = app_handle.clone();
    let members_clone: Vec<_> = members.iter().filter(|m| **m != my_id).cloned().collect();
    let client = state.steam_client.clone();
    let file_name_clone = file_name.clone();
    let mime_type_clone = mime_type.clone();
    let file_cancels = state.file_cancels.clone();
    let voice_active = state.voice_active.clone();

    thread::spawn(move || {
        let networking = client.networking();
        let mut file = match File::open(&file_path) {
            Ok(f) => f,
            Err(e) => {
                log::error!("打开文件失败: {}", e);
                let _ = app_handle_clone.emit("file-error", serde_json::json!({
                    "file_id": file_id,
                    "file_name": &file_name_clone,
                    "error": format!("打开文件失败: {}", e),
                }));
                file_cancels.lock().remove(&file_id);
                return;
            }
        };

        let mut offset: u64 = 0;
        let mut buf = vec![0u8; CHUNK_SIZE];
        let start_time = Instant::now();

        while offset < file_size {
            if cancel_flag.load(Ordering::Relaxed) {
                let cancel = build_cancel(file_id);
                for member in &members_clone {
                    networking.send_p2p_packet_on_channel(*member, SendType::Reliable, &cancel, FILE_CHANNEL);
                }
                let _ = app_handle_clone.emit("file-cancelled", serde_json::json!({
                    "file_id": file_id,
                    "file_name": &file_name_clone,
                }));
                file_cancels.lock().remove(&file_id);
                return;
            }

            let n = match file.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => n,
                Err(e) => {
                    log::error!("读取文件失败: {}", e);
                    let _ = app_handle_clone.emit("file-error", serde_json::json!({
                        "file_id": file_id,
                        "file_name": &file_name_clone,
                        "error": format!("读取文件失败: {}", e),
                    }));
                    file_cancels.lock().remove(&file_id);
                    return;
                }
            };

            let chunk = build_chunk(file_id, offset, &buf[..n]);
            for member in &members_clone {
                networking.send_p2p_packet_on_channel(*member, SendType::Reliable, &chunk, FILE_CHANNEL);
            }

            offset += n as u64;

            let elapsed = start_time.elapsed().as_secs_f64();
            let progress = if file_size > 0 {
                (offset as f64 / file_size as f64 * 100.0) as u8
            } else {
                100
            };
            let speed = if elapsed > 0.0 { offset as f64 / elapsed } else { 0.0 };
            let time_left = if speed > 0.0 { (file_size - offset) as f64 / speed } else { 0.0 };

            let _ = app_handle_clone.emit("file-progress", serde_json::json!({
                "file_id": file_id,
                "progress": progress,
                "file_name": &file_name_clone,
                "direction": "send",
                "speed": speed,
                "time_left": time_left,
            }));

            thread::sleep(if voice_active.load(Ordering::Relaxed) {
                Duration::from_millis(5)
            } else {
                Duration::from_millis(1)
            });
        }

        let complete = build_complete(file_id);
        for member in &members_clone {
            networking.send_p2p_packet_on_channel(*member, SendType::Reliable, &complete, FILE_CHANNEL);
        }

        let my_id = client.user().steam_id();
        let my_name = client.friends().get_friend(my_id).name();
        let is_img = is_image_mime(&mime_type_clone);
        let _ = app_handle_clone.emit("chat-file", FileMessage {
            file_id,
            file_name: file_name_clone,
            file_size,
            mime_type: mime_type_clone,
            sender_id: my_id.raw().to_string(),
            sender_name: my_name,
            is_image: is_img,
            timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
            saved_path: file_path,
        });
        file_cancels.lock().remove(&file_id);
    });

    Ok(())
}

#[tauri::command]
pub async fn cancel_file_transfer(state: State<'_, AppState>, file_id: u32) -> AppResult<()> {
    let mut cancels = state.file_cancels.lock();
    if let Some(flag) = cancels.get(&file_id) {
        flag.store(true, Ordering::Relaxed);
    }
    cancels.remove(&file_id);
    Ok(())
}

#[tauri::command]
pub async fn set_file_save_path(state: State<'_, AppState>, path: String) -> AppResult<()> {
    let mut p = state.file_save_path.lock();
    *p = path;
    Ok(())
}

#[tauri::command]
pub async fn get_file_save_path(state: State<'_, AppState>) -> AppResult<String> {
    let p = state.file_save_path.lock();
    Ok(p.clone())
}

pub fn start_file_receiver(
    app_handle: tauri::AppHandle,
    client: steamworks::Client,
    file_save_path: Arc<Mutex<String>>,
) {
    struct RecvFile {
        name: String,
        size: u64,
        mime: String,
        sender_id: String,
        sender_name: String,
        file: Option<File>,
        save_path: String,
        bytes_received: u64,
        start_time: Instant,
    }

    let receiving: Arc<Mutex<HashMap<u32, RecvFile>>> = Arc::new(Mutex::new(HashMap::new()));

    thread::spawn(move || {
        let networking = client.networking();
        let mut buf = [0u8; 1200];
        log::info!("[FILE_RECV] 文件接收线程已启动，监听 channel {}", FILE_CHANNEL);
        loop {
            if let Some(size) = networking.is_p2p_packet_available_on_channel(FILE_CHANNEL) {
                if let Some((steam_id, n)) =
                    networking.read_p2p_packet_from_channel(&mut buf, FILE_CHANNEL)
                {
                    networking.accept_p2p_session(steam_id);
                    if n == 0 {
                        continue;
                    }
                    let data = &buf[..n];
                    let msg_type = data[0];
                    log::info!("[FILE_RECV] 收到包: from={}, size={}, msg_type={}, data_len={}", steam_id.raw(), size, msg_type, data.len());

                    match msg_type {
                        1 if data.len() >= 7 => {
                            log::info!("[FILE_RECV] 处理 META 消息, data_len={}", data.len());
                            let file_id = u32::from_le_bytes([data[1], data[2], data[3], data[4]]);
                            let name_len = u16::from_le_bytes([data[5], data[6]]) as usize;
                            if data.len() < 7 + name_len + 10 {
                                continue;
                            }
                            let file_name =
                                String::from_utf8_lossy(&data[7..7 + name_len]).to_string();
                            let off = 7 + name_len;
                            let file_size = u64::from_le_bytes([
                                data[off],
                                data[off + 1],
                                data[off + 2],
                                data[off + 3],
                                data[off + 4],
                                data[off + 5],
                                data[off + 6],
                                data[off + 7],
                            ]);
                            let mime_len =
                                u16::from_le_bytes([data[off + 8], data[off + 9]]) as usize;
                            if data.len() < off + 10 + mime_len {
                                continue;
                            }
                            let mime_type =
                                String::from_utf8_lossy(&data[off + 10..off + 10 + mime_len])
                                    .to_string();

                            let sender_name = client.friends().get_friend(steam_id).name();

                            let save_dir = {
                                let path = file_save_path.lock();
                                if path.is_empty() {
                                    dirs::desktop_dir().unwrap_or_else(|| PathBuf::from("."))
                                } else {
                                    PathBuf::from(path.as_str())
                                }
                            };
                            let _ = fs::create_dir_all(&save_dir);
                            let saved_path = save_dir.join(&file_name);
                            let saved_path = if saved_path.exists() {
                                let stem = PathBuf::from(&file_name)
                                    .file_stem()
                                    .map(|s| s.to_string_lossy().to_string())
                                    .unwrap_or("file".to_string());
                                let ext = PathBuf::from(&file_name)
                                    .extension()
                                    .map(|s| s.to_string_lossy().to_string())
                                    .unwrap_or_default();
                                let base = if ext.is_empty() {
                                    format!("{}_{}", stem, file_id)
                                } else {
                                    format!("{}_{}.{}", stem, file_id, ext)
                                };
                                save_dir.join(base)
                            } else {
                                saved_path
                            };

                            let file = OpenOptions::new()
                                .write(true)
                                .create(true)
                                .truncate(true)
                                .open(&saved_path)
                                .ok();

                            if file.is_none() {
                                let _ = app_handle.emit("file-error", serde_json::json!({
                                    "file_id": file_id,
                                    "file_name": &file_name,
                                    "error": "无法创建保存文件",
                                }));
                                continue;
                            }

                            let saved_str = saved_path.to_string_lossy().to_string();

                            let mut map = receiving.lock();
                            map.insert(
                                file_id,
                                RecvFile {
                                    name: file_name,
                                    size: file_size,
                                    mime: mime_type,
                                    sender_id: steam_id.raw().to_string(),
                                    sender_name,
                                    file,
                                    save_path: saved_str,
                                    bytes_received: 0,
                                    start_time: Instant::now(),
                                },
                            );
                        }
                        2 if data.len() >= 13 => {
                            let file_id =
                                u32::from_le_bytes([data[1], data[2], data[3], data[4]]);
                            let offset = u64::from_le_bytes([
                                data[5],
                                data[6],
                                data[7],
                                data[8],
                                data[9],
                                data[10],
                                data[11],
                                data[12],
                            ]);
                            let chunk_data = &data[13..];

                            let mut map = receiving.lock();
                            if let Some(file) = map.get_mut(&file_id) {
                                if let Some(ref mut f) = file.file {
                                    let _ = f.seek(SeekFrom::Start(offset));
                                    let _ = f.write_all(chunk_data);
                                }
                                file.bytes_received = offset + chunk_data.len() as u64;

                                let elapsed = file.start_time.elapsed().as_secs_f64();
                                let progress = if file.size > 0 {
                                    (file.bytes_received as f64 / file.size as f64 * 100.0) as u8
                                } else {
                                    100
                                };
                                let speed = if elapsed > 0.0 {
                                    file.bytes_received as f64 / elapsed
                                } else {
                                    0.0
                                };
                                let time_left = if speed > 0.0 && file.size > file.bytes_received {
                                    (file.size - file.bytes_received) as f64 / speed
                                } else {
                                    0.0
                                };

                                let _ = app_handle.emit(
                                    "file-progress",
                                    serde_json::json!({
                                        "file_id": file_id,
                                        "progress": progress,
                                        "file_name": &file.name,
                                        "direction": "recv",
                                        "speed": speed,
                                        "time_left": time_left,
                                    }),
                                );
                            }
                        }
                        3 if data.len() >= 5 => {
                            let file_id =
                                u32::from_le_bytes([data[1], data[2], data[3], data[4]]);
                            let mut map = receiving.lock();
                            if let Some(file) = map.remove(&file_id) {
                                drop(file.file);

                                if file.bytes_received != file.size && file.size > 0 {
                                    let _ = app_handle.emit("file-error", serde_json::json!({
                                        "file_id": file_id,
                                        "file_name": &file.name,
                                        "error": format!(
                                            "文件大小不匹配: 期望{}字节, 实际{}字节",
                                            file.size, file.bytes_received
                                        ),
                                    }));
                                } else {
                                    let _ = app_handle.emit(
                                        "chat-file",
                                        FileMessage {
                                            file_id,
                                            file_name: file.name,
                                            file_size: file.size,
                                            mime_type: file.mime.clone(),
                                            sender_id: file.sender_id,
                                            sender_name: file.sender_name,
                                            is_image: is_image_mime(&file.mime),
                                            timestamp: chrono::Local::now()
                                                .format("%H:%M:%S")
                                                .to_string(),
                                            saved_path: file.save_path,
                                        },
                                    );
                                }
                            }
                        }
                        4 if data.len() >= 5 => {
                            let file_id =
                                u32::from_le_bytes([data[1], data[2], data[3], data[4]]);
                            let mut map = receiving.lock();
                            if let Some(file) = map.remove(&file_id) {
                                drop(file.file);
                                let _ = fs::remove_file(&file.save_path);
                                let _ = app_handle.emit(
                                    "file-cancelled",
                                    serde_json::json!({
                                        "file_id": file_id,
                                        "file_name": file.name,
                                    }),
                                );
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