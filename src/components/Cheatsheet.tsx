import { useEffect, useMemo, useState } from "react";
import {
	Check,
	Clipboard,
	FolderPlus,
	Layers3,
	Pencil,
	Plus,
	Search,
	Terminal,
	Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";
import {
	AppIcon,
	IconPickerDialog,
	type IconName,
} from "./ui/IconPickerDialog";
import "./Cheatsheet.css";

type Group = { id: string; name: string; icon: IconName };
type Category = { id: string; groupId: string; name: string; icon: IconName };
type Command = { id: string; categoryId: string; cmd: string; desc: string };
type Library = { groups: Group[]; categories: Category[]; commands: Command[] };

const STORAGE_KEY = "dev-toolbox:command-library:v1";

const initialLibrary: Library = {
	groups: [
		{ id: "devops", name: "DevOps", icon: "cloud" },
		{ id: "development", name: "Development", icon: "code-2" },
	],
	categories: [
		{ id: "docker", groupId: "devops", name: "Docker", icon: "terminal" },
		{
			id: "kubernetes",
			groupId: "devops",
			name: "Kubernetes",
			icon: "layers-3",
		},
		{
			id: "spring",
			groupId: "development",
			name: "Spring Boot",
			icon: "code-2",
		},
	],
	commands: [
		{
			id: "docker-ps",
			categoryId: "docker",
			cmd: "docker ps -a --format 'table {{.Names}}\\t{{.Status}}'",
			desc: "Xem danh sách container dạng bảng.",
		},
		{
			id: "docker-prune",
			categoryId: "docker",
			cmd: "docker system prune -a --volumes",
			desc: "Dọn image, container và volume không dùng.",
		},
		{
			id: "k8s-pods",
			categoryId: "kubernetes",
			cmd: "kubectl get pods -A --sort-by='.status.startTime'",
			desc: "Liệt kê Pods theo thời gian tạo.",
		},
		{
			id: "k8s-forward",
			categoryId: "kubernetes",
			cmd: "kubectl port-forward svc/my-service 8080:80",
			desc: "Port forward từ Service về máy local.",
		},
		{
			id: "spring-run",
			categoryId: "spring",
			cmd: "mvn spring-boot:run -Dspring-boot.run.profiles=dev",
			desc: "Chạy Spring Boot với profile dev.",
		},
	],
};

const newId = () => crypto.randomUUID();

const Cheatsheet: React.FC = (): React.JSX.Element => {
	const [library, setLibrary] = useState<Library>(() => {
		try {
			return JSON.parse(
				localStorage.getItem(STORAGE_KEY) ?? "",
			) as Library;
		} catch {
			return initialLibrary;
		}
	});
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [searching, setSearching] = useState(false);
	const [groupFilter, setGroupFilter] = useState("all");
	const [categoryFilter, setCategoryFilter] = useState("all");
	const [notice, setNotice] = useState<string | null>(null);
	const [groupName, setGroupName] = useState("");
	const [groupIcon, setGroupIcon] = useState<IconName>("layers-3");
	const [categoryName, setCategoryName] = useState("");
	const [categoryGroup, setCategoryGroup] = useState("devops");
	const [categoryIcon, setCategoryIcon] = useState<IconName>("terminal");
	const [commandCategory, setCommandCategory] = useState("docker");
	const [commandText, setCommandText] = useState("");
	const [commandDescription, setCommandDescription] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingCommand, setEditingCommand] = useState("");
	const [editingDescription, setEditingDescription] = useState("");
	const [commandToDelete, setCommandToDelete] = useState<Command | null>(
		null,
	);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
	}, [library]);
	useEffect(() => {
		setSearching(true);
		const timer = window.setTimeout(() => {
			setDebouncedQuery(query);
			setSearching(false);
		}, 350);
		return () => window.clearTimeout(timer);
	}, [query]);
	useEffect(() => {
		if (!notice) return;
		const timer = window.setTimeout(() => setNotice(null), 10_000);
		return () => window.clearTimeout(timer);
	}, [notice]);

	const visibleCategories = useMemo(
		() =>
			library.categories.filter(
				(category) =>
					groupFilter === "all" || category.groupId === groupFilter,
			),
		[library.categories, groupFilter],
	);
	const visibleCommands = useMemo(() => {
		const needle = debouncedQuery.trim().toLocaleLowerCase();
		return library.commands.filter((command) => {
			const category = library.categories.find(
				(item) => item.id === command.categoryId,
			);
			const group = library.groups.find(
				(item) => item.id === category?.groupId,
			);
			return (
				(groupFilter === "all" || category?.groupId === groupFilter) &&
				(categoryFilter === "all" ||
					command.categoryId === categoryFilter) &&
				(!needle ||
					[
						command.cmd,
						command.desc,
						category?.name,
						group?.name,
					].some((text) =>
						text?.toLocaleLowerCase().includes(needle),
					))
			);
		});
	}, [library, debouncedQuery, groupFilter, categoryFilter]);

	const copy = async (command: string) => {
		await navigator.clipboard.writeText(command);
		setNotice(
			"Đã sao chép lệnh vào clipboard. Thông báo sẽ tự xoá sau 10 giây.",
		);
	};
	const removeCommand = (id: string) =>
		setLibrary((current) => ({
			...current,
			commands: current.commands.filter((command) => command.id !== id),
		}));
	const startEdit = (command: Command) => {
		setEditingId(command.id);
		setEditingCommand(command.cmd);
		setEditingDescription(command.desc);
	};
	const saveEdit = (id: string) => {
		if (!editingCommand.trim()) return;
		setLibrary((current) => ({
			...current,
			commands: current.commands.map((command) =>
				command.id === id
					? {
							...command,
							cmd: editingCommand.trim(),
							desc:
								editingDescription.trim() || "Không có mô tả.",
						}
					: command,
			),
		}));
		setEditingId(null);
	};
	const addGroup = (event: React.FormEvent) => {
		event.preventDefault();
		if (!groupName.trim()) return;
		const group = { id: newId(), name: groupName.trim(), icon: groupIcon };
		setLibrary((current) => ({
			...current,
			groups: [...current.groups, group],
		}));
		setCategoryGroup(group.id);
		setGroupName("");
	};
	const addCategory = (event: React.FormEvent) => {
		event.preventDefault();
		if (!categoryName.trim() || !categoryGroup) return;
		const category = {
			id: newId(),
			name: categoryName.trim(),
			groupId: categoryGroup,
			icon: categoryIcon,
		};
		setLibrary((current) => ({
			...current,
			categories: [...current.categories, category],
		}));
		setCommandCategory(category.id);
		setCategoryName("");
	};
	const addCommand = (event: React.FormEvent) => {
		event.preventDefault();
		if (!commandText.trim() || !commandCategory) return;
		setLibrary((current) => ({
			...current,
			commands: [
				...current.commands,
				{
					id: newId(),
					categoryId: commandCategory,
					cmd: commandText.trim(),
					desc: commandDescription.trim() || "Không có mô tả.",
				},
			],
		}));
		setCommandText("");
		setCommandDescription("");
	};

	return (
		<TooltipProvider>
			<div className="cheatsheet-view">
				<header className="cheatsheet-header">
					<div>
						<h2>
							<Terminal size={24} /> Quick Start / CLI
						</h2>
						<p>
							Thư viện lệnh theo nhóm và phân loại, lưu cục bộ
							trên thiết bị.
						</p>
					</div>
				</header>
				<div className="command-filters">
					<label className="command-search">
						<Search size={17} />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Tìm lệnh, mô tả, nhóm hoặc phân loại..."
						/>
						{searching && <span>Đang tìm...</span>}
					</label>
					<Select
						value={groupFilter}
						onValueChange={(value) => {
							setGroupFilter(value ?? "all");
							setCategoryFilter("all");
						}}
					>
						<SelectTrigger className="filter-select">
							<SelectValue placeholder="Tất cả nhóm" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Tất cả nhóm</SelectItem>
							{library.groups.map((group) => (
								<SelectItem key={group.id} value={group.id}>
									<AppIcon name={group.icon} size={14} />{" "}
									{group.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select
						value={categoryFilter}
						onValueChange={(value) => setCategoryFilter(value ?? "all")}
					>
						<SelectTrigger className="filter-select">
							<SelectValue placeholder="Tất cả phân loại" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">
								Tất cả phân loại
							</SelectItem>
							{visibleCategories.map((category) => (
								<SelectItem
									key={category.id}
									value={category.id}
								>
									<AppIcon name={category.icon} size={14} />{" "}
									{category.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="command-layout">
					<section className="command-results">
						{visibleCommands.length ? (
							visibleCommands.map((command) => {
								const category = library.categories.find(
									(item) => item.id === command.categoryId,
								);
								const group = library.groups.find(
									(item) => item.id === category?.groupId,
								);
								return (
									<article
										className="command-card"
										key={command.id}
									>
										<div className="command-meta">
											<span>
												<AppIcon
													name={
														group?.icon ??
														"terminal"
													}
													size={14}
												/>{" "}
												{group?.name}
											</span>
											<b>
												<AppIcon
													name={
														category?.icon ??
														"terminal"
													}
													size={14}
												/>{" "}
												{category?.name}
											</b>
										</div>
										<button
											className="command-code"
											onClick={() =>
												void copy(command.cmd)
											}
											title="Click để sao chép lệnh"
										>
											<code>$ {command.cmd}</code>
											<span className="command-copy-hint">
												<Clipboard size={15} />
											</span>
										</button>
										{editingId === command.id ? (
											<div className="command-edit">
												<textarea
													value={editingCommand}
													onChange={(event) =>
														setEditingCommand(
															event.target.value,
														)
													}
												/>
												<input
													value={editingDescription}
													onChange={(event) =>
														setEditingDescription(
															event.target.value,
														)
													}
													placeholder="Mô tả"
												/>
												<div>
													<Button
														size="sm"
														onClick={() =>
															saveEdit(command.id)
														}
													>
														<Check size={15} /> Lưu
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() =>
															setEditingId(null)
														}
													>
														Huỷ
													</Button>
												</div>
											</div>
										) : (
											<p>{command.desc}</p>
										)}
										<div className="command-footer">
											<Button
												size="sm"
												className="command-copy-btn"
												onClick={() =>
													void copy(command.cmd)
												}
											>
												<Clipboard size={15} /> Sao chép
											</Button>
											<div className="command-actions">
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															onClick={() =>
																startEdit(
																	command,
																)
															}
															aria-label="Chỉnh sửa lệnh"
														>
															<Pencil size={15} />
														</Button>
													</TooltipTrigger>
													<TooltipContent>
														Chỉnh sửa
													</TooltipContent>
												</Tooltip>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															className="command-delete-btn"
															onClick={() =>
																setCommandToDelete(
																	command,
																)
															}
															aria-label="Xoá lệnh"
														>
															<Trash2 size={15} />
														</Button>
													</TooltipTrigger>
													<TooltipContent>
														Xoá
													</TooltipContent>
												</Tooltip>
											</div>
										</div>
									</article>
								);
							})
						) : (
							<div className="empty-commands">
								Không tìm thấy lệnh phù hợp.
							</div>
						)}
					</section>
					<aside className="command-add">
						<h3>Thêm nội dung</h3>
						<form onSubmit={addGroup}>
							<h4>
								<FolderPlus size={15} /> Nhóm mới
							</h4>
							<input
								value={groupName}
								onChange={(event) =>
									setGroupName(event.target.value)
								}
								placeholder="Ví dụ: Database"
							/>
							<IconPickerDialog
								value={groupIcon}
								onChange={setGroupIcon}
							/>
							<Button
								className="add-submit"
								size="sm"
								type="submit"
							>
								<Plus size={15} /> Thêm nhóm
							</Button>
						</form>
						<form onSubmit={addCategory}>
							<h4>
								<Layers3 size={15} /> Phân loại mới
							</h4>
							<Select
								value={categoryGroup}
							onValueChange={(value) => setCategoryGroup(value ?? "")}
							>
								<SelectTrigger>
									<SelectValue placeholder="Chọn nhóm" />
								</SelectTrigger>
								<SelectContent>
									{library.groups.map((group) => (
										<SelectItem
											key={group.id}
											value={group.id}
										>
											{group.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<input
								value={categoryName}
								onChange={(event) =>
									setCategoryName(event.target.value)
								}
								placeholder="Ví dụ: PostgreSQL"
							/>
							<IconPickerDialog
								value={categoryIcon}
								onChange={setCategoryIcon}
							/>
							<Button
								className="add-submit"
								size="sm"
								type="submit"
							>
								<Plus size={15} /> Thêm phân loại
							</Button>
						</form>
						<form onSubmit={addCommand}>
							<h4>
								<Terminal size={15} /> Lệnh mới
							</h4>
							<Select
								value={commandCategory}
							onValueChange={(value) => setCommandCategory(value ?? "")}
							>
								<SelectTrigger>
									<SelectValue placeholder="Chọn phân loại" />
								</SelectTrigger>
								<SelectContent>
									{library.categories.map((category) => (
										<SelectItem
											key={category.id}
											value={category.id}
										>
											{category.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<textarea
								value={commandText}
								onChange={(event) =>
									setCommandText(event.target.value)
								}
								placeholder="docker compose up -d"
							/>
							<input
								value={commandDescription}
								onChange={(event) =>
									setCommandDescription(event.target.value)
								}
								placeholder="Mô tả ngắn"
							/>
							<Button
								className="add-submit"
								size="sm"
								type="submit"
							>
								<Plus size={15} /> Thêm lệnh
							</Button>
						</form>
					</aside>
				</div>
				{notice && (
					<div className="command-toast">
						<Check size={17} /> {notice}
					</div>
				)}
				{commandToDelete && (
					<div
						className="confirm-backdrop"
						role="presentation"
						onMouseDown={() => setCommandToDelete(null)}
					>
						<div
							className="confirm-dialog"
							role="dialog"
							aria-modal="true"
							aria-labelledby="delete-command-title"
							onMouseDown={(event) => event.stopPropagation()}
						>
							<h3 id="delete-command-title">Xoá lệnh này?</h3>
							<p>
								Lệnh <code>{commandToDelete.cmd}</code> sẽ bị
								xoá khỏi thư viện cục bộ.
							</p>
							<div className="confirm-actions">
								<Button
									variant="secondary"
									onClick={() => setCommandToDelete(null)}
								>
									Huỷ
								</Button>
								<Button
									variant="destructive"
									onClick={() => {
										removeCommand(commandToDelete.id);
										setCommandToDelete(null);
										setNotice("Đã xoá lệnh.");
									}}
								>
									<Trash2 size={15} /> Xoá lệnh
								</Button>
							</div>
						</div>
					</div>
				)}
			</div>
		</TooltipProvider>
	);
};
export default Cheatsheet;
