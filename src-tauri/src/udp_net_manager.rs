use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use std::collections::HashSet;
use std::net::UdpSocket;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::sync::Mutex as StdMutex;
use std::thread;
use std::time::Duration;
use steamworks::{SendType, SteamId};
use tokio_util::sync::CancellationToken;

const UDP_CHANNEL: i32 = 1;
const MAX_PACKET_SIZE: usize = 65507;

pub struct UdpTunnel {
    cancel: CancellationToken,
}

impl UdpTunnel {
    pub fn start_host(state: &AppState, game_port: u16) -> AppResult<Self> {
        {
            let token = state.cancel_token.lock();
            token.cancel();
        }
        std::thread::sleep(Duration::from_millis(100));

        let cancel = CancellationToken::new();
        {
            let mut token = state.cancel_token.lock();
            *token = cancel.clone();
        }

        let udp_socket = UdpSocket::bind("127.0.0.1:0")
            .map_err(|e| AppError::Network(format!("UDP bind 失败: {}", e)))?;
        udp_socket.set_nonblocking(true)
            .map_err(|e| AppError::Network(format!("set_nonblocking 失败: {}", e)))?;

        let game_addr = format!("127.0.0.1:{}", game_port);
        let socket_recv = udp_socket.try_clone()
            .map_err(|e| AppError::Network(format!("try_clone 失败: {}", e)))?;

        let friend_ids: Arc<StdMutex<HashSet<SteamId>>> = Arc::new(StdMutex::new(HashSet::new()));

        // 线程1: P2P channel 1 → 本地游戏服务器
        let client = state.steam_client.clone();
        let bytes_received = state.bytes_received.clone();
        let cancel_p2p = cancel.clone();
        let socket_send = udp_socket;
        let game_addr_p2p = game_addr.clone();
        let friend_ids_p2p = friend_ids.clone();

        thread::spawn(move || {
            let networking = client.networking();
            let mut buf = [0u8; MAX_PACKET_SIZE];
            loop {
                if cancel_p2p.is_cancelled() {
                    break;
                }
                if let Some(_size) = networking.is_p2p_packet_available_on_channel(UDP_CHANNEL) {
                    if let Some((steam_id, n)) =
                        networking.read_p2p_packet_from_channel(&mut buf, UDP_CHANNEL)
                    {
                        networking.accept_p2p_session(steam_id);
                        bytes_received.fetch_add(n as u64, Ordering::Relaxed);
                        {
                            let mut fids = friend_ids_p2p.lock().unwrap();
                            fids.insert(steam_id);
                        }
                        let _ = socket_send.send_to(&buf[..n], &game_addr_p2p);
                    }
                } else {
                    thread::sleep(Duration::from_millis(1));
                }
            }
            log::info!("UDP 隧道 (host) P2P→本地 线程已停止");
        });

        // 线程2: 本地游戏服务器 → P2P channel 1
        let client2 = state.steam_client.clone();
        let bytes_sent = state.bytes_sent.clone();
        let cancel_local = cancel.clone();
        let friend_ids_local = friend_ids.clone();

        thread::spawn(move || {
            let networking = client2.networking();
            let mut buf = [0u8; MAX_PACKET_SIZE];
            loop {
                if cancel_local.is_cancelled() {
                    break;
                }
                match socket_recv.recv_from(&mut buf) {
                    Ok((n, _addr)) => {
                        let fids = friend_ids_local.lock().unwrap();
                        for &steam_id in fids.iter() {
                            networking.send_p2p_packet_on_channel(
                                steam_id,
                                SendType::Unreliable,
                                &buf[..n],
                                UDP_CHANNEL,
                            );
                        }
                        bytes_sent.fetch_add(n as u64, Ordering::Relaxed);
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(1));
                    }
                    Err(e) => {
                        log::error!("UDP recv 错误: {}", e);
                        thread::sleep(Duration::from_millis(10));
                    }
                }
            }
            log::info!("UDP 隧道 (host) 本地→P2P 线程已停止");
        });

        log::info!("UDP 隧道 (host) 已启动, 游戏端口: {}", game_port);
        Ok(UdpTunnel { cancel })
    }

    pub fn start_client(
        state: &AppState,
        host_id: SteamId,
        local_port: u16,
    ) -> AppResult<Self> {
        {
            let token = state.cancel_token.lock();
            token.cancel();
        }
        std::thread::sleep(Duration::from_millis(100));

        let cancel = CancellationToken::new();
        {
            let mut token = state.cancel_token.lock();
            *token = cancel.clone();
        }

        let bind_addr = format!("127.0.0.1:{}", local_port);
        let udp_socket = UdpSocket::bind(&bind_addr)
            .map_err(|e| AppError::Network(format!("UDP bind 失败: {}", e)))?;
        udp_socket.set_nonblocking(true)
            .map_err(|e| AppError::Network(format!("set_nonblocking 失败: {}", e)))?;

        let socket_recv = udp_socket.try_clone()
            .map_err(|e| AppError::Network(format!("try_clone 失败: {}", e)))?;

        let client_addr: Arc<StdMutex<Option<std::net::SocketAddr>>> =
            Arc::new(StdMutex::new(None));

        // 线程1: 本地游戏客户端 → P2P channel 1 → 房主
        let client = state.steam_client.clone();
        let bytes_sent = state.bytes_sent.clone();
        let cancel_send = cancel.clone();
        let client_addr_send = client_addr.clone();

        thread::spawn(move || {
            let networking = client.networking();
            let mut buf = [0u8; MAX_PACKET_SIZE];
            loop {
                if cancel_send.is_cancelled() {
                    break;
                }
                match socket_recv.recv_from(&mut buf) {
                    Ok((n, addr)) => {
                        {
                            let mut ca = client_addr_send.lock().unwrap();
                            *ca = Some(addr);
                        }
                        networking.send_p2p_packet_on_channel(
                            host_id,
                            SendType::Unreliable,
                            &buf[..n],
                            UDP_CHANNEL,
                        );
                        bytes_sent.fetch_add(n as u64, Ordering::Relaxed);
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(1));
                    }
                    Err(e) => {
                        log::error!("UDP recv 错误: {}", e);
                        thread::sleep(Duration::from_millis(10));
                    }
                }
            }
            log::info!("UDP 隧道 (client) 本地→P2P 线程已停止");
        });

        // 线程2: P2P channel 1 → 本地游戏客户端
        let client2 = state.steam_client.clone();
        let bytes_received = state.bytes_received.clone();
        let cancel_recv = cancel.clone();
        let client_addr_recv = client_addr.clone();

        thread::spawn(move || {
            let networking = client2.networking();
            let mut buf = [0u8; MAX_PACKET_SIZE];
            loop {
                if cancel_recv.is_cancelled() {
                    break;
                }
                if let Some(_size) = networking.is_p2p_packet_available_on_channel(UDP_CHANNEL) {
                    if let Some((_steam_id, n)) =
                        networking.read_p2p_packet_from_channel(&mut buf, UDP_CHANNEL)
                    {
                        bytes_received.fetch_add(n as u64, Ordering::Relaxed);
                        let addr = client_addr_recv.lock().unwrap();
                        if let Some(a) = *addr {
                            let _ = udp_socket.send_to(&buf[..n], a);
                        }
                    }
                } else {
                    thread::sleep(Duration::from_millis(1));
                }
            }
            log::info!("UDP 隧道 (client) P2P→本地 线程已停止");
        });

        log::info!(
            "UDP 隧道 (client) 已启动, 本地端口: {}, 房主: {:?}",
            local_port,
            host_id
        );
        Ok(UdpTunnel { cancel })
    }

    pub fn stop(&self) {
        self.cancel.cancel();
        log::info!("UDP 隧道已停止");
    }
}

pub fn start_udp_host(state: &AppState, game_port: u16) -> AppResult<UdpTunnel> {
    UdpTunnel::start_host(state, game_port)
}

pub fn start_udp_client(
    state: &AppState,
    host_id: SteamId,
    local_port: u16,
) -> AppResult<UdpTunnel> {
    UdpTunnel::start_client(state, host_id, local_port)
}

pub fn stop_udp_tunnel(state: &AppState) {
    let token = state.cancel_token.lock().clone();
    token.cancel();
    state.bytes_sent.store(0, Ordering::Relaxed);
    state.bytes_received.store(0, Ordering::Relaxed);
}