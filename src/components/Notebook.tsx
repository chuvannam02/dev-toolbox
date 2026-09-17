import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Check, Save } from "lucide-react";
import { Button } from "./ui/button";
import "./Notebook.css";

type CellStatus = "idle" | "running" | "ok" | "error";

type CellOutput = {
	type: "stream" | "error" | "result" | "status";
	text: string;
};

type NotebookCell = {
	id: string;
	code: string;
	outputs: CellOutput[];
	status: CellStatus;
	execution_count: number | null;
};

type CellOutputEvent = {
	cell_id: string;
	output: CellOutput;
	done: boolean;
	execution_count: number | null;
	ok: boolean;
};

let cellSeq = 0;
const newCellId = () => `cell-${Date.now()}-${cellSeq++}`;
const NOTEBOOK_DRAFT_KEY = "dev-toolbox:notebook-draft:v1";

// Hàm lọc mã màu ANSI từ output của kernel để dễ đọc hơn
const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");

const Notebook: React.FC = (): React.JSX.Element => {
	const [cells, setCells] = useState<NotebookCell[]>(() => {
		try {
			const draft = localStorage.getItem(NOTEBOOK_DRAFT_KEY);
			if (draft) {
				const parsed: unknown = JSON.parse(draft);
				if (Array.isArray(parsed) && parsed.length) return parsed as NotebookCell[];
			}
		} catch { localStorage.removeItem(NOTEBOOK_DRAFT_KEY); }
		return [{ id: newCellId(), code: "", outputs: [], status: "idle", execution_count: null }];
	});
	const [lastSaved, setLastSaved] = useState<Date | null>(null);
	const [kernelReady, setKernelReady] = useState(false);
	const [kernelBusy, setKernelBusy] = useState(false);
	const [kernelError, setKernelError] = useState<string | null>(null);

	const runningCellId = useRef<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		const abortController = new AbortController();
		let unlistenFn: (() => void) | null = null;

		const setupKernel = async () => {
			try {
				await invoke("ensure_kernel_started");
				if (!abortController.signal.aborted) {
					setKernelReady(true);
					setKernelError(null);
				}
			} catch (err) {
				if (!abortController.signal.aborted) {
					setKernelError(String(err));
					console.error("Failed to start kernel:", err);
				}
			}
		};

		const setupListener = async () => {
			const unlisten = await listen<CellOutputEvent>(
				"cell-output",
				(event) => {
					if (abortController.signal.aborted) return;

					const { cell_id, output, done, execution_count, ok } =
						event.payload;

					setCells((prev) =>
						prev.map((c) =>
							c.id === cell_id
								? {
										...c,
										outputs: [...c.outputs, output],
										status: done
											? ok
												? "ok"
												: "error"
											: "running",
										execution_count:
											execution_count ??
											c.execution_count,
									}
								: c,
						),
					);

					if (done) {
						runningCellId.current = null;
						setKernelBusy(false);
					}
				},
			);

			if (abortController.signal.aborted) {
				unlisten();
			} else {
				unlistenFn = unlisten;
			}
		};

		setupKernel();
		setupListener();

		return () => {
			abortController.abort();
			if (unlistenFn) unlistenFn();
		};
	}, []);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			localStorage.setItem(NOTEBOOK_DRAFT_KEY, JSON.stringify(cells));
			setLastSaved(new Date());
		}, 600);
		return () => window.clearTimeout(timer);
	}, [cells]);

	const updateCode = (id: string, code: string) => {
		setCells((prev) => prev.map((c) => (c.id === id ? { ...c, code } : c)));
	};

	const runCell = async (id: string) => {
		if (kernelBusy) return;
		const cell = cells.find((c) => c.id === id);
		if (!cell || !cell.code.trim()) return;

		runningCellId.current = id;
		setKernelBusy(true);
		setCells((prev) =>
			prev.map((c) =>
				c.id === id ? { ...c, outputs: [], status: "running" } : c,
			),
		);

		try {
			await invoke("execute_cell", { cellId: id, code: cell.code });
		} catch (err) {
			setKernelBusy(false);
			setCells((prev) =>
				prev.map((c) =>
					c.id === id
						? {
								...c,
								status: "error",
								outputs: [{ type: "error", text: String(err) }],
							}
						: c,
				),
			);
		}
	};

	const addCell = (afterId?: string, initialCode = "") => {
		const newCell: NotebookCell = {
			id: newCellId(),
			code: initialCode,
			outputs: [],
			status: "idle",
			execution_count: null,
		};
		setCells((prev) => {
			if (!afterId) return [...prev, newCell];
			const idx = prev.findIndex((c) => c.id === afterId);
			const copy = [...prev];
			copy.splice(idx + 1, 0, newCell);
			return copy;
		});
	};

	const removeCell = (id: string) => {
		setCells((prev) =>
			prev.length > 1 ? prev.filter((c) => c.id !== id) : prev,
		);
	};

	const restartKernel = async () => {
		setKernelReady(false);
		setKernelBusy(false);
		try {
			await invoke("restart_kernel");
			setCells((prev) =>
				prev.map((c) => ({
					...c,
					outputs: [],
					status: "idle",
					execution_count: null,
				})),
			);
			setKernelReady(true);
		} catch (err) {
			console.error("Failed to restart kernel:", err);
		}
	};

	const saveIpynb = () => {
		const ipynb = {
			cells: cells.map((c) => ({
				cell_type: "code",
				execution_count: c.execution_count,
				metadata: {},
				outputs: c.outputs.map((o) => ({
					output_type:
						o.type === "result" ? "execute_result" : o.type,
					text: stripAnsi(o.text),
				})),
				source: c.code
					.split("\n")
					.map(
						(line, i, arr) =>
							line + (i === arr.length - 1 ? "" : "\n"),
					),
			})),
			metadata: {},
			nbformat: 4,
			nbformat_minor: 5,
		};

		const blob = new Blob([JSON.stringify(ipynb, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "notebook.ipynb";
		a.click();
		URL.revokeObjectURL(url);
	};

	const saveDraft = () => {
		localStorage.setItem(NOTEBOOK_DRAFT_KEY, JSON.stringify(cells));
		setLastSaved(new Date());
	};

	const processSqlFile = async (file: File) => {
		if (!file.name.endsWith(".sql")) {
			alert("Vui lòng chọn file .sql");
			return;
		}
		const text = await file.text();
		addCell(undefined, text);
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			void processSqlFile(file);
			e.target.value = "";
		}
	};

	const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		const file = e.dataTransfer.files?.[0];
		if (file) void processSqlFile(file);
	};

	const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
	};

	const handleKeyDown = (
		e: React.KeyboardEvent<HTMLTextAreaElement>,
		id: string,
	) => {
		if (e.key === "Enter" && e.shiftKey) {
			e.preventDefault();
			void runCell(id);
		}
	};

	return (
		<div
			className="notebook"
			onDrop={handleDrop}
			onDragOver={handleDragOver}
		>
			<div className="notebook-toolbar">
				<span
					className={`kernel-status ${kernelReady ? "ready" : kernelError ? "error" : "starting"}`}
				>
					{kernelReady
						? kernelBusy
							? "● Busy"
							: "● Ready"
						: kernelError
							? `✕ ${kernelError}`
							: "○ Starting kernel..."}
				</span>
				<span className="autosave-status" title="Bản nháp được lưu trong thiết bị này">
					<Check size={14} /> {lastSaved ? `Đã tự lưu ${lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Đang chuẩn bị tự lưu"}
				</span>
				<Button variant="secondary" size="sm" onClick={saveDraft}>
					<Save size={15} /> Lưu nháp
				</Button>

				<button onClick={() => addCell()}>+ Cell</button>
				<button onClick={restartKernel} disabled={!kernelReady}>
					Restart Kernel
				</button>

				<input
					type="file"
					accept=".sql"
					ref={fileInputRef}
					style={{ display: "none" }}
					onChange={handleFileSelect}
				/>
				<button onClick={() => fileInputRef.current?.click()}>
					Import SQL
				</button>
				<button onClick={saveIpynb}>Save .ipynb</button>
			</div>

			<div className="notebook-cells">
				{cells.map((cell, idx) => (
					<div
						key={cell.id}
						className={`notebook-cell status-${cell.status}`}
					>
						<div className="cell-gutter">
							[
							{cell.execution_count ??
								(cell.status === "running" ? "*" : idx + 1)}
							]
						</div>
						<div className="cell-body">
							<textarea
								className="cell-editor"
								value={cell.code}
								onChange={(e) =>
									updateCode(cell.id, e.target.value)
								}
								onInput={(e) => {
									e.currentTarget.style.height = "auto";
									e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
								}}
								ref={(el) => {
									if (el) {
										el.style.height = "auto";
										el.style.height = `${el.scrollHeight}px`;
									}
								}}
								onKeyDown={(e) => handleKeyDown(e, cell.id)}
								placeholder="# Python code, Shift+Enter để chạy (Có thể kéo thả file .sql vào đây)"
								spellCheck={false}
								style={{ overflow: "hidden", resize: "none" }}
							/>
							<div className="cell-actions">
								<button
									onClick={() => runCell(cell.id)}
									disabled={!kernelReady || kernelBusy}
								>
									▶ Run
								</button>
								<button onClick={() => addCell(cell.id)}>
									+ Below
								</button>
								<button onClick={() => removeCell(cell.id)}>
									✕
								</button>
							</div>
							{cell.outputs.length > 0 && (
								<pre
									className={`cell-output ${cell.status === "error" ? "error" : ""}`}
								>
									{stripAnsi(
										cell.outputs
											.map((o) => o.text)
											.join(""),
									)}
								</pre>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

export default Notebook;
