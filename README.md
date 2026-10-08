# 🎮 Steam Play Space

> 🌐 基于 Steam P2P 网络的局域网联机工具 | A LAN tunneling tool built on Steam P2P networking
>
> 让所有支持 LAN 模式的 Steam 游戏轻松联机，不用开服务器，不用折腾端口转发。
> Play any Steam game with LAN mode online — no dedicated server, no port forwarding headaches.

---

## 📖 简介 | Introduction

你和好友都装了 Steam，但游戏只支持局域网联机？没路由器权限做端口转发？朋友在另一个城市？

**Steam Play Space** 利用 Steam 自带的 P2P 网络（SDR 中继）帮你建一条隧道，把游戏的局域网流量从 Steam 网络上走过去。支持 **TCP 和 UDP** 两种协议，自动识别或手动切换。对你和好友来说，就像坐在同一个网吧里。

You and your friends all have Steam, but the game only supports LAN multiplayer? No router access for port forwarding? Friend in another city?

**Steam Play Space** uses Steam's built-in P2P networking (SDR relay) to tunnel LAN traffic over the Steam network. It supports both **TCP and UDP** protocols with automatic or manual switching. It's like you're all in the same cybercafe.

---

## ✨ 功能特性 | Features

| 功能 | 说明 |
|------|------|
| 🎮 **一键联机** | 利用 Steam P2P 网络（SDR 中继）建立隧道，自动 NAT 穿透 |
| 📡 **端口自动探测** | 扫描本地监听端口 + 进程名识别，支持搜索过滤 |
| 🔍 **自动检测** | 开启后游戏内开 LAN 即自动填入端口号，省心 |
| 🔀 **TCP/UDP 双协议** | 支持 TCP 和 UDP 两种隧道，协议自动切换或手动选择 |
| 👥 **好友列表** | 查看在线好友，一键加入好友房间或发送邀请 |
| 📊 **流量可视化** | 实时显示隧道上行 / 下行流量和延迟 |
| 🔄 **断线自动重连** | P2P 连接断了？自动重连，不用手动操心 |
| ⚙️ **设置面板** | 端口轮询开关、退出最小化到托盘、协议自动切换 |
| 💬 **内置聊天** | 房间内好友实时聊天，不用切窗口 |

---

## 🚀 使用方法 | Quick Start

### 📋 准备工作 | Prerequisites

1. 你和好友都需安装并登录 **Steam 客户端** | Install and log in to **Steam**
2. 在 Steam 上互加好友 | Add each other as Steam friends
3. 下载并安装 Steam Play Space | Download and install Steam Play Space

### 🏠 房主操作 | Host

1. 启动 Steam Play Space
2. 在游戏中开启局域网联机（如 Minecraft「对局域网开放」）
3. 端口自动检测或手动输入游戏端口号
4. 点击「创建房间」
5. 复制房间 ID 发给好友

### 🚪 好友操作 | Join

1. 启动 Steam Play Space
2. 粘贴房间 ID，点击「加入房间」
3. 在游戏中连接 `127.0.0.1:端口号`

### 👥 好友列表加入 | Join via Friend List

- 点击顶部「好友」按钮查看在线好友
- 好友开了房间时显示绿色加入按钮，一键加入

---

## 🎯 支持的游戏 | Supported Games

任何支持局域网（LAN）联机的游戏均可使用，**TCP 和 UDP 协议都支持**：

| 游戏 | 默认端口 | 协议 |
|------|----------|------|
| Minecraft Java版 | 25565 | TCP |
| Terraria | 7777 | TCP |
| Project Zomboid | 16261 | TCP |
| Starbound | 21025 | TCP |
| OpenTTD | 3979 | UDP |
| RimWorld (联机Mod) | 25555 | TCP |
| Valheim | 2456 | UDP |
| L4D2 (Left 4 Dead 2) | 27015 | UDP |
| 幻兽帕鲁 (Palworld) | 8211 | UDP |
| Don't Starve Together | 10999 | UDP |

> 💡 **协议自动切换**：默认开启，选中端口时自动判断 TCP/UDP。也可在设置中关闭后手动选择。

---

## 🛠️ 技术栈 | Tech Stack

| 层 | 技术 |
|----|------|
| 后端 | Rust + Tauri v2 + Steamworks SDK |
| 前端 | React 19 + TypeScript + Vite 7 + TailwindCSS |
| P2P | Steam Datagram Relay (SDR) 中继 |
| App ID | 480 (Spacewar，Valve 官方测试应用) |

---

## 🔧 开发指南 | Development

### 环境要求 | Requirements

- Rust (nightly)
- Node.js 18+
- Visual Studio Build Tools (MSVC)
- Steam 客户端

### 本地运行 | Local Run

```bash
# 安装前端依赖
npm install

# 开发模式
npx tauri dev

# 构建安装包
npx tauri build
```

### 项目结构 | Project Structure

```
Steam-Play-Space/
├── src/                # 前端 (React + TS)
├── src-tauri/          # 后端 (Rust + Tauri)
│   └── src/
│       ├── main.rs              # 入口
│       ├── app_state.rs         # 状态管理
│       ├── net_manager.rs       # TCP P2P 隧道核心
│       ├── udp_net_manager.rs   # UDP P2P 隧道核心
│       └── steam_commands.rs    # Tauri 命令
├── steamworks-rs/      # Steamworks SDK 绑定 (本地依赖)
└── package.json
```

---

## ⚖️ 免责声明 | Disclaimer

- 本软件基于 Steamworks SDK 合法调用，不涉及破解或 DRM 规避
- 使用 App ID 480 (Spacewar) 是 Valve 官方提供的测试方式
- 用户需自行确保使用行为符合 Steam 服务条款和游戏 EULA
- Steam® 是 Valve Corporation 的商标，本软件未经 Valve 授权或认可
- 仅供个人和非商业用途

---

## 📄 许可证 | License

[MIT License](./LICENSE)

---

<div align="center">

**Made by 112114141** 🛠️

如果觉得有用，给个 ⭐ Star 吧！

</div>
