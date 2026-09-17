import { Editor } from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

const JsonToExcel: React.FC = (): React.JSX.Element => {
	// --- JSON to Excel State ---
	const [jsonInput, setJsonInput] = useState("");
	const [arrayPath, setArrayPath] = useState("");
	const [exportMsg, setExportMsg] = useState("");
	const [csvInput, setCsvInput] = useState("");

	async function handleExportExcel() {
		try {
			setExportMsg("Đang xử lý...");
			// Gọi command json_to_excel của Rust
			const savedPath: string = await invoke("json_to_excel", {
				jsonText: jsonInput,
				arrayPath: arrayPath,
			});
			setExportMsg(`✅ Đã xuất file thành công tại: ${savedPath}`);
		} catch (err: any) {
			setExportMsg(`❌ Lỗi: ${err}`);
		}
	}

	// Bổ sung luồng gọi CSV to Excel
	async function handleExportCSV() {
		try {
			setExportMsg("Đang xử lý CSV...");
			const savedPath: string = await invoke("csv_to_excel", {
				csvText: csvInput,
			});
			setExportMsg(`✅ Đã xuất file thành công tại: ${savedPath}`);
		} catch (err: any) {
			setExportMsg(`❌ Lỗi: ${err}`);
		}
	}

	return (
		<>
			<div className="formatter-view">
				<h2>JSON to Excel (Nested Target)</h2>
				<p>
					Nhập mảng JSON gốc và chỉ định field cần trích xuất (vd:{" "}
					<code>data.results</code>). Bỏ trống nếu root là Array.
				</p>

				<div
					style={{
						display: "flex",
						gap: "10px",
						marginBottom: "15px",
					}}
				>
					<input
						value={arrayPath}
						onChange={(e) => setArrayPath(e.target.value)}
						placeholder="Field path (vd: response.data.list)"
						style={{
							padding: "8px",
							flex: 1,
							background: "#3c3c3c",
							color: "#fff",
							border: "none",
							borderRadius: "4px",
						}}
					/>
					<button onClick={handleExportExcel} className="btn-primary">
						Xuất Excel
					</button>
				</div>
				{exportMsg && (
					<div
						style={{
							marginBottom: "10px",
							color: exportMsg.includes("Lỗi")
								? "#f48771"
								: "#4caf50",
						}}
					>
						{exportMsg}
					</div>
				)}

				<div className="editor-container">
					<Editor
						height="100%"
						theme="vs-dark"
						language="json"
						value={jsonInput}
						onChange={(value) => setJsonInput(value || "")}
						options={{ minimap: { enabled: false } }}
					/>
				</div>
			</div>
			<div className="formatter-view">
				<h2>Chuyển đổi dữ liệu sang Excel</h2>
				{exportMsg && (
					<div
						style={{
							marginBottom: "10px",
							padding: "10px",
							background: "#333",
							borderRadius: "4px",
							color: exportMsg.includes("Lỗi")
								? "#f48771"
								: "#4caf50",
						}}
					>
						{exportMsg}
					</div>
				)}

				<div
					style={{
						display: "flex",
						gap: "20px",
						height: "100%",
					}}
				>
					{/* CỘT JSON */}
					<div
						style={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
						}}
					>
						<div
							style={{
								display: "flex",
								gap: "5px",
								marginBottom: "10px",
							}}
						>
							<input
								value={arrayPath}
								onChange={(e) => setArrayPath(e.target.value)}
								placeholder="JSON Path (vd: data.list)"
								style={{
									flex: 1,
									padding: "8px",
									background: "#3c3c3c",
									color: "#fff",
									border: "none",
									borderRadius: "4px",
								}}
							/>
							{/* Hàm handleExportExcel là hàm bạn đã viết ở Phase trước */}
							<button
								className="btn-primary" /* onClick={handleExportExcel} */
							>
								JSON → Excel
							</button>
						</div>
						<div className="editor-container">
							<Editor
								height="100%"
								theme="vs-dark"
								language="json"
								value={jsonInput}
								onChange={(val) => setJsonInput(val || "")}
							/>
						</div>
					</div>

					{/* CỘT CSV */}
					<div
						style={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "flex-end",
								marginBottom: "10px",
							}}
						>
							<button
								onClick={handleExportCSV}
								className="btn-primary"
								style={{ background: "#4caf50" }}
							>
								CSV → Excel
							</button>
						</div>
						<div className="editor-container">
							<Editor
								height="100%"
								theme="vs-dark"
								language="csv"
								value={csvInput}
								onChange={(val) => setCsvInput(val || "")}
							/>
						</div>
					</div>
				</div>
			</div>
		</>
	);
};

export default JsonToExcel;
