import { invoke } from "@tauri-apps/api/core";

export interface NetworkCommandResult {
	success: boolean;
	command: string;
	output: string;
	durationMs: number;
}

export interface TcpCheckResult {
	success: boolean;
	host: string;
	port: number;
	address?: string | null;
	status: string;
	durationMs: number;
}

export interface DnsResult {
	success: boolean;
	host: string;
	addresses: string[];
	durationMs: number;
}

export const networkService = {
	ping(host: string, count = 4) {
		return invoke<NetworkCommandResult>("network_ping", {
			host,
			count,
		});
	},

	tcpCheck(host: string, port: number, timeoutMs = 3000) {
		return invoke<TcpCheckResult>("network_tcp_check", {
			host,
			port,
			timeoutMs,
		});
	},

	dnsResolve(host: string) {
		return invoke<DnsResult>("network_dns_resolve", {
			host,
		});
	},

	nslookup(host: string) {
		return invoke<NetworkCommandResult>("network_nslookup", {
			host,
		});
	},

	trace(host: string) {
		return invoke<NetworkCommandResult>("network_trace", {
			host,
		});
	},
};
