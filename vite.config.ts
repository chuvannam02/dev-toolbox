import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
	plugins: [react(), tailwindcss()],
	build: {
		cssCodeSplit: true,
		reportCompressedSize: false,
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (!id.includes("node_modules")) return;
					if (id.includes("@monaco-editor") || id.includes("monaco-editor")) return "monaco";
					if (id.includes("react-quill-new") || id.includes("quill")) return "rich-text-editor";
					if (id.includes("react-day-picker") || id.includes("date-fns")) return "calendar";
					if (id.includes("@tauri-apps")) return "tauri";
				},
			},
		},
	},
	// Heavy editors are loaded only after the respective tool tab is opened.
	// Excluding them avoids Vite's dependency optimizer doing this work on first dev start.
	optimizeDeps: {
		exclude: ["@monaco-editor/react", "monaco-editor", "react-quill-new", "quill"],
	},

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent Vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: "ws",
					host,
					port: 1421,
				}
			: undefined,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**", "**/dist/**", "**/node_modules/**"],
		},
	},
}));
