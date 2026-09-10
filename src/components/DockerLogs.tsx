import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Editor } from "@monaco-editor/react";

type DockerContainer = {
	id: string;
	name: string;
	status: string;
	image: string;
};

const DockerLogs: React.FC = (): React.JSX.Element => {
	// --- SSH CONFIG STATE ---
	const [isRemote, setIsRemote] = useState(false);
	const [sshHost, setSshHost] = useState("");
	const [sshUser, setSshUser] = useState("root");
	const [sshPort, setSshPort] = useState("22");
	const [sshKeyPath, setSshKeyPath] = useState("");

	// --- DOCKER LOG STATE ---
	const [containers, setContainers] = useState<DockerContainer[]>([]);
	const [selectedContainer, setSelectedContainer] = useState<string>("");
	const [dockerLogs, setDockerLogs] = useState<string>("");
	const [tailCount, setTailCount] = useState<string>("100");
	const [grepTerm, setGrepTerm] = useState<string>("");
	const [isRealtime, setIsRealtime] = useState<boolean>(false);
	const intervalRef = useRef<number | null>(null);

	// Lấy config ssh hiện tại
	const getSshConfig = () => ({
		enabled: isRemote,
		host: sshHost,
		user: sshUser,
		port: sshPort,
		key_path: sshKeyPath,
	});

	async function handleBrowseSshKey() {
		const selected = await open({
			multiple: false,
			directory: false,
			filters: [
				{
					name: "SSH Keys",
					extensions: ["pem", "ppk", "key", "txt", "*"],
				},
			], // Lọc file khóa
		});
		if (selected && typeof selected === "string") {
			setSshKeyPath(selected);
		}
	}

	async function loadContainers() {
		// Nếu chọn Remote mà thiếu thông tin thì báo lỗi
		if (isRemote && (!sshHost || !sshKeyPath)) {
			return alert("Vui lòng nhập IP Server và trỏ đến file SSH Key!");
		}
		try {
			setDockerLogs("Đang kết nối để lấy danh sách container...");
			const data: DockerContainer[] = await invoke(
				"get_docker_containers",
				{
					ssh: getSshConfig(),
				},
			);
			setContainers(data);
			setDockerLogs(
				"✅ Lấy danh sách thành công! Chọn container để xem log.",
			);
		} catch (err) {
			setDockerLogs(`❌ LỖI KẾT NỐI:\n${err}`);
			setContainers([]);
		}
	}

	async function fetchLogs(containerId: string = selectedContainer) {
		if (!containerId) return;
		try {
			const logs: string = await invoke("get_docker_logs", {
				containerId: containerId,
				tail: tailCount,
				grep: grepTerm,
				ssh: getSshConfig(),
			});
			setDockerLogs(
				logs || "--- Không có dữ liệu log hoặc từ khóa không khớp ---",
			);
		} catch (err) {
			setDockerLogs(`❌ LỖI TRÍCH XUẤT LOG:\n${err}`);
		}
	}

	// Hook Auto-refresh
	useEffect(() => {
		if (isRealtime && selectedContainer) {
			fetchLogs();
			intervalRef.current = window.setInterval(() => fetchLogs(), 3000); // Đặt 3 giây cho remote tránh nghẽn
		} else {
			if (intervalRef.current) clearInterval(intervalRef.current);
		}
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [isRealtime, selectedContainer, tailCount, grepTerm]);

	return (
		<div
			className="view-container"
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
			}}
		>
			{/* PANEL CẤU HÌNH SSH */}
			<div
				style={{
					background: "#252526",
					padding: "15px",
					borderRadius: "6px",
					border: "1px solid #333",
					marginBottom: "15px",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "15px",
						marginBottom: "10px",
					}}
				>
					<h2 style={{ margin: 0 }}>🐳 Docker Console</h2>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: "5px",
							cursor: "pointer",
							background: isRemote ? "#007acc" : "#444",
							padding: "4px 10px",
							borderRadius: "15px",
							fontSize: "13px",
							color: "#fff",
						}}
					>
						<input
							type="checkbox"
							checked={isRemote}
							onChange={(e) => setIsRemote(e.target.checked)}
							style={{ display: "none" }}
						/>
						{isRemote ? "🌐 Remote Server" : "💻 Local Machine"}
					</label>
				</div>

				{isRemote && (
					<div
						style={{
							display: "flex",
							gap: "10px",
							marginTop: "10px",
						}}
					>
						<input
							placeholder="Host IP (vd: 192.168.1.10)"
							value={sshHost}
							onChange={(e) => setSshHost(e.target.value)}
							className="input-dark"
							style={{ flex: 2 }}
						/>
						<input
							placeholder="User (vd: ubuntu)"
							value={sshUser}
							onChange={(e) => setSshUser(e.target.value)}
							className="input-dark"
							style={{ flex: 1 }}
						/>
						<input
							placeholder="Port (22)"
							value={sshPort}
							onChange={(e) => setSshPort(e.target.value)}
							className="input-dark"
							style={{ width: "80px" }}
						/>
						<div
							style={{
								display: "flex",
								flex: 3,
								gap: "5px",
							}}
						>
							<input
								placeholder="Đường dẫn file .pem / id_rsa"
								value={sshKeyPath}
								readOnly
								className="input-dark"
								style={{
									flex: 1,
									color: "#a9a9a9",
								}}
							/>
							<button
								onClick={handleBrowseSshKey}
								className="btn-primary"
								style={{
									background: "#555",
									padding: "0 10px",
								}}
							>
								📁 Chọn Key
							</button>
						</div>
					</div>
				)}
			</div>

			{/* THANH ĐIỀU KHIỂN DOCKER LOGS */}
			<div
				style={{
					display: "flex",
					gap: "10px",
					marginBottom: "15px",
					alignItems: "center",
					background: "#252526",
					padding: "10px",
					borderRadius: "6px",
					border: "1px solid #333",
				}}
			>
				<button
					onClick={loadContainers}
					className="btn-primary"
					style={{
						background: "#4caf50",
						whiteSpace: "nowrap",
					}}
				>
					🔄 Lấy DS Container
				</button>

				<select
					value={selectedContainer}
					onChange={(e) => {
						setSelectedContainer(e.target.value);
						setIsRealtime(false);
					}}
					className="input-dark"
					style={{ flex: 1 }}
				>
					<option value="">-- Chọn Container để xem log --</option>
					{containers.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name} ({c.status.includes("Up") ? "🟢" : "🔴"})
						</option>
					))}
				</select>

				<span style={{ fontSize: "13px" }}>Tail:</span>
				<select
					value={tailCount}
					onChange={(e) => setTailCount(e.target.value)}
					className="input-dark"
					style={{ width: "80px" }}
				>
					<option value="50">50</option>
					<option value="200">200</option>
					<option value="all">Tất cả</option>
				</select>

				<input
					placeholder="Grep (tìm kiếm)..."
					value={grepTerm}
					onChange={(e) => setGrepTerm(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
					className="input-dark"
					style={{ width: "150px" }}
				/>

				<button
					onClick={() => fetchLogs()}
					className="btn-primary"
					disabled={!selectedContainer}
				>
					Xem
				</button>

				<label
					style={{
						display: "flex",
						alignItems: "center",
						gap: "5px",
						cursor: "pointer",
						fontSize: "13px",
						color: isRealtime ? "#f48771" : "#a9a9a9",
					}}
				>
					<input
						type="checkbox"
						checked={isRealtime}
						onChange={(e) => setIsRealtime(e.target.checked)}
						disabled={!selectedContainer}
					/>
					{isRealtime ? "🔴 Live Watch" : "Live Watch"}
				</label>
			</div>

			{/* EDITOR HIỂN THỊ LOG */}
			<div
				style={{
					flex: 1,
					border: "1px solid #333",
					borderRadius: "4px",
					overflow: "hidden",
				}}
			>
				<Editor
					height="100%"
					theme="vs-dark"
					language="shell"
					value={dockerLogs}
					options={{
						readOnly: true,
						wordWrap: "on",
						minimap: { enabled: false },
					}}
				/>
			</div>
		</div>
	);
};

export default DockerLogs;
