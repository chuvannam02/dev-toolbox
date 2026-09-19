export type DockerContainer = {
	id: string;
	name: string;
	status: string;
	image: string;
};

export type AuthType = "key" | "password";

export type SshConfig = {
	enabled: boolean;
	host: string;
	user: string;
	port: number;

	authType: AuthType;

	keyPath?: string;
	password?: string;

	useSudo: boolean;
	sudoPassword?: string;
};

export type InstallKeyResult = {
	keyPath: string;
	message: string;
};

export type DockerServerProfile = {
	id: string;
	name: string;

	host: string;
	user: string;
	port: number;

	authType: AuthType;

	/**
	 * Có thể persist.
	 * Không chứa password.
	 */
	keyPath: string;

	useSudo: boolean;
};