export interface FriendInfo {
	id: string;
	name: string;
	state: string;
	game_id: number;
	state_priority: number;
	in_this_game: boolean;
	lobby_id: string | null;
}

export interface LobbyInfo {
	id: string;
	name: string;
	member_count: number;
	max_members: number;
}

export interface MemberInfo {
	id: string;
	name: string;
	ping: number;
	relay: string;
}

export interface NetworkStatus {
	isHost: boolean;
	isConnected: boolean;
	tcpClientCount: number;
	statusMessage: string;
	ping: number;
	connectionType: string;
	lobbyId: string | null;
	bytesSent: number;
	bytesReceived: number;
}

export interface JoinLobbyResult {
	lobby_id: string;
	host_id: string;
	host_protocol: string;
}
