import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { Button } from "../../ui/button";
import {
	ResizablePanel,
	ResizablePanelGroup,
	ResizableHandle,
} from "../../ui/resizable";
import { ConfigTree } from "./ConfigTree";
import { ProblemsPanel } from "./ProblemsPanel";
import type { NginxParseResult } from "./types";

const SAMPLE_CONFIG = `http {
    server {
        listen 443 ssl;
        server_name api.example.com;

        location /api {
            proxy_pass http://backend;
        }
    }
}
`;

/**
 * Trang chính của Nginx Studio (Phase 1: Editor + Validate + Config Tree).
 * Debounce 400ms sau khi gõ rồi gọi command Rust `nginx_parse` (static, không cần
 * cài nginx trên máy) để lint + dựng tree theo thời gian thực.
 */
const NginxStudioPage: React.FC = () => {
	const [content, setContent] = useState(SAMPLE_CONFIG);
	const [result, setResult] = useState<NginxParseResult>({
		tree: [],
		issues: [],
	});
	const [activeLine, setActiveLine] = useState<number | undefined>(undefined);
	const [editorApi, setEditorApi] = useState<{
		revealLine: (l: number) => void;
	} | null>(null);

	useEffect(() => {
		const handle = setTimeout(async () => {
			try {
				const parsed = await invoke<NginxParseResult>("nginx_parse", {
					content,
				});
				setResult(parsed);
			} catch (err) {
				console.error("nginx_parse failed", err);
			}
		}, 400);
		return () => clearTimeout(handle);
	}, [content]);

	function goToLine(line: number) {
		setActiveLine(line);
		editorApi?.revealLine(line);
	}

	async function runBundledTest() {
		try {
			const res = await invoke<{
				success: boolean;
				stdout: string;
				stderr: string;
			}>("nginx_bundled_test", { configPath: null });
			const output = [res.stdout, res.stderr]
				.filter(Boolean)
				.join("\n")
				.trim();
			alert(
				res.success
					? "nginx -t: OK\n" + output
					: "nginx -t: FAILED\n" + output,
			);
		} catch (err) {
			alert(
				"Không chạy được nginx -t (có thể máy chưa cài nginx). Đang dùng static validator thay thế.\n" +
					String(err),
			);
		}
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b px-3 py-2">
				<span className="text-sm font-medium">Nginx Studio</span>
				<Button size="sm" onClick={runBundledTest}>
					Test Config ▶
				</Button>
			</div>

			<ResizablePanelGroup orientation="horizontal" className="flex-1">
				<ResizablePanel defaultSize={22} minSize={15}>
					<ConfigTree
						tree={result.tree}
						issues={result.issues}
						activeLine={activeLine}
						onSelectLine={goToLine}
					/>
				</ResizablePanel>
				<ResizableHandle />
				<ResizablePanel defaultSize={78}>
					<div className="flex h-full flex-col">
						<div className="flex-1">
							<Editor
								height="100%"
								language="nginx"
								theme="vs-dark"
								value={content}
								onChange={(v) => setContent(v ?? "")}
								onMount={(editor) =>
									setEditorApi({
										revealLine: (line: number) => {
											editor.revealLineInCenter(line);
											editor.setPosition({
												lineNumber: line,
												column: 1,
											});
										},
									})
								}
								options={{
									minimap: { enabled: false },
									fontSize: 13,
								}}
							/>
						</div>
						<ProblemsPanel
							issues={result.issues}
							onSelectLine={goToLine}
						/>
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}

export default NginxStudioPage;
