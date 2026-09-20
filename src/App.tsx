import {
	lazy,
	Suspense,
	useEffect,
	useMemo,
	useState,
	type ComponentType,
	type DragEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
	BookOpen,
	Bot,
	Boxes,
	Braces,
	Code2,
	FileDiff,
	FileSpreadsheet,
	FolderKanban,
	KeyRound,
	Moon,
	Rocket,
	Sun,
	TerminalSquare,
	Clock3,
	ChevronDown,
	GripVertical,
	Pin,
	PinOff,
	Star,
	WandSparkles,
	Settings,
	PanelLeftClose,
	PanelLeftOpen,
} from "lucide-react";
import "./App.css";
import { AppTab, Credential } from "./types/App.type";
import { NAVIGATION_ITEMS } from "./constants/navigation";
import { Button } from "./components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./components/ui/tooltip";

const NAVIGATION_GROUPS = [
	{ id: "workspace", label: "Workspace", tabs: ["workspace", "notebook"] },
	{
		id: "development",
		label: "Development",
		tabs: [
			"apiClient",
			"websocketSse",
			"jwtInspector",
			"formatter",
			"diff",
			"fakeDataGenerator",
			"commands",
		],
	},
	{
		id: "devops",
		label: "DevOps",
		tabs: [
			"docker",
			"kubernetes",
			"ansible",
			"jenkins",
			"networkToolbox",
			"cronBuilder",
			"tlsChecker",
		],
	},
	{
		id: "data",
		label: "Data",
		tabs: ["database", "redis", "kafka", "excel"],
	},
	{
		id: "debugging",
		label: "Debugging",
		tabs: [
			"logAnalyzer",
			"springBootInspector",
			"portProcessInspector",
			"environmentDiff",
		],
	},
	{
		id: "security",
		label: "Security",
		tabs: ["vault", "secretScanner", "jwtInspector", "hashGenerator"],
	},
	{
		id: "quick-tools",
		label: "Quick Tools",
		tabs: ["cheatsheet", "timeConverter", "writer"],
	},
] as const satisfies ReadonlyArray<{
	id: string;
	label: string;
	tabs: readonly AppTab[];
}>;

const FAVORITES_STORAGE_KEY = "dev-toolbox:favorites";
const COLLAPSED_GROUPS_STORAGE_KEY = "dev-toolbox:collapsed-groups";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "dev-toolbox:sidebar-collapsed";

const BilingualWriter = lazy(() => import("./components/BilingualWriter"));
const JenkinsController = lazy(() => import("./components/JenkinsController"));
const SmartFormatter = lazy(() => import("./components/SmartFormatter"));
const CompareFiles = lazy(() => import("./components/CompareFiles"));
const JsonToExcel = lazy(() => import("./components/JsonToExcel"));
const Cheatsheet = lazy(() => import("./components/Cheatsheet"));
const Vault = lazy(() => import("./components/Vault"));
const Workspace = lazy(() => import("./components/Workspace"));
const DockerLogs = lazy(() => import("./components/DockerLogs"));
const AnsibleAutomation = lazy(() => import("./components/AnsibleAutomation"));
const Notebook = lazy(() => import("./components/Notebook"));
const FakeDataGenerator = lazy(() => import("./components/FakeDataGenerator"));
const TimeConverter = lazy(() => import("./components/TimeConverter"));
const Commands = lazy(() => import("./components/commands/Commands"));
const ApiClient = lazy(() => import("./components/tools/ApiClient"));
const WebSocketSse = lazy(() => import("./components/tools/WebSocketSse"));
const JwtInspector = lazy(() => import("./components/tools/JwtInspector"));
const Kubernetes = lazy(() => import("./components/tools/Kubernetes"));
const NetworkToolbox = lazy(() => import("./components/tools/NetworkToolbox"));
const CronBuilder = lazy(() => import("./components/tools/CronBuilder"));
const TlsChecker = lazy(() => import("./components/tools/TlsChecker"));
const Database = lazy(() => import("./components/tools/Database"));
const Redis = lazy(() => import("./components/tools/Redis"));
const Kafka = lazy(() => import("./components/tools/Kafka"));
const LogAnalyzer = lazy(() => import("./components/tools/LogAnalyzer"));
const SpringBootInspector = lazy(
	() => import("./components/tools/SpringBootInspector"),
);
const PortProcessInspector = lazy(
	() => import("./components/tools/PortProcessInspector"),
);
const EnvironmentDiff = lazy(
	() => import("./components/tools/EnvironmentDiff"),
);
const SecretScanner = lazy(() => import("./components/tools/SecretScanner"));
const HashGenerator = lazy(() => import("./components/tools/HashGenerator"));
const SystemSettings = lazy(() => import("./components/SystemSettings"));

const TAB_COMPONENTS = {
	docker: DockerLogs,
	workspace: Workspace,
	ansible: AnsibleAutomation,
	writer: BilingualWriter,
	jenkins: JenkinsController,
	formatter: SmartFormatter,
	diff: CompareFiles,
	excel: JsonToExcel,
	cheatsheet: Cheatsheet,
	notebook: Notebook,
	fakeDataGenerator: FakeDataGenerator,
	timeConverter: TimeConverter,
	commands: Commands,
	apiClient: ApiClient,
	websocketSse: WebSocketSse,
	jwtInspector: JwtInspector,
	kubernetes: Kubernetes,
	networkToolbox: NetworkToolbox,
	cronBuilder: CronBuilder,
	tlsChecker: TlsChecker,
	database: Database,
	redis: Redis,
	kafka: Kafka,
	logAnalyzer: LogAnalyzer,
	springBootInspector: SpringBootInspector,
	portProcessInspector: PortProcessInspector,
	environmentDiff: EnvironmentDiff,
	secretScanner: SecretScanner,
	hashGenerator: HashGenerator,
	settings: SystemSettings,
} as const;

const NAVIGATION_ICONS: Record<AppTab, ComponentType<{ size?: number }>> = {
	docker: Boxes,
	workspace: FolderKanban,
	ansible: Bot,
	writer: WandSparkles,
	jenkins: Rocket,
	formatter: Braces,
	diff: FileDiff,
	excel: FileSpreadsheet,
	cheatsheet: TerminalSquare,
	vault: KeyRound,
	notebook: BookOpen,
	fakeDataGenerator: Code2,
	timeConverter: Clock3,
	commands: Code2,
	apiClient: Code2,
	websocketSse: Code2,
	jwtInspector: KeyRound,
	kubernetes: Boxes,
	networkToolbox: TerminalSquare,
	cronBuilder: Clock3,
	tlsChecker: KeyRound,
	database: FileSpreadsheet,
	redis: Code2,
	kafka: Code2,
	logAnalyzer: TerminalSquare,
	springBootInspector: Bot,
	portProcessInspector: TerminalSquare,
	environmentDiff: FileDiff,
	secretScanner: KeyRound,
	hashGenerator: Braces,
	settings: Settings,
};

function App() {
	const [activeTab, setActiveTab] = useState<AppTab>("workspace");
	const [credentials, setCredentials] = useState<Credential[]>([]);
	const [searchVault, setSearchVault] = useState("");
	const [darkMode, setDarkMode] = useState(
		() => localStorage.getItem("darkMode") === "true",
	);
	const [favoriteTabs, setFavoriteTabs] = useState<AppTab[]>(() => {
		try {
			return JSON.parse(
				localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]",
			) as AppTab[];
		} catch {
			return [];
		}
	});
	const [collapsedGroups, setCollapsedGroups] = useState<string[]>(() => {
		try {
			return JSON.parse(
				localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY) ?? "[]",
			) as string[];
		} catch {
			return [];
		}
	});
	const [isFavoriteDropActive, setIsFavoriteDropActive] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(
		() => localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true",
	);
	const navigationById = useMemo(
		() => new Map(NAVIGATION_ITEMS.map((item) => [item.id, item])),
		[],
	);
	async function loadCredentials() {
		try {
			setCredentials(await invoke<Credential[]>("get_credentials"));
		} catch (error) {
			console.error("Unable to load credentials:", error);
		}
	}
	const filteredCredentials = useMemo(() => {
		const query = searchVault.trim().toLowerCase();
		return query
			? credentials.filter(
					(credential) =>
						credential.name.toLowerCase().includes(query) ||
						credential.username.toLowerCase().includes(query),
				)
			: credentials;
	}, [credentials, searchVault]);
	useEffect(() => {
		if (activeTab === "vault") void loadCredentials();
	}, [activeTab]);
	useEffect(() => {
		document.documentElement.classList.toggle("dark", darkMode);
		localStorage.setItem("darkMode", String(darkMode));
	}, [darkMode]);
	useEffect(() => {
		localStorage.setItem(
			FAVORITES_STORAGE_KEY,
			JSON.stringify(favoriteTabs),
		);
	}, [favoriteTabs]);
	useEffect(() => {
		localStorage.setItem(
			COLLAPSED_GROUPS_STORAGE_KEY,
			JSON.stringify(collapsedGroups),
		);
	}, [collapsedGroups]);
	useEffect(() => {
		localStorage.setItem(
			SIDEBAR_COLLAPSED_STORAGE_KEY,
			String(sidebarCollapsed),
		);
	}, [sidebarCollapsed]);
	const toggleFavorite = (tab: AppTab) => {
		setFavoriteTabs((current) =>
			current.includes(tab)
				? current.filter((item) => item !== tab)
				: [...current, tab],
		);
	};
	const toggleGroup = (groupId: string) => {
		setCollapsedGroups((current) =>
			current.includes(groupId)
				? current.filter((item) => item !== groupId)
				: [...current, groupId],
		);
	};
	const addFavoriteFromDrop = (event: DragEvent<HTMLElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setIsFavoriteDropActive(false);
		const tab = (event.dataTransfer.getData(
			"application/dev-toolbox-tab",
		) || event.dataTransfer.getData("text/plain")) as AppTab;
		if (navigationById.has(tab)) {
			setFavoriteTabs((current) =>
				current.includes(tab) ? current : [...current, tab],
			);
		}
	};
	const startFavoriteDrag = (event: DragEvent<HTMLElement>, tab: AppTab) => {
		event.dataTransfer.effectAllowed = "copyMove";
		event.dataTransfer.clearData();
		event.dataTransfer.setData("application/dev-toolbox-tab", tab);
		event.dataTransfer.setData("text/plain", tab);
	};
	const allowFavoriteDrop = (event: DragEvent<HTMLElement>) => {
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = "copy";
		setIsFavoriteDropActive(true);
	};
	const renderActiveTab = () => {
		if (activeTab === "vault")
			return (
				<Vault
					credentials={filteredCredentials}
					searchQuery={searchVault}
					onSearchQueryChange={setSearchVault}
					onCredentialSaved={loadCredentials}
				/>
			);
		const Component = TAB_COMPONENTS[activeTab];
		return <Component />;
	};

	return (
		<TooltipProvider>
			<div className="workbench">
				<aside
					className={`sidebar ${sidebarCollapsed ? "is-collapsed" : ""}`}
				>
					<div className="sidebar-header">
						<h3 className="sidebar-title">Dev Toolbox</h3>
						<Button
							variant="ghost"
							size="icon"
							className="theme-toggle"
							onClick={() => setDarkMode((current) => !current)}
							title={
								darkMode
									? "Chuyển sang giao diện sáng"
									: "Chuyển sang giao diện tối"
							}
							aria-label={
								darkMode
									? "Chuyển sang giao diện sáng"
									: "Chuyển sang giao diện tối"
							}
						>
							{darkMode ? <Sun size={17} /> : <Moon size={17} />}
						</Button>
					</div>
					<nav className="sidebar-navigation" aria-label="Chức năng">
						<section
							className={`favorites-dropzone ${isFavoriteDropActive ? "drag-active" : ""}`}
							onDragEnterCapture={allowFavoriteDrop}
							onDragOverCapture={allowFavoriteDrop}
							onDragLeave={(event) => {
								if (
									!event.currentTarget.contains(
										event.relatedTarget as Node,
									)
								) {
									setIsFavoriteDropActive(false);
								}
							}}
							onDropCapture={addFavoriteFromDrop}
						>
							<div className="nav-group-heading">
								<Star size={14} fill="currentColor" /> Yêu thích
							</div>
							{favoriteTabs.length ? (
								favoriteTabs.map((id) => {
									const item = navigationById.get(id);
									if (!item) return null;
									const Icon = NAVIGATION_ICONS[id];
									return (
										<div className="nav-item-row" key={id}>
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														className={`nav-btn ${activeTab === id ? "active" : ""}`}
														onClick={() =>
															setActiveTab(id)
														}
													>
														<Icon size={16} />
														<span>
															{item.label}
														</span>
													</button>
												</TooltipTrigger>
												<TooltipContent side="right">
													{item.label}
												</TooltipContent>
											</Tooltip>
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="pin-btn"
														onClick={() =>
															toggleFavorite(id)
														}
														aria-label={`Bỏ ghim ${item.label}`}
													>
														<PinOff size={14} />
													</Button>
												</TooltipTrigger>
												<TooltipContent side="right">
													Bỏ khỏi Yêu thích
												</TooltipContent>
											</Tooltip>
										</div>
									);
								})
							) : (
								<p className="favorites-hint">
									Kéo một chức năng vào đây
								</p>
							)}
							<div className="favorites-drop-message">
								<GripVertical size={16} /> Kéo và thả chức năng
								vào vùng này
							</div>
						</section>
						{NAVIGATION_GROUPS.map((group) => {
							const isCollapsed = collapsedGroups.includes(
								group.id,
							);
							return (
								<section className="nav-group" key={group.id}>
									<button
										className="nav-group-toggle"
										onClick={() => toggleGroup(group.id)}
										aria-expanded={!isCollapsed}
									>
										<span>{group.label}</span>
										<ChevronDown
											size={16}
											className={
												isCollapsed
													? "caret collapsed"
													: "caret"
											}
										/>
									</button>
									{(!isCollapsed || sidebarCollapsed) && (
										<div className="nav-group-items">
											{group.tabs.map((id) => {
												const item =
													navigationById.get(id);
												if (!item) return null;
												const Icon =
													NAVIGATION_ICONS[id];
												const isFavorite =
													favoriteTabs.includes(id);
												return (
													<div
														className="nav-item-row"
														key={id}
													>
														<Tooltip>
															<TooltipTrigger
																asChild
															>
																<span
																	className="drag-handle"
																	draggable
																	role="button"
																	tabIndex={0}
																	aria-label={`Kéo ${item.label} vào Yêu thích`}
																	onDragStart={(
																		event,
																	) =>
																		startFavoriteDrag(
																			event,
																			id,
																		)
																	}
																	onDragEnd={() =>
																		setIsFavoriteDropActive(
																			false,
																		)
																	}
																>
																	<GripVertical
																		size={
																			14
																		}
																	/>
																</span>
															</TooltipTrigger>
															<TooltipContent side="right">
																Kéo vào Yêu
																thích
															</TooltipContent>
														</Tooltip>
														<Tooltip>
															<TooltipTrigger
																asChild
															>
																<button
																	draggable
																	className={`nav-btn ${activeTab === id ? "active" : ""}`}
																	onDragStart={(
																		event,
																	) =>
																		startFavoriteDrag(
																			event,
																			id,
																		)
																	}
																	onDragEnd={() =>
																		setIsFavoriteDropActive(
																			false,
																		)
																	}
																	onClick={() =>
																		setActiveTab(
																			id,
																		)
																	}
																>
																	<Icon
																		size={
																			16
																		}
																	/>
																	<span>
																		{
																			item.label
																		}
																	</span>
																</button>
															</TooltipTrigger>
															<TooltipContent side="right">
																{item.label}
															</TooltipContent>
														</Tooltip>
														<Tooltip>
															<TooltipTrigger
																asChild
															>
																<Button
																	variant="ghost"
																	size="icon"
																	className="pin-btn"
																	onClick={() =>
																		toggleFavorite(
																			id,
																		)
																	}
																	aria-label={`${isFavorite ? "Bỏ ghim" : "Ghim"} ${item.label}`}
																>
																	<Pin
																		size={
																			14
																		}
																		fill={
																			isFavorite
																				? "currentColor"
																				: "none"
																		}
																	/>
																</Button>
															</TooltipTrigger>
															<TooltipContent side="right">
																{isFavorite
																	? "Bỏ khỏi Yêu thích"
																	: "Ghim lên Yêu thích"}
															</TooltipContent>
														</Tooltip>
													</div>
												);
											})}
										</div>
									)}
								</section>
							);
						})}
					</nav>
					<div className="sidebar-footer">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									className={`nav-btn ${activeTab === "settings" ? "active" : ""}`}
									onClick={() => setActiveTab("settings")}
								>
									<Settings size={16} />
									<span>Cài đặt hệ thống</span>
								</button>
							</TooltipTrigger>
							<TooltipContent side="right">
								Cài đặt hệ thống
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									className="nav-btn sidebar-collapse-toggle"
									onClick={() =>
										setSidebarCollapsed(
											(current) => !current,
										)
									}
									aria-label={
										sidebarCollapsed
											? "Mở rộng menu"
											: "Thu gọn menu"
									}
								>
									{sidebarCollapsed ? (
										<>
											<PanelLeftOpen size={17} />
											<span>Thu gọn</span>
										</>
									) : (
										<>
											<PanelLeftClose size={17} />
											<span>Thu gọn</span>
										</>
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side="right">
								{sidebarCollapsed
									? "Mở rộng menu"
									: "Thu gọn menu"}
							</TooltipContent>
						</Tooltip>
					</div>
					{activeTab === "vault" && (
						<div className="vault-search">
							<input
								type="text"
								placeholder="Tìm server, tài khoản..."
								value={searchVault}
								onChange={(e) => setSearchVault(e.target.value)}
							/>
							<ul className="cred-list">
								{filteredCredentials.map((c) => (
									<li key={c.id}>
										<strong>{c.name}</strong>
										<span>{c.username}</span>
									</li>
								))}
							</ul>
						</div>
					)}
				</aside>
				<main className="main-panel">
					<Suspense
						fallback={<div className="loading">Loading...</div>}
					>
						{renderActiveTab()}
					</Suspense>
				</main>
			</div>
		</TooltipProvider>
	);
}
export default App;
