import { Editor } from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

type FormatResult = {
	format_type: string;
	is_valid: boolean;
	formatted_text: string;
	error_msg: string | null;
};

const SmartFormatter: React.FC = (): React.JSX.Element => {
	// --- Formatter State ---
		const [code, setCode] = useState<string>("");
		const [language, setLanguage] = useState<string>("plaintext");
		const [errorMsg, setErrorMsg] = useState<string | null>(null);

	// HÀM GỌI RUST ĐỂ AUTO-DETECT VÀ FORMAT CODE
	async function handleFormatCode() {
		try {
			const res: FormatResult = await invoke("detect_and_format", {
				rawText: code,
			});
			if (res.is_valid) {
				setCode(res.formatted_text);
				setLanguage(res.format_type); // Cập nhật ngôn ngữ cho Monaco highlight syntax
				setErrorMsg(null);
			} else {
				setLanguage(res.format_type);
				setErrorMsg(res.error_msg);
			}
		} catch (err) {
			setErrorMsg("Lỗi khi gọi Rust Core.");
		}
	}

	return (
		<div className="formatter-view">
			<div className="toolbar">
				<h2>Smart Formatter (Auto-detect JSON/XML/SQL/cURL)</h2>
				<button onClick={handleFormatCode} className="btn-primary">
					✨ Auto Format
				</button>
			</div>

			<div className="editor-status">
				Detected Language:{" "}
				<span className="badge">{language.toUpperCase()}</span>
				{errorMsg && <span className="error-text">⚠️ {errorMsg}</span>}
			</div>

			<div className="editor-container">
				<Editor
					height="100%"
					theme="vs-dark"
					language={language === "curl" || language === "unknown" ? "plaintext" : language}
					value={code}
					onChange={(value) => setCode(value || "")}
					options={{
						minimap: { enabled: false },
						fontSize: 14,
						wordWrap: "on",
					}}
				/>
			</div>
		</div>
	);
};

export default SmartFormatter;
