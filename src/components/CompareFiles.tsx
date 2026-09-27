import { DiffEditor, type MonacoDiffEditor } from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import { FileDiff, FileText, Save, Search, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { cn } from "../lib/utils";

interface CompareHistory {
	id: number;
	name: string;

	originalName: string;
	originalContent: string;

	modifiedName: string;
	modifiedContent: string;

	language: string;
	createdAt: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const CompareFiles = (): React.JSX.Element => {
	const [originalCode, setOriginalCode] = useState("");
	const [modifiedCode, setModifiedCode] = useState("");

	const [originalName, setOriginalName] = useState("Original");
	const [modifiedName, setModifiedName] = useState("Modified");

	const [language, setLanguage] = useState("plaintext");

	const [history, setHistory] = useState<CompareHistory[]>([]);
	const [search, setSearch] = useState("");

	const [dragSide, setDragSide] = useState<"original" | "modified" | null>(
		null,
	);

	const containerRef = useRef<HTMLDivElement | null>(null);

	const originalDisposable = useRef<{ dispose(): void } | null>(null);
	const modifiedDisposable = useRef<{ dispose(): void } | null>(null);

	useEffect(() => {
		loadHistory();

		return () => {
			originalDisposable.current?.dispose();
			modifiedDisposable.current?.dispose();
		};
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			loadHistory(search);
		}, 300);

		return () => clearTimeout(timer);
	}, [search]);

	const inferLanguage = (filename: string): string => {
		const extension = filename.split(".").pop()?.toLowerCase();

		switch (extension) {
			case "json":
				return "json";

			case "js":
			case "jsx":
				return "javascript";

			case "ts":
			case "tsx":
				return "typescript";

			case "java":
				return "java";

			case "rs":
				return "rust";

			case "py":
				return "python";

			case "sql":
				return "sql";

			case "xml":
				return "xml";

			case "html":
				return "html";

			case "css":
				return "css";

			case "yaml":
			case "yml":
				return "yaml";

			case "md":
				return "markdown";

			case "sh":
				return "shell";

			default:
				return "plaintext";
		}
	};

	const readFile = async (file: File, side: "original" | "modified") => {
		if (file.size > MAX_FILE_SIZE) {
			alert("File quá lớn. Giới hạn hiện tại là 5 MB.");
			return;
		}

		try {
			const content = await file.text();

			if (side === "original") {
				setOriginalCode(content);
				setOriginalName(file.name);
			} else {
				setModifiedCode(content);
				setModifiedName(file.name);
			}

			setLanguage(inferLanguage(file.name));
		} catch (error) {
			console.error(error);
			alert("Không thể đọc file.");
		}
	};

	const detectSide = (
		event: React.DragEvent<HTMLDivElement>,
	): "original" | "modified" => {
		const rect = containerRef.current?.getBoundingClientRect();

		if (!rect) {
			return "original";
		}

		const middle = rect.left + rect.width / 2;

		return event.clientX < middle ? "original" : "modified";
	};

	const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();

		setDragSide(detectSide(event));
	};

	const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
		const related = event.relatedTarget as Node | null;

		if (!related || !event.currentTarget.contains(related)) {
			setDragSide(null);
		}
	};

	const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();

		const side = detectSide(event);

		setDragSide(null);

		const file = event.dataTransfer.files?.[0];

		if (!file) {
			return;
		}

		await readFile(file, side);
	};

	const handleEditorMount = (editor: MonacoDiffEditor) => {
		originalDisposable.current?.dispose();
		modifiedDisposable.current?.dispose();

		const originalEditor = editor.getOriginalEditor();

		const modifiedEditor = editor.getModifiedEditor();

		originalDisposable.current = originalEditor.onDidChangeModelContent(
			() => {
				setOriginalCode(originalEditor.getValue());
			},
		);

		modifiedDisposable.current = modifiedEditor.onDidChangeModelContent(
			() => {
				setModifiedCode(modifiedEditor.getValue());
			},
		);
	};

	const saveCompare = async () => {
		if (!originalCode && !modifiedCode) {
			return;
		}

		await invoke("save_compare_history", {
			input: {
				name: `${originalName} ↔ ${modifiedName}`,
				originalName,
				originalContent: originalCode,
				modifiedName,
				modifiedContent: modifiedCode,
				language,
			},
		});

		await loadHistory(search);
	};

	const loadHistory = async (query = "") => {
		try {
			const result = await invoke<CompareHistory[]>(
				"search_compare_history",
				{
					query,
				},
			);

			setHistory(result);
		} catch (error) {
			console.error("Load compare history error:", error);
		}
	};

	const openHistory = (item: CompareHistory) => {
		setOriginalName(item.originalName);
		setModifiedName(item.modifiedName);

		setOriginalCode(item.originalContent);
		setModifiedCode(item.modifiedContent);

		setLanguage(item.language);
	};

	const deleteHistory = async (id: number, event: React.MouseEvent) => {
		event.stopPropagation();

		await invoke("delete_compare_history", {
			id,
		});

		await loadHistory(search);
	};

	const clearEditor = () => {
		setOriginalCode("");
		setModifiedCode("");

		setOriginalName("Original");
		setModifiedName("Modified");

		setLanguage("plaintext");
	};

	return (
		<div className="flex h-full flex-col">
			{/* Toolbar */}
			<div className="flex h-14 items-center gap-3 border-b px-4">
				<FileDiff className="h-5 w-5" />

				<h2 className="font-semibold">Compare Files</h2>

				<div className="flex-1" />

				<Button variant="outline" size="sm" onClick={clearEditor}>
					<X className="mr-2 h-4 w-4" />
					Clear
				</Button>

				<Button size="sm" onClick={saveCompare}>
					<Save className="mr-2 h-4 w-4" />
					Save
				</Button>
			</div>

			<div className="flex min-h-0 flex-1">
				{/* History */}
				<div className="flex w-72 shrink-0 flex-col border-r">
					<div className="p-3">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

							<Input
								value={search}
								onChange={(event) =>
									setSearch(event.target.value)
								}
								placeholder="Search history..."
								className="pl-9"
							/>
						</div>
					</div>

					<Separator />

					<ScrollArea className="flex-1">
						<div className="space-y-1 p-2">
							{history.map((item) => (
								<button
									key={item.id}
									onClick={() => openHistory(item)}
									className="
                                        group
                                        flex
                                        w-full
                                        items-center
                                        gap-2
                                        rounded-md
                                        px-3
                                        py-2
                                        text-left
                                        hover:bg-accent
                                    "
								>
									<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />

									<div className="min-w-0 flex-1">
										<div className="truncate text-sm font-medium">
											{item.originalName}
										</div>

										<div className="truncate text-xs text-muted-foreground">
											vs {item.modifiedName}
										</div>
									</div>

									<Button
										variant="ghost"
										size="icon"
										className="
                                            h-7
                                            w-7
                                            opacity-0
                                            group-hover:opacity-100
                                        "
										onClick={(event) =>
											deleteHistory(item.id, event)
										}
									>
										<Trash2 className="h-4 w-4 text-destructive" />
									</Button>
								</button>
							))}
						</div>
					</ScrollArea>
				</div>

				{/* Diff */}
				<div className="flex min-w-0 flex-1 flex-col">
					{/* File names */}
					<div className="grid h-10 grid-cols-2 border-b text-sm">
						<div className="flex items-center gap-2 border-r px-4">
							<FileText className="h-4 w-4" />

							<span className="truncate">{originalName}</span>
						</div>

						<div className="flex items-center gap-2 px-4">
							<FileText className="h-4 w-4" />

							<span className="truncate">{modifiedName}</span>
						</div>
					</div>

					<div
						ref={containerRef}
						className="relative min-h-0 flex-1"
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
					>
						<DiffEditor
							height="100%"
							language={language}
							theme="vs-dark"
							original={originalCode}
							modified={modifiedCode}
							onMount={handleEditorMount}
							options={{
								originalEditable: true,
								automaticLayout: true,
								renderSideBySide: true,
								minimap: {
									enabled: false,
								},
								wordWrap: "on",
							}}
						/>

						{/* LEFT DROP OVERLAY */}
						<div
							className={cn(
								"pointer-events-none absolute inset-y-0 left-0 flex w-1/2 items-center justify-center border-2 border-dashed bg-background/80 transition-opacity",
								dragSide === "original"
									? "opacity-100"
									: "opacity-0",
							)}
						>
							<div className="text-center">
								<FileText className="mx-auto mb-3 h-10 w-10" />

								<p className="font-medium">
									Drop Original File
								</p>
							</div>
						</div>

						{/* RIGHT DROP OVERLAY */}
						<div
							className={cn(
								"pointer-events-none absolute inset-y-0 right-0 flex w-1/2 items-center justify-center border-2 border-dashed bg-background/80 transition-opacity",
								dragSide === "modified"
									? "opacity-100"
									: "opacity-0",
							)}
						>
							<div className="text-center">
								<FileText className="mx-auto mb-3 h-10 w-10" />

								<p className="font-medium">
									Drop Modified File
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default CompareFiles;
