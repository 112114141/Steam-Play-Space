use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct GameInfo {
    pub friendly_name: &'static str,
    pub default_port: u16,
    pub protocol: &'static str,
}

struct GameEntry {
    process_name: &'static str,
    port: u16,
    info: GameInfo,
}

static GAME_DATABASE: &[GameEntry] = &[
    GameEntry { process_name: "java.exe", port: 25565, info: GameInfo { friendly_name: "Minecraft 服务器", default_port: 25565, protocol: "TCP" } },
    GameEntry { process_name: "TerrariaServer.exe", port: 7777, info: GameInfo { friendly_name: "泰拉瑞亚服务器", default_port: 7777, protocol: "TCP" } },
    GameEntry { process_name: "Terraria.exe", port: 7777, info: GameInfo { friendly_name: "泰拉瑞亚", default_port: 7777, protocol: "TCP" } },
    GameEntry { process_name: "valheim_server.exe", port: 2456, info: GameInfo { friendly_name: "英灵神殿服务器", default_port: 2456, protocol: "UDP" } },
    GameEntry { process_name: "PalServer.exe", port: 8211, info: GameInfo { friendly_name: "幻兽帕鲁服务器", default_port: 8211, protocol: "UDP" } },
    GameEntry { process_name: "ProjectZomboid.exe", port: 16261, info: GameInfo { friendly_name: "僵尸毁灭工程服务器", default_port: 16261, protocol: "UDP" } },
    GameEntry { process_name: "left4dead2.exe", port: 27015, info: GameInfo { friendly_name: "求生之路2", default_port: 27015, protocol: "UDP" } },
    GameEntry { process_name: "srcds.exe", port: 27015, info: GameInfo { friendly_name: "Source 引擎服务器", default_port: 27015, protocol: "UDP" } },
    GameEntry { process_name: "Don'tStarveTogether.exe", port: 10999, info: GameInfo { friendly_name: "饥荒联机版服务器", default_port: 10999, protocol: "UDP" } },
    GameEntry { process_name: "StardewValleyServer.exe", port: 52190, info: GameInfo { friendly_name: "星露谷物语服务器", default_port: 52190, protocol: "UDP" } },
    GameEntry { process_name: "factorio.exe", port: 34197, info: GameInfo { friendly_name: "异星工厂服务器", default_port: 34197, protocol: "UDP" } },
    GameEntry { process_name: "ShooterGameServer.exe", port: 7777, info: GameInfo { friendly_name: "方舟生存进化服务器", default_port: 7777, protocol: "UDP" } },
    GameEntry { process_name: "AstroServer.exe", port: 8777, info: GameInfo { friendly_name: "异星探险家服务器", default_port: 8777, protocol: "UDP" } },
    GameEntry { process_name: "csgo.exe", port: 27015, info: GameInfo { friendly_name: "CS:GO 服务器", default_port: 27015, protocol: "UDP" } },
    GameEntry { process_name: "hlds.exe", port: 27015, info: GameInfo { friendly_name: "Half-Life 服务器", default_port: 27015, protocol: "UDP" } },
    GameEntry { process_name: "RustDedicated.exe", port: 28015, info: GameInfo { friendly_name: "腐蚀服务器", default_port: 28015, protocol: "UDP" } },
    GameEntry { process_name: "SquadServer.exe", port: 7787, info: GameInfo { friendly_name: "战术小队服务器", default_port: 7787, protocol: "UDP" } },
    GameEntry { process_name: "SpaceEngineersDedicated.exe", port: 27016, info: GameInfo { friendly_name: "空间站工程师服务器", default_port: 27016, protocol: "UDP" } },
    GameEntry { process_name: "Mindustry.exe", port: 6567, info: GameInfo { friendly_name: "Mindustry 服务器", default_port: 6567, protocol: "TCP" } },
    GameEntry { process_name: "VintageStoryServer.exe", port: 42420, info: GameInfo { friendly_name: "Vintage Story 服务器", default_port: 42420, protocol: "TCP" } },
    GameEntry { process_name: "RimWorldWin64.exe", port: 25565, info: GameInfo { friendly_name: "边缘世界服务器", default_port: 25565, protocol: "TCP" } },
    GameEntry { process_name: "7DaysToDieServer.exe", port: 26900, info: GameInfo { friendly_name: "七日杀服务器", default_port: 26900, protocol: "UDP" } },
    GameEntry { process_name: "CivilizationVI.exe", port: 6035, info: GameInfo { friendly_name: "文明6", default_port: 6035, protocol: "UDP" } },
    GameEntry { process_name: "DedicatedCustomServer.Starter.exe", port: 7240, info: GameInfo { friendly_name: "骑马与砍杀2服务器", default_port: 7240, protocol: "UDP" } },
    GameEntry { process_name: "insurgency_server.exe", port: 27015, info: GameInfo { friendly_name: "叛乱服务器", default_port: 27015, protocol: "UDP" } },
    GameEntry { process_name: "TowerFall.exe", port: 52212, info: GameInfo { friendly_name: "塔倒人间", default_port: 52212, protocol: "UDP" } },
    GameEntry { process_name: "Overcooked.exe", port: 1947, info: GameInfo { friendly_name: "胡闹厨房", default_port: 1947, protocol: "UDP" } },
    GameEntry { process_name: "GangBeasts.exe", port: 5730, info: GameInfo { friendly_name: "帮派野兽", default_port: 5730, protocol: "UDP" } },
    GameEntry { process_name: "KeepTalking.exe", port: 27015, info: GameInfo { friendly_name: "保持通话没人爆炸", default_port: 27015, protocol: "UDP" } },
];

static SYSTEM_PROCESSES: &[&str] = &[
    "svchost.exe", "System", "Idle",
    "chrome.exe", "firefox.exe", "msedge.exe", "opera.exe", "brave.exe",
    "Code.exe", "Code - Insiders.exe", "cursor.exe",
    "explorer.exe", "conhost.exe", "powershell.exe", "pwsh.exe", "cmd.exe",
    "node.exe", "python.exe", "pythonw.exe", "ruby.exe", "perl.exe",
    "SearchProtocolHost.exe", "SearchFilterHost.exe", "SearchIndexer.exe",
    "RuntimeBroker.exe", "ApplicationFrameHost.exe", "dllhost.exe",
    "services.exe", "lsass.exe", "wininit.exe", "winlogon.exe",
    "fontdrvhost.exe", "dwm.exe", "sihost.exe", "taskhostw.exe",
    "spoolsv.exe", "inetinfo.exe", "w3wp.exe",
    "Discord.exe", "Steam.exe", "steam.exe", "steamwebhelper.exe",
    "sshd.exe", "ngrok.exe", "wsl.exe", "wslhost.exe",
    "OneDrive.exe", "Dropbox.exe", "googledrive.exe",
    "git.exe", "curl.exe", "wget.exe",
    "msiexec.exe", "rundll32.exe", "regsvr32.exe",
    "WindowsTerminal.exe", "wt.exe", "Fiddler.exe", "Wireshark.exe",
    "vmms.exe", "vmcompute.exe", "vmmem.exe",
    "postgres.exe", "mysqld.exe", "redis-server.exe",
    "nginx.exe", "httpd.exe", "php-cgi.exe",
    "docker.exe", "dockerd.exe", "com.docker.backend.exe",
    "TextInputHost.exe", "ShellExperienceHost.exe", "StartMenuExperienceHost.exe",
    "ctfmon.exe", "textinputhost.exe",
];

static GENERIC_GAME_PROCESSES: &[(&str, &str)] = &[
    ("java.exe", "Java 游戏服务器"),
    ("python.exe", "Python 游戏服务器"),
    ("node.exe", "Node.js 游戏服务器"),
    ("ruby.exe", "Ruby 游戏服务器"),
];

pub fn identify_game(process_name: &str, _port: u16) -> Option<GameInfo> {
    for entry in GAME_DATABASE {
        if entry.process_name.eq_ignore_ascii_case(process_name) {
            return Some(entry.info.clone());
        }
    }
    for (proc, friendly) in GENERIC_GAME_PROCESSES {
        if proc.eq_ignore_ascii_case(process_name) {
            return Some(GameInfo {
                friendly_name: friendly,
                default_port: 0,
                protocol: "TCP",
            });
        }
    }
    None
}

pub fn is_system_process(process_name: &str) -> bool {
    SYSTEM_PROCESSES.iter().any(|p| p.eq_ignore_ascii_case(process_name))
}