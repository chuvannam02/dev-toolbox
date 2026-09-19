import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Editor } from "@monaco-editor/react";

import { useEffect, useRef, useState } from "react";

import {
	Container,
	FolderOpen,
	KeyRound,
	Laptop,
	Plus,
	Radio,
	RefreshCw,
	Save,
	Search,
	Server,
	ShieldCheck,
	Trash2,
} from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";

import { RadioGroup, RadioGroupItem } from "./ui/radio-group";

import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

import type {
	AuthType,
	DockerContainer,
	DockerServerProfile,
	InstallKeyResult,
	SshConfig,
} from "@/types/DockerLogs.type";

const STORAGE_KEY = "dev-toolbox:docker-server-profiles:v1";

function readSavedProfiles(): DockerServerProfile[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);

		if (!raw) {
			return [];
		}

		const data = JSON.parse(raw);

		if (!Array.isArray(data)) {
			return [];
		}

		return data;
	} catch {
		return [];
	}
}

const DockerLogs: React.FC = (): React.JSX.Element => {
	/*
	 * =========================================================
	 * SERVER PROFILES
	 * =========================================================
	 */

	const [profiles, setProfiles] =
		useState<DockerServerProfile[]>(readSavedProfiles);

	const [selectedProfileId, setSelectedProfileId] = useState<string>("");

	const [isRemote, setIsRemote] = useState(false);

	/*
	 * =========================================================
	 * CURRENT SERVER FORM
	 * =========================================================
	 */

	const [profileName, setProfileName] = useState("");

	const [sshHost, setSshHost] = useState("");
	const [sshUser, setSshUser] = useState("root");
	const [sshPort, setSshPort] = useState("22");

	const [authType, setAuthType] = useState<AuthType>("key");

	const [sshPassword, setSshPassword] = useState("");

	const [sshKeyPath, setSshKeyPath] = useState("");

	const [useSudo, setUseSudo] = useState(false);

	const [sudoPassword, setSudoPassword] = useState("");

	const [installingKey, setInstallingKey] = useState(false);

	/*
	 * =========================================================
	 * DOCKER
	 * =========================================================
	 */

	const [containers, setContainers] = useState<DockerContainer[]>([]);

	const [selectedContainer, setSelectedContainer] = useState("");

	const [dockerLogs, setDockerLogs] = useState("");

	const [tailCount, setTailCount] = useState("200");

	const [grepTerm, setGrepTerm] = useState("");

	const [isRealtime, setIsRealtime] = useState(false);

	const [loadingContainers, setLoadingContainers] = useState(false);

	const [loadingLogs, setLoadingLogs] = useState(false);

	const intervalRef = useRef<number | null>(null);

	/*
	 * =========================================================
	 * PROFILE PERSISTENCE
	 * =========================================================
	 */

	function persistProfiles(nextProfiles: DockerServerProfile[]) {
		setProfiles(nextProfiles);

		localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProfiles));
	}

	function resetRuntimeState() {
		setContainers([]);
		setSelectedContainer("");
		setDockerLogs("");
		setIsRealtime(false);

		/*
		 * Security:
		 * Password không được mang từ server này sang server khác.
		 */
		setSshPassword("");
		setSudoPassword("");
	}

	function handleSelectProfile(profileId: string) {
		const profile = profiles.find((item) => item.id === profileId);

		if (!profile) {
			return;
		}

		setIsRemote(true);
		setSelectedProfileId(profile.id);

		setProfileName(profile.name);

		setSshHost(profile.host);
		setSshUser(profile.user);
		setSshPort(String(profile.port));

		setAuthType(profile.authType);
		setSshKeyPath(profile.keyPath);

		setUseSudo(profile.useSudo);

		resetRuntimeState();
	}

	function handleNewServer() {
		setIsRemote(true);

		setSelectedProfileId("");

		setProfileName("");
		setSshHost("");
		setSshUser("root");
		setSshPort("22");

		/*
		 * Server mới thường bootstrap bằng password.
		 */
		setAuthType("password");

		setSshKeyPath("");
		setSshPassword("");

		setUseSudo(false);
		setSudoPassword("");

		resetRuntimeState();
	}

	function buildCurrentProfile(
		overrides?: Partial<DockerServerProfile>,
	): DockerServerProfile {
		const host = sshHost.trim();

		return {
			id: overrides?.id ?? selectedProfileId ?? crypto.randomUUID(),

			name: overrides?.name ?? profileName.trim() ?? host,

			host: overrides?.host ?? host,

			user: overrides?.user ?? sshUser.trim(),

			port: overrides?.port ?? (Number.parseInt(sshPort, 10) || 22),

			authType: overrides?.authType ?? authType,

			keyPath: overrides?.keyPath ?? sshKeyPath,

			useSudo: overrides?.useSudo ?? useSudo,
		};
	}

	function saveCurrentProfile(overrides?: Partial<DockerServerProfile>) {
		if (!sshHost.trim()) {
			setDockerLogs("❌ Host không được để trống.");
			return;
		}

		if (!sshUser.trim()) {
			setDockerLogs("❌ SSH user không được để trống.");
			return;
		}

		const id = selectedProfileId || crypto.randomUUID();

		const profile = buildCurrentProfile({
			...overrides,
			id,

			name: overrides?.name || profileName.trim() || sshHost.trim(),
		});

		const exists = profiles.some((item) => item.id === id);

		const nextProfiles = exists
			? profiles.map((item) => (item.id === id ? profile : item))
			: [...profiles, profile];

		persistProfiles(nextProfiles);

		setSelectedProfileId(id);
		setProfileName(profile.name);

		setDockerLogs(`✅ Đã lưu profile "${profile.name}".`);
	}

	function deleteCurrentProfile() {
		if (!selectedProfileId) {
			return;
		}

		const profile = profiles.find((item) => item.id === selectedProfileId);

		if (!profile) {
			return;
		}

		const confirmed = window.confirm(
			`Xóa server "${profile.name}" khỏi danh sách?\n\nSSH key trên máy sẽ không bị xóa.`,
		);

		if (!confirmed) {
			return;
		}

		const nextProfiles = profiles.filter(
			(item) => item.id !== selectedProfileId,
		);

		persistProfiles(nextProfiles);

		setSelectedProfileId("");

		handleNewServer();
	}

	/*
	 * =========================================================
	 * SSH
	 * =========================================================
	 */

	function getSshConfig(): SshConfig {
		return {
			enabled: isRemote,

			host: sshHost.trim(),
			user: sshUser.trim(),

			port: Number.parseInt(sshPort, 10) || 22,

			authType,

			keyPath: authType === "key" ? sshKeyPath || undefined : undefined,

			/*
			 * Password chỉ nằm trong memory.
			 */
			password:
				authType === "password" ? sshPassword || undefined : undefined,

			useSudo,

			/*
			 * Cũng chỉ nằm trong memory.
			 */
			sudoPassword: useSudo ? sudoPassword || undefined : undefined,
		};
	}

	async function handleBrowseSshKey() {
		const selected = await open({
			multiple: false,
			directory: false,

			filters: [
				{
					name: "SSH Private Key",
					extensions: ["pem", "key", "ppk", "*"],
				},
			],
		});

		if (selected && typeof selected === "string") {
			setSshKeyPath(selected);
			setAuthType("key");
		}
	}

	async function handleInstallSshKey() {
		if (!sshHost.trim()) {
			setDockerLogs("❌ Vui lòng nhập Host.");
			return;
		}

		if (!sshUser.trim()) {
			setDockerLogs("❌ Vui lòng nhập SSH User.");
			return;
		}

		if (!sshPassword) {
			setDockerLogs("❌ Vui lòng nhập SSH Password.");
			return;
		}

		try {
			setInstallingKey(true);

			setDockerLogs("🔐 Đang kết nối và cài SSH key...");

			const result = await invoke<InstallKeyResult>("install_ssh_key", {
				host: sshHost.trim(),

				user: sshUser.trim(),

				port: Number.parseInt(sshPort, 10) || 22,

				password: sshPassword,
			});

			/*
			 * Password đã hoàn thành nhiệm vụ.
			 * Xóa khỏi memory state.
			 */
			setSshPassword("");

			setSshKeyPath(result.keyPath);
			setAuthType("key");

			/*
			 * Sau khi bootstrap key thành công,
			 * tự động lưu/update server profile.
			 */
			saveCurrentProfile({
				authType: "key",
				keyPath: result.keyPath,
			});

			setDockerLogs(
				[
					`✅ ${result.message}`,
					"",
					`Private key:`,
					result.keyPath,
					"",
					"Server đã chuyển sang SSH Key Authentication.",
				].join("\n"),
			);
		} catch (error) {
			setDockerLogs(`❌ Không cài được SSH key:\n${String(error)}`);
		} finally {
			setInstallingKey(false);
		}
	}

	/*
	 * =========================================================
	 * DOCKER
	 * =========================================================
	 */

	function validateRemoteConfig() {
		if (!isRemote) {
			return true;
		}

		if (!sshHost.trim()) {
			setDockerLogs("❌ Chưa nhập SSH Host.");

			return false;
		}

		if (!sshUser.trim()) {
			setDockerLogs("❌ Chưa nhập SSH User.");

			return false;
		}

		if (authType === "key" && !sshKeyPath) {
			setDockerLogs("❌ Chưa chọn SSH private key.");

			return false;
		}

		if (authType === "password" && !sshPassword) {
			setDockerLogs("❌ Chưa nhập SSH password.");

			return false;
		}

		return true;
	}

	async function loadContainers() {
		if (!validateRemoteConfig()) {
			return;
		}

		try {
			setLoadingContainers(true);

			setDockerLogs(
				isRemote
					? `🔄 Connecting to ${sshUser}@${sshHost}...`
					: "🔄 Reading local Docker containers...",
			);

			const data = await invoke<DockerContainer[]>(
				"get_docker_containers",
				{
					ssh: getSshConfig(),
				},
			);

			setContainers(data);

			setDockerLogs(`✅ Found ${data.length} Docker container(s).`);
		} catch (error) {
			setContainers([]);

			setDockerLogs(`❌ Không lấy được container:\n${String(error)}`);
		} finally {
			setLoadingContainers(false);
		}
	}

	async function fetchLogs(containerId: string = selectedContainer) {
		if (!containerId) {
			return;
		}

		if (!validateRemoteConfig()) {
			return;
		}

		try {
			setLoadingLogs(true);

			const logs = await invoke<string>("get_docker_logs", {
				containerId,
				tail: tailCount,
				grep: grepTerm,
				ssh: getSshConfig(),
			});

			setDockerLogs(logs || "--- Không có log phù hợp ---");
		} catch (error) {
			setDockerLogs(`❌ Không lấy được Docker logs:\n${String(error)}`);
		} finally {
			setLoadingLogs(false);
		}
	}

	/*
	 * Polling hiện tại.
	 *
	 * Sau này có thể thay bằng:
	 * docker logs -f + Tauri Event.
	 */
	useEffect(() => {
		if (isRealtime && selectedContainer) {
			fetchLogs();

			intervalRef.current = window.setInterval(() => {
				fetchLogs();
			}, 3000);
		}

		return () => {
			if (intervalRef.current) {
				window.clearInterval(intervalRef.current);

				intervalRef.current = null;
			}
		};
	}, [isRealtime, selectedContainer, tailCount, grepTerm]);

	/*
	 * Password chỉ sống trong component.
	 */
	useEffect(() => {
		return () => {
			setSshPassword("");
			setSudoPassword("");
		};
	}, []);

	return (
		<div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)] gap-4 p-4">
			{/* =====================================================
			    LEFT SIDEBAR
			===================================================== */}

			<Card className="flex min-h-0 flex-col overflow-hidden">
				<CardHeader className="border-b pb-4">
					<div className="flex items-center justify-between">
						<CardTitle className="text-base">
							Docker Servers
						</CardTitle>

						<Button
							size="icon"
							variant="outline"
							onClick={handleNewServer}
							title="Add server"
						>
							<Plus className="h-4 w-4" />
						</Button>
					</div>
				</CardHeader>

				<CardContent className="min-h-0 flex-1 overflow-y-auto p-2">
					{/* LOCAL */}

					<button
						type="button"
						onClick={() => {
							setIsRemote(false);

							resetRuntimeState();
						}}
						className={[
							"mb-2 flex w-full items-center gap-3 rounded-md border p-3 text-left transition",
							!isRemote
								? "border-primary bg-primary/10"
								: "border-transparent hover:bg-muted",
						].join(" ")}
					>
						<div className="rounded-md bg-muted p-2">
							<Laptop className="h-4 w-4" />
						</div>

						<div className="min-w-0">
							<div className="text-sm font-medium">
								Local Machine
							</div>

							<div className="text-xs text-muted-foreground">
								Local Docker Engine
							</div>
						</div>
					</button>

					<div className="my-3 border-t" />

					<div className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Remote Servers
					</div>

					{profiles.length === 0 && (
						<div className="px-3 py-6 text-center text-sm text-muted-foreground">
							<Server className="mx-auto mb-2 h-6 w-6 opacity-50" />
							No remote servers yet.
						</div>
					)}

					<div className="space-y-1">
						{profiles.map((profile) => {
							const active =
								isRemote && selectedProfileId === profile.id;

							return (
								<button
									key={profile.id}
									type="button"
									onClick={() =>
										handleSelectProfile(profile.id)
									}
									className={[
										"flex w-full items-start gap-3 rounded-md border p-3 text-left transition",
										active
											? "border-primary bg-primary/10"
											: "border-transparent hover:bg-muted",
									].join(" ")}
								>
									<div className="rounded-md bg-muted p-2">
										<Server className="h-4 w-4" />
									</div>

									<div className="min-w-0 flex-1">
										<div className="truncate text-sm font-medium">
											{profile.name}
										</div>

										<div className="truncate text-xs text-muted-foreground">
											{profile.user}@{profile.host}:
											{profile.port}
										</div>

										<div className="mt-1 flex items-center gap-1 text-xs">
											{profile.keyPath ? (
												<>
													<ShieldCheck className="h-3 w-3 text-green-500" />
													<span className="text-green-500">
														Key configured
													</span>
												</>
											) : (
												<span className="text-amber-500">
													No key
												</span>
											)}
										</div>
									</div>
								</button>
							);
						})}
					</div>
				</CardContent>
			</Card>

			{/* =====================================================
			    RIGHT CONTENT
			===================================================== */}

			<div className="flex min-h-0 flex-col gap-4 overflow-hidden">
				<Card className="shrink-0">
					<CardHeader className="pb-4">
						<div className="flex items-center justify-between gap-4">
							<CardTitle className="flex items-center gap-2">
								<Container className="h-5 w-5" />
								Docker Console
							</CardTitle>

							<Tabs
								value={isRemote ? "remote" : "local"}
								onValueChange={(value) => {
									if (value === "local") {
										setIsRemote(false);

										resetRuntimeState();

										return;
									}

									setIsRemote(true);

									if (
										!selectedProfileId &&
										profiles.length > 0
									) {
										handleSelectProfile(profiles[0].id);
									} else if (profiles.length === 0) {
										handleNewServer();
									}
								}}
							>
								<TabsList>
									<TabsTrigger
										value="local"
										className="gap-2"
									>
										<Laptop className="h-4 w-4" />
										Local
									</TabsTrigger>

									<TabsTrigger
										value="remote"
										className="gap-2"
									>
										<Server className="h-4 w-4" />
										Remote
									</TabsTrigger>
								</TabsList>
							</Tabs>
						</div>
					</CardHeader>

					{isRemote && (
						<CardContent className="space-y-5">
							{/* PROFILE HEADER */}

							<div className="flex gap-2">
								<div className="flex-1 space-y-2">
									<Label>Server Name</Label>

									<Input
										placeholder="Production API 01"
										value={profileName}
										onChange={(e) =>
											setProfileName(e.target.value)
										}
									/>
								</div>

								<div className="flex items-end gap-2">
									<Button
										onClick={() => saveCurrentProfile()}
									>
										<Save className="mr-2 h-4 w-4" />
										Save
									</Button>

									{selectedProfileId && (
										<Button
											variant="destructive"
											size="icon"
											onClick={deleteCurrentProfile}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									)}
								</div>
							</div>

							{/* HOST */}

							<div className="grid grid-cols-12 gap-4">
								<div className="col-span-6 space-y-2">
									<Label>Host / IP</Label>

									<Input
										placeholder="10.254.60.101"
										value={sshHost}
										onChange={(e) =>
											setSshHost(e.target.value)
										}
									/>
								</div>

								<div className="col-span-4 space-y-2">
									<Label>User</Label>

									<Input
										placeholder="oracle"
										value={sshUser}
										onChange={(e) =>
											setSshUser(e.target.value)
										}
									/>
								</div>

								<div className="col-span-2 space-y-2">
									<Label>Port</Label>

									<Input
										value={sshPort}
										onChange={(e) =>
											setSshPort(e.target.value)
										}
									/>
								</div>
							</div>

							{/* AUTH */}

							<div className="space-y-3">
								<Label>Authentication</Label>

								<RadioGroup
									value={authType}
									onValueChange={(value) =>
										setAuthType(value as AuthType)
									}
									className="flex gap-8"
								>
									<div className="flex items-center gap-2">
										<RadioGroupItem
											value="key"
											id="ssh-key"
										/>

										<Label
											htmlFor="ssh-key"
											className="cursor-pointer"
										>
											SSH Key
										</Label>
									</div>

									<div className="flex items-center gap-2">
										<RadioGroupItem
											value="password"
											id="ssh-password"
										/>

										<Label
											htmlFor="ssh-password"
											className="cursor-pointer"
										>
											Password → Install Key
										</Label>
									</div>
								</RadioGroup>
							</div>

							{/* KEY */}

							{authType === "key" && (
								<div className="space-y-2">
									<Label>Private Key</Label>

									<div className="flex gap-2">
										<Input
											readOnly
											value={sshKeyPath}
											placeholder="id_ed25519 / .pem"
										/>

										<Button
											variant="outline"
											onClick={handleBrowseSshKey}
										>
											<FolderOpen className="mr-2 h-4 w-4" />
											Browse
										</Button>
									</div>
								</div>
							)}

							{/* PASSWORD BOOTSTRAP */}

							{authType === "password" && (
								<div className="rounded-md border p-4">
									<div className="mb-3 space-y-1">
										<div className="flex items-center gap-2 font-medium">
											<KeyRound className="h-4 w-4" />
											Bootstrap SSH Key
										</div>

										<p className="text-xs text-muted-foreground">
											Password chỉ được dùng cho lần kết
											nối này và không được lưu.
										</p>
									</div>

									<div className="flex gap-2">
										<Input
											type="password"
											autoComplete="off"
											value={sshPassword}
											onChange={(e) =>
												setSshPassword(e.target.value)
											}
											placeholder="SSH password"
										/>

										<Button
											onClick={handleInstallSshKey}
											disabled={
												installingKey || !sshPassword
											}
										>
											<KeyRound className="mr-2 h-4 w-4" />

											{installingKey
												? "Installing..."
												: "Install Key"}
										</Button>
									</div>
								</div>
							)}

							{/* KEY STATUS */}

							{sshKeyPath && (
								<div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
									<ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />

									<div className="min-w-0">
										<div className="text-sm font-medium">
											SSH key configured
										</div>

										<div
											className="truncate text-xs text-muted-foreground"
											title={sshKeyPath}
										>
											{sshKeyPath}
										</div>
									</div>
								</div>
							)}

							{/* SUDO */}

							<div className="border-t pt-4">
								<div className="flex items-center gap-3">
									<Switch
										checked={useSudo}
										onCheckedChange={(value) => {
											setUseSudo(value);

											if (!value) {
												setSudoPassword("");
											}
										}}
									/>

									<div>
										<Label>Run Docker with sudo</Label>

										<p className="text-xs text-muted-foreground">
											Chỉ dùng nếu remote user không có
											quyền truy cập Docker.
										</p>
									</div>
								</div>

								{useSudo && (
									<div className="mt-3 max-w-md">
										<Input
											type="password"
											autoComplete="off"
											value={sudoPassword}
											onChange={(e) =>
												setSudoPassword(e.target.value)
											}
											placeholder="Sudo password — not saved"
										/>
									</div>
								)}
							</div>
						</CardContent>
					)}
				</Card>

				{/* =================================================
				    DOCKER TOOLBAR
				================================================= */}

				<Card className="shrink-0">
					<CardContent className="flex flex-wrap items-center gap-3 p-4">
						<Button
							variant="outline"
							onClick={loadContainers}
							disabled={loadingContainers}
						>
							<RefreshCw
								className={[
									"mr-2 h-4 w-4",
									loadingContainers ? "animate-spin" : "",
								].join(" ")}
							/>
							Refresh
						</Button>

						<Select
							value={selectedContainer}
							onValueChange={(value) => {
								setSelectedContainer(value);

								setIsRealtime(false);
							}}
						>
							<SelectTrigger className="min-w-[260px] flex-1">
								<SelectValue placeholder="Select Docker container" />
							</SelectTrigger>

							<SelectContent>
								{containers.map((container) => (
									<SelectItem
										key={container.id}
										value={container.id}
									>
										{container.status.includes("Up")
											? "🟢"
											: "🔴"}{" "}
										{container.name} · {container.image}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select value={tailCount} onValueChange={setTailCount}>
							<SelectTrigger className="w-[120px]">
								<SelectValue />
							</SelectTrigger>

							<SelectContent>
								<SelectItem value="50">50 lines</SelectItem>

								<SelectItem value="200">200 lines</SelectItem>

								<SelectItem value="500">500 lines</SelectItem>

								<SelectItem value="all">All</SelectItem>
							</SelectContent>
						</Select>

						<div className="relative w-52">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

							<Input
								className="pl-9"
								placeholder="Filter logs..."
								value={grepTerm}
								onChange={(e) => setGrepTerm(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										fetchLogs();
									}
								}}
							/>
						</div>

						<Button
							onClick={() => fetchLogs()}
							disabled={!selectedContainer || loadingLogs}
						>
							View Logs
						</Button>

						<div className="ml-auto flex items-center gap-2">
							<Switch
								checked={isRealtime}
								onCheckedChange={setIsRealtime}
								disabled={!selectedContainer}
							/>

							<Radio
								className={[
									"h-4 w-4",
									isRealtime
										? "animate-pulse text-red-500"
										: "text-muted-foreground",
								].join(" ")}
							/>

							<span className="text-sm">Live</span>
						</div>
					</CardContent>
				</Card>

				{/* =================================================
				    LOG VIEWER
				================================================= */}

				<div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
					<Editor
						height="100%"
						theme="vs-dark"
						language="shell"
						value={dockerLogs}
						options={{
							readOnly: true,
							wordWrap: "on",

							minimap: {
								enabled: false,
							},

							fontSize: 13,

							scrollBeyondLastLine: false,

							automaticLayout: true,
						}}
					/>
				</div>
			</div>
		</div>
	);
};

export default DockerLogs;
