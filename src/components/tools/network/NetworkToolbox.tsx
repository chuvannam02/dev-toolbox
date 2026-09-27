import { useState } from "react";
import {
	Activity,
	Cable,
	Globe2,
	Loader2,
	Network,
	Play,
	Route,
} from "lucide-react";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Badge } from "../../ui/badge";

import {
	networkService,
	type DnsResult,
	type NetworkCommandResult,
	type TcpCheckResult,
} from "../../../services/network.service";

type ToolType = "ping" | "tcp" | "dns" | "nslookup" | "trace";

export default function NetworkToolbox() {
	const [tool, setTool] = useState<ToolType>("ping");

	const [host, setHost] = useState("");
	const [port, setPort] = useState("443");

	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<string>("");
	const [success, setSuccess] = useState<boolean | null>(null);
	const [duration, setDuration] = useState<number | null>(null);

	const run = async () => {
		if (!host.trim()) return;

		setLoading(true);
		setResult("");
		setSuccess(null);
		setDuration(null);

		try {
			if (tool === "ping") {
				const response = await networkService.ping(host);

				showCommandResult(response);
			}

			if (tool === "tcp") {
				const response = await networkService.tcpCheck(
					host,
					Number(port),
				);

				showTcpResult(response);
			}

			if (tool === "dns") {
				const response = await networkService.dnsResolve(host);

				showDnsResult(response);
			}

			if (tool === "nslookup") {
				const response = await networkService.nslookup(host);

				showCommandResult(response);
			}

			if (tool === "trace") {
				const response = await networkService.trace(host);

				showCommandResult(response);
			}
		} catch (error) {
			setSuccess(false);

			setResult(error instanceof Error ? error.message : String(error));
		} finally {
			setLoading(false);
		}
	};

	const showCommandResult = (response: NetworkCommandResult) => {
		setSuccess(response.success);
		setDuration(response.durationMs);

		setResult(`$ ${response.command}\n\n${response.output}`);
	};

	const showTcpResult = (response: TcpCheckResult) => {
		setSuccess(response.success);
		setDuration(response.durationMs);

		setResult(
			[
				`Host    : ${response.host}`,
				`Port    : ${response.port}`,
				`Address : ${response.address ?? "-"}`,
				`Status  : ${response.status}`,
			].join("\n"),
		);
	};

	const showDnsResult = (response: DnsResult) => {
		setSuccess(response.success);
		setDuration(response.durationMs);

		setResult(
			[
				`Host: ${response.host}`,
				"",
				...response.addresses.map((ip) => `→ ${ip}`),
			].join("\n"),
		);
	};

	return (
		<div className="space-y-6 p-6">
			{/* Header */}

			<div>
				<div className="flex items-center gap-3">
					<Network className="h-7 w-7" />

					<h1 className="text-2xl font-semibold">Network Toolbox</h1>
				</div>

				<p className="mt-1 text-sm text-muted-foreground">
					Diagnose DNS, connectivity, TCP ports and network routes.
				</p>
			</div>

			<Tabs
				value={tool}
				onValueChange={(value) => setTool(value as ToolType)}
			>
				<TabsList className="grid w-full grid-cols-5">
					<TabsTrigger value="ping">
						<Activity className="mr-2 h-4 w-4" />
						Ping
					</TabsTrigger>

					<TabsTrigger value="tcp">
						<Cable className="mr-2 h-4 w-4" />
						Port
					</TabsTrigger>

					<TabsTrigger value="dns">
						<Globe2 className="mr-2 h-4 w-4" />
						DNS
					</TabsTrigger>

					<TabsTrigger value="nslookup">NSLookup</TabsTrigger>

					<TabsTrigger value="trace">
						<Route className="mr-2 h-4 w-4" />
						Trace
					</TabsTrigger>
				</TabsList>

				<Card className="mt-4">
					<CardHeader>
						<CardTitle className="text-base">
							Network Target
						</CardTitle>
					</CardHeader>

					<CardContent className="space-y-4">
						<div className="flex gap-3">
							<Input
								value={host}
								onChange={(e) => setHost(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										run();
									}
								}}
								placeholder={
									tool === "tcp"
										? "10.254.23.114"
										: "globalfm.rox.vn"
								}
								className="font-mono"
							/>

							{tool === "tcp" && (
								<Input
									value={port}
									onChange={(e) => setPort(e.target.value)}
									type="number"
									min={1}
									max={65535}
									placeholder="443"
									className="w-28 font-mono"
								/>
							)}

							<Button onClick={run} disabled={loading}>
								{loading ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Play className="mr-2 h-4 w-4" />
								)}
								Run
							</Button>
						</div>

						{tool === "tcp" && (
							<div className="flex gap-2">
								{[
									22, 80, 443, 1521, 3306, 5432, 6379, 8080,
								].map((commonPort) => (
									<Button
										key={commonPort}
										variant="outline"
										size="sm"
										onClick={() =>
											setPort(commonPort.toString())
										}
									>
										{commonPort}
									</Button>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				<TabsContent value="ping" />
				<TabsContent value="tcp" />
				<TabsContent value="dns" />
				<TabsContent value="nslookup" />
				<TabsContent value="trace" />
			</Tabs>

			{/* Result */}

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="text-base">Result</CardTitle>

						<div className="flex gap-2">
							{success !== null && (
								<Badge
									variant={
										success ? "default" : "destructive"
									}
								>
									{success ? "SUCCESS" : "FAILED"}
								</Badge>
							)}

							{duration !== null && (
								<Badge variant="secondary">{duration} ms</Badge>
							)}
						</div>
					</div>
				</CardHeader>

				<CardContent>
					<div className="min-h-[300px] rounded-md bg-zinc-950 p-4">
						{result ? (
							<pre className="whitespace-pre-wrap break-all font-mono text-sm text-zinc-100">
								{result}
							</pre>
						) : (
							<div className="text-sm text-zinc-500">
								Run a network diagnostic to see results...
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
