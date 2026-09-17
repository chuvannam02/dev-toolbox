import { Editor } from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

const AnsibleAutomation: React.FC = (): React.JSX.Element => {
	// --- ANSIBLE STATE ---
	const [ansibleCommand, setAnsibleCommand] = useState(
		"ansible-playbook -i hosts.ini deploy.yml",
	);
	const [ansibleLog, setAnsibleLog] = useState("");
	const [isRunning, setIsRunning] = useState(false);

	// Luồng Ansible
	async function handleRunAnsible() {
		setIsRunning(true);
		setAnsibleLog(
			'Đang khởi chạy tiến trình...\n> wsl bash -c "' +
				ansibleCommand +
				'"\n',
		);
		try {
			const output: string = await invoke("execute_ansible", {
				command: ansibleCommand,
			});
			setAnsibleLog((prev) => prev + "\n[THÀNH CÔNG]\n" + output);
		} catch (error: any) {
			setAnsibleLog((prev) => prev + "\n[THẤT BẠI]\n" + error);
		} finally {
			setIsRunning(false);
		}
	}

	return (
		<div
			className="view-container"
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
			}}
		>
			<h2>⚙️ Ansible Automation (Remote Config)</h2>
			<p style={{ color: "#a9a9a9" }}>
				Chạy các lệnh cấu hình/deploy lên remote servers thông qua WSL.
			</p>

			<div
				style={{
					display: "flex",
					gap: "10px",
					marginTop: "10px",
					marginBottom: "15px",
				}}
			>
				<input
					value={ansibleCommand}
					onChange={(e) => setAnsibleCommand(e.target.value)}
					placeholder="ansible-playbook -i inventory.yaml deploy.yaml"
					className="input-dark"
					style={{ flex: 1, fontFamily: "monospace" }}
				/>
				<button
					onClick={handleRunAnsible}
					disabled={isRunning}
					className="btn-primary"
					style={{
						background: isRunning ? "#555" : "#007acc",
					}}
				>
					{isRunning ? "Đang chạy..." : "▶ Run Playbook"}
				</button>
			</div>

			{/* Khung Terminal hiển thị Log */}
			<div
				style={{
					flex: 1,
					background: "#1e1e1e",
					border: "1px solid #333",
					borderRadius: "4px",
					overflow: "hidden",
				}}
			>
				<Editor
					height="100%"
					theme="vs-dark"
					language="shell"
					value={ansibleLog}
					options={{
						readOnly: true,
						wordWrap: "on",
						minimap: { enabled: false },
					}}
				/>
			</div>
		</div>
	);
};

export default AnsibleAutomation;
