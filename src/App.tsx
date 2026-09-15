import {
	lazy,
	Suspense,
	useEffect,
	useMemo,
	useState,
	type ComponentType,
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
	WandSparkles,
} from "lucide-react";
import "./App.css";
import { AppTab, Credential } from "./types/App.type";
import { NAVIGATION_ITEMS } from "./constants/navigation";

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
};

function App() {
	const [activeTab, setActiveTab] = useState<AppTab>("workspace");
	const [credentials, setCredentials] = useState<Credential[]>([]);
	const [searchVault, setSearchVault] = useState("");
	const [darkMode, setDarkMode] = useState(
		() => localStorage.getItem("darkMode") === "true",
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
		<div className="workbench">
			<aside className="sidebar">
				<div className="sidebar-header">
					<h3 className="sidebar-title">Dev Toolbox</h3>
					<button
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
					</button>
				</div>
				<nav>
					{NAVIGATION_ITEMS.map(({ id, label }) => {
						const Icon = NAVIGATION_ICONS[id];
						return (
							<button
								key={id}
								className={`nav-btn ${activeTab === id ? "active" : ""}`}
								onClick={() => setActiveTab(id)}
							>
								<Icon size={16} />
								<span>{label}</span>
							</button>
						);
					})}
				</nav>
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
				<Suspense fallback={<div className="loading">Loading...</div>}>
					{renderActiveTab()}
				</Suspense>
			</main>
		</div>
	);
}
export default App;
