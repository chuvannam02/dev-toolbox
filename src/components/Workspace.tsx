import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

type AppItem = { id?: number; name: string; path: string; icon: string };

const Workspace: React.FC = (): React.JSX.Element => {
	// --- WORKSPACE LAUNCHER STATE ---
	const [apps, setApps] = useState<AppItem[]>([]);
	const [selectedApps, setSelectedApps] = useState<Set<number>>(new Set());
	const [newAppName, setNewAppName] = useState("");
	const [newAppPath, setNewAppPath] = useState("");
	const [newAppIcon, setNewAppIcon] = useState("📁");

	useEffect(() => {
		loadApps();
	}, []);

	// Luồng Workspace
	async function handleAddApp(e: React.FormEvent) {
		e.preventDefault();
		try {
			await invoke("add_launcher_app", {
				// Lưu ý: Phải truyền id: null để Rust biết đây là trường Option trống, nếu không truyền sẽ bị lỗi Deserialize
				item: {
					id: null,
					name: newAppName,
					path: newAppPath,
					icon: newAppIcon,
				},
			});
			// Nếu thành công thì reset form và tải lại danh sách
			setNewAppName("");
			setNewAppPath("");
			loadApps();
		} catch (error) {
			// Bắt lỗi để hiển thị popup lên cho người dùng biết thay vì "chết ngầm"
			console.error("Lỗi từ Rust:", error);
			alert("Không thể thêm ứng dụng. Lỗi: " + error);
		}
	}

	function toggleSelect(id: number) {
		const next = new Set(selectedApps);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		setSelectedApps(next);
	}

	async function handleLaunchSelected() {
		const pathsToLaunch = apps
			.filter((a) => a.id && selectedApps.has(a.id))
			.map((a) => a.path);
		if (pathsToLaunch.length === 0)
			return alert("Vui lòng tick chọn ít nhất 1 ứng dụng!");
		try {
			await invoke("launch_items", { paths: pathsToLaunch });
		} catch (error) {
			alert(error);
		}
	}

	// --- Xử lý chọn File/Folder bằng Native Dialog ---
	async function handleBrowseFile() {
		const selected = open({
			multiple: false,
			directory: false, // Chọn File
			filters: [
				{
					name: "Applications/Shortcuts",
					extensions: ["exe", "lnk", "bat", "sh"],
				},
			], // Có thể lọc đuôi file (tùy chọn)
		});
		if (selected && typeof selected === "string") {
			setNewAppPath(selected);
		}
	}

	async function handleBrowseFolder() {
		const selected = await open({
			multiple: false,
			directory: true, // Chọn Thư mục
		});
		if (selected && typeof selected === "string") {
			setNewAppPath(selected);
		}
	}

	async function loadApps() {
		try {
			const data: AppItem[] = await invoke("get_launcher_apps");
			setApps(data);
		} catch (e) {
			console.error(e);
		}
	}

	return (
		<div className="view-container">
			<div className="toolbar" style={{ marginBottom: "20px" }}>
				<h2>🚀 1-Click Workspace Launcher</h2>
				<button
					onClick={handleLaunchSelected}
					className="btn-primary"
					style={{ background: "#4caf50" }}
				>
					Khởi động App đã chọn ({selectedApps.size})
				</button>
			</div>

			{/* Form thêm App/Folder */}
			<form
				onSubmit={handleAddApp}
				style={{
					display: "flex",
					gap: "10px",
					marginBottom: "20px",
				}}
			>
				<select
					value={newAppIcon}
					onChange={(e) => setNewAppIcon(e.target.value)}
					style={{
						padding: "8px",
						background: "#3c3c3c",
						color: "white",
						border: "none",
						borderRadius: "4px",
					}}
				>
					<option value="📁">📁 Folder</option>
					<option value="🦊">🦊 GitLab/Git</option>
					<option value="☕">☕ IntelliJ/Java</option>
					<option value="🔷">🔷 VS Code</option>
					<option value="🗄️">🗄️ DBeaver/SQL</option>
					<option value="🌐">🌐 Chrome</option>
				</select>

				<input
					value={newAppName}
					onChange={(e) => setNewAppName(e.target.value)}
					placeholder="Tên (vd: Backend Code)"
					style={{ flex: 1 }}
					required
					className="input-dark"
				/>

				{/* --- KHU VỰC ĐƯỜNG DẪN CÓ NÚT BROWSE --- */}
				<div style={{ display: "flex", flex: 2, gap: "5px" }}>
					<input
						value={newAppPath}
						onChange={(e) => setNewAppPath(e.target.value)}
						placeholder="Đường dẫn (vd: D:\projects\spring-boot)"
						style={{ flex: 1, minWidth: "0" }}
						required
						className="input-dark"
					/>
					<button
						type="button"
						onClick={handleBrowseFile}
						className="btn-primary"
						style={{
							background: "#555",
							padding: "0 12px",
						}}
						title="Chọn File"
					>
						📄
					</button>
					<button
						type="button"
						onClick={handleBrowseFolder}
						className="btn-primary"
						style={{
							background: "#555",
							padding: "0 12px",
						}}
						title="Chọn Thư mục"
					>
						📁
					</button>
				</div>
				{/* --- KẾT THÚC KHU VỰC ĐƯỜNG DẪN --- */}

				<button type="submit" className="btn-primary">
					+ Thêm
				</button>
			</form>

			{/* Danh sách Apps để Tick chọn */}
			<div
				className="app-grid"
				style={{
					display: "grid",
					gridTemplateColumns:
						"repeat(auto-fill, minmax(250px, 1fr))",
					gap: "15px",
				}}
			>
				{apps.map((app) => (
					<div
						key={app.id}
						onClick={() => app.id && toggleSelect(app.id)}
						style={{
							background: "#252526",
							padding: "15px",
							borderRadius: "8px",
							border: selectedApps.has(app.id!)
								? "2px solid #007acc"
								: "2px solid transparent",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "15px",
						}}
					>
						<input
							type="checkbox"
							checked={selectedApps.has(app.id!)}
							readOnly
							style={{
								width: "18px",
								height: "18px",
							}}
						/>
						<div style={{ fontSize: "24px" }}>{app.icon}</div>
						<div style={{ overflow: "hidden" }}>
							<div
								style={{
									fontWeight: "bold",
									color: "#fff",
								}}
							>
								{app.name}
							</div>
							<div
								style={{
									fontSize: "11px",
									color: "#858585",
									whiteSpace: "nowrap",
									textOverflow: "ellipsis",
									overflow: "hidden",
								}}
							>
								{app.path}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

export default Workspace;
