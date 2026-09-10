import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
	fakeDataGenerator: FakeDataGenerator
} as const;

function App() {
	const [activeTab, setActiveTab] = useState<AppTab>("workspace");
	const [credentials, setCredentials] = useState<Credential[]>([]);

	async function loadCredentials() {
		try {
			const data: Credential[] = await invoke("get_credentials");
			setCredentials(data);
		} catch (error) {
			console.error("Unable to load credentials:", error);
		}
	}

	const [searchVault, setSearchVault] = useState("");

	const filteredCredentials = useMemo(() => {
		const query = searchVault.trim().toLowerCase();
		if (!query) return credentials;

		return credentials.filter(
			(credential) =>
				credential.name.toLowerCase().includes(query) ||
				credential.username.toLowerCase().includes(query),
		);
	}, [credentials, searchVault]);

	useEffect(() => {
		if (activeTab === "vault") void loadCredentials();
		// if (activeTab === "workspace") loadApps();
	}, [activeTab]);

	const renderActiveTab = () => {
		if (activeTab === "vault") {
			return (
				<Vault
					credentials={filteredCredentials}
					searchQuery={searchVault}
					onSearchQueryChange={setSearchVault}
					onCredentialSaved={loadCredentials}
				/>
			);
		}

		const Component = TAB_COMPONENTS[activeTab];

		return <Component />;
	};

	return (
		<div className="workbench">
			<div className="sidebar">
				<h3 className="sidebar-title">Dev Toolbox</h3>
				{NAVIGATION_ITEMS.map(({ id, label }) => (
					<button
						key={id}
						className={`nav-btn ${activeTab === id ? "active" : ""}`}
						onClick={() => setActiveTab(id)}
					>
						{label}
					</button>
				))}

				{activeTab === "vault" && (
					<div style={{ marginTop: "20px" }}>
						<input
							type="text"
							placeholder="🔍 Tìm Server, Tài khoản..."
							value={searchVault}
							onChange={(e) => setSearchVault(e.target.value)}
							style={{
								width: "100%",
								padding: "8px",
								background: "#3c3c3c",
								color: "#fff",
								border: "none",
								borderRadius: "4px",
								marginBottom: "10px",
							}}
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
			</div>

			<div className="main-panel">
				<Suspense fallback={<div className="loading">Loading...</div>}>
					{renderActiveTab()}
				</Suspense>
			</div>
		</div>
	);
}

export default App;
