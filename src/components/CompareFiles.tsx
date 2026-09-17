import { DiffEditor } from "@monaco-editor/react";
import { useState } from "react";

const CompareFiles: React.FC = (): React.JSX.Element => {
		// --- Diff Editor State ---
	const [originalCode] = useState("");
	const [modifiedCode] = useState("");
	
	return (
		<div className="formatter-view">
			<div className="toolbar">
				<h2>Compare Files</h2>
			</div>
			<div
				className="editor-container"
				style={{ display: "flex", flexDirection: "column" }}
			>
				<div style={{ display: "flex", height: "100%" }}>
					<DiffEditor
						height="100%"
						language="json" // Có thể làm state động như formatter
						theme="vs-dark"
						original={originalCode}
						modified={modifiedCode}
						options={{ originalEditable: true }} // Cho phép gõ trực tiếp vào cả 2 bên
					/>
				</div>
			</div>
		</div>
	);
};

export default CompareFiles;