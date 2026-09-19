/** Identifiers for the tools shown in the application's sidebar. */
export type AppTab =
	| "workspace"
	| "ansible"
	| "formatter"
	| "vault"
	| "cheatsheet"
	| "excel"
	| "diff"
	| "docker"
	| "writer"
	| "jenkins"
	| "notebook"
	| "fakeDataGenerator"
	| "timeConverter"
	| "commands"
	| "apiClient"
	| "websocketSse"
	| "jwtInspector"
	| "kubernetes"
	| "networkToolbox"
	| "cronBuilder"
	| "tlsChecker"
	| "database"
	| "redis"
	| "kafka"
	| "logAnalyzer"
	| "springBootInspector"
	| "portProcessInspector"
	| "environmentDiff"
	| "secretScanner"
	| "hashGenerator"
	| "settings";

/** A reusable sidebar navigation item. */
export interface NavigationItem {
	id: AppTab;
	label: string;
}

/** Public credential metadata. Keep secrets out of this UI-facing type. */
export interface Credential {
	id: number;
	name: string;
	username: string;
}

/** Data and callbacks required by the Vault view. */
export interface VaultProps {
	credentials: Credential[];
	searchQuery: string;
	onSearchQueryChange: (query: string) => void;
	onCredentialSaved: () => Promise<void>;
}
