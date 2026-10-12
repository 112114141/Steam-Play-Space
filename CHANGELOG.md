# 更新日志 | Changelog

## v2.3.5

### 修复
- **语音一直传输不停顿**：去掉 VAD 静音检测，语音数据持续发送，仅说话时显示绿框指示（RMS > 0.01）
- **托盘右键菜单位置偏上**：内容改为底部对齐（items-end），紧贴托盘图标上方
- **托盘菜单宽度裁剪**：popup_w 220→240，内容 230px 不再被裁剪
- **托盘添加好友不打开好友界面**：通过 eval 直接调用 window.__openFriends()，三重保险（localStorage + emit + eval）
- **localStorage 拋留**：listen 回调中清除 localStorage，避免刷新后误开好友面板
- **RMS 计算边界防护**：sampleCount 为 0 时跳过计算，避免 NaN

### 改进
- **通话成员显示**：自己显示"名字（我）"而非仅"我"
- **端口范围验证**：输入框 1-65535 范围校验，无效时红框提示，创建/加入房间前拦截
- **端口冲突明确报错**：TCP/UDP 客户端 bind 前预检查，失败返回"端口 X 已被占用"
- **过滤系统端口**：扫描结果过滤 port < 1024 的系统端口
- **过滤自身端口**：扫描结果过滤 steam_play_space.exe 自身端口
- **扫描间隔优化**：自动检测间隔 2 秒→5 秒，减少系统资源消耗
- **常用游戏端口预设**：添加 6 个快捷按钮（MC 25565、Terraria 7777、Valheim 2456、L4D2 27015、帕鲁 8211、PZ 16261）

## v2.3.4

### 修复
- **通话成员列表只显示一个人**：set_lobby_data → set_lobby_member_data（非房主也能设置）
- **语音卡顿 0.25 秒一次**：nextPlayTime 超前检测 + JITTER 增大到 10/30 帧

### 改进
- **文件传输提速 10 倍**：sleep 1ms→0.1ms，通话时 5ms→1ms
- **拖拽发送文件**：onDragDropEvent 获取拖拽文件路径
- **删除说话人绿框左侧小圆点**

## v2.3.3

### 修复
- **P2PSessionRequest 回调未注册**：Steam P2P 需要在回调中调用 accept_p2p_session 才能收到包

## v2.3.1

### 改进
- **语音通话优化**：JitterBuffer、序列号、降噪

## v2.2.4

### 修复
- **P2P Packet API 1200 字节限制**：导致文件/语音传输失败

## v2.2.3

### 修复
- **UDP host 多客户端 bug**
- **doJoinLobby lastHostId 缺失**