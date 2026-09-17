import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
	Rocket,
	FolderOpen,
	GitBranch,
	Coffee,
	Code2,
	Database,
	Globe,
	FileText,
	Folder,
	Plus,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "../components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import { cn } from "../lib/utils";

type AppItem = { id?: number; name: string; path: string; icon: string };

// Map các key icon (lưu trong DB) sang component Lucide tương ứng
// Giữ icon ở dạng key string để tương thích với field `icon: String` bên Rust
const ICON_MAP: Record<string, React.ElementType> = {
	folder: Folder,
	git: GitBranch,
	java: Coffee,
	vscode: Code2,
	database: Database,
	chrome: Globe,
};

const ICON_OPTIONS: { value: string; label: string }[] = [
	{ value: "folder", label: "Folder" },
	{ value: "git", label: "GitLab / Git" },
	{ value: "java", label: "IntelliJ / Java" },
	{ value: "vscode", label: "VS Code" },
	{ value: "database", label: "DBeaver / SQL" },
	{ value: "chrome", label: "Chrome" },
];

function AppIcon({ icon, className }: { icon: string; className?: string }) {
	const Icon = ICON_MAP[icon] ?? Folder;
	return <Icon className={className} />;
}

const Workspace: React.FC = (): React.JSX.Element => {
	// --- WORKSPACE LAUNCHER STATE ---
	const [apps, setApps] = useState<AppItem[]>([]);
	const [selectedApps, setSelectedApps] = useState<Set<number>>(new Set());
	const [newAppName, setNewAppName] = useState("");
	const [newAppPath, setNewAppPath] = useState("");
	const [newAppIcon, setNewAppIcon] = useState("folder");

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
		if (pathsToLaunch.length === 0) {
			alert("Vui lòng tick chọn ít nhất 1 ứng dụng!");
			return;
		}
		try {
			await invoke("launch_items", { paths: pathsToLaunch });
		} catch (error) {
			alert(error);
		}
	}

	// --- Xử lý chọn File/Folder bằng Native Dialog ---
	async function handleBrowseFile() {
		const selected = await open({
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
		<div className="flex flex-col gap-6 p-6">
			{/* Toolbar */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Rocket className="h-5 w-5 text-primary" />
					<h2 className="text-lg font-semibold tracking-tight">
						Workspace Launcher
					</h2>
				</div>
				<Button
					onClick={handleLaunchSelected}
					disabled={selectedApps.size === 0}
					className="gap-2"
				>
					<Rocket className="h-4 w-4" />
					Khởi động ({selectedApps.size})
				</Button>
			</div>

			{/* Form thêm App/Folder */}
			<Card>
				<CardContent className="pt-6">
					<form onSubmit={handleAddApp} className="flex flex-wrap items-end gap-3">
						<div className="flex flex-col gap-1.5">
							<label className="text-xs text-muted-foreground">Icon</label>
							<Select value={newAppIcon} onValueChange={setNewAppIcon}>
								<SelectTrigger className="w-[180px]">
									<SelectValue>
										<span className="flex items-center gap-2">
											<AppIcon icon={newAppIcon} className="h-4 w-4" />
											{ICON_OPTIONS.find((o) => o.value === newAppIcon)?.label}
										</span>
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{ICON_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											<span className="flex items-center gap-2">
												<AppIcon icon={opt.value} className="h-4 w-4" />
												{opt.label}
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
							<label className="text-xs text-muted-foreground">Tên</label>
							<Input
								value={newAppName}
								onChange={(e) => setNewAppName(e.target.value)}
								placeholder="vd: Backend Code"
								required
							/>
						</div>

						<div className="flex min-w-[280px] flex-[2] flex-col gap-1.5">
							<label className="text-xs text-muted-foreground">Đường dẫn</label>
							<div className="flex gap-1.5">
								<Input
									value={newAppPath}
									onChange={(e) => setNewAppPath(e.target.value)}
									placeholder="vd: D:\projects\spring-boot"
									required
									className="min-w-0 flex-1"
								/>
								<Button
									type="button"
									variant="secondary"
									size="icon"
									onClick={handleBrowseFile}
									title="Chọn File"
								>
									<FileText className="h-4 w-4" />
								</Button>
								<Button
									type="button"
									variant="secondary"
									size="icon"
									onClick={handleBrowseFolder}
									title="Chọn Thư mục"
								>
									<FolderOpen className="h-4 w-4" />
								</Button>
							</div>
						</div>

						<Button type="submit" className="gap-2">
							<Plus className="h-4 w-4" />
							Thêm
						</Button>
					</form>
				</CardContent>
			</Card>

			{/* Danh sách Apps để Tick chọn */}
			{apps.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
					<Folder className="h-8 w-8" />
					<p className="text-sm">Chưa có ứng dụng nào. Thêm một cái ở trên.</p>
				</div>
			) : (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
					{apps.map((app) => (
						<Card
							key={app.id}
							onClick={() => app.id && toggleSelect(app.id)}
							className={cn(
								"cursor-pointer gap-0 py-4 transition-colors hover:bg-accent/50",
								app.id && selectedApps.has(app.id)
									? "border-primary ring-1 ring-primary"
									: "border-border",
							)}
						>
							<CardContent className="flex items-center gap-3 px-4">
								<Checkbox
									checked={app.id ? selectedApps.has(app.id) : false}
									onCheckedChange={() => app.id && toggleSelect(app.id)}
									onClick={(e) => e.stopPropagation()}
								/>
								<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
									<AppIcon icon={app.icon} className="h-4.5 w-4.5" />
								</div>
								<div className="min-w-0">
									<div className="truncate font-medium">{app.name}</div>
									<div className="truncate text-xs text-muted-foreground">
										{app.path}
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
};

export default Workspace;