export const settingsStore = {
	async getMouseSensitivity(): Promise<number> {
		return Number(localStorage.getItem("mouseSensitivity")) || 1.0;
	},

	async setMouseSensitivity(value: number) {
		localStorage.setItem("mouseSensitivity", String(value));
	},

	async getDarkMode(): Promise<boolean> {
		return localStorage.getItem("darkMode") === "true";
	},

	async setDarkMode(value: boolean) {
		localStorage.setItem("darkMode", String(value));
	},
};
