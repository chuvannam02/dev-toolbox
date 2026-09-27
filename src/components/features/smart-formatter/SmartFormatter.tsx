import { lazy, Suspense, useCallback, useRef, useState } from "react";

import { invoke } from "@tauri-apps/api/core";

import {
	AlertCircle,
	CheckCircle2,
	Code2,
	Loader2,
	Sparkles,
} from "lucide-react";

import type { editor } from "monaco-editor";
import type { OnMount } from "@monaco-editor/react";

import { Alert, AlertDescription } from "../../ui/alert";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Skeleton } from "../../ui/skeleton";

import type { FormatResult } from "./types";

const FormatterEditor = lazy(() => import("./FormatterEditor"));

const SmartFormatter = (): React.JSX.Element => {
	const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

	const codeRef = useRef<string>("");

	const [language, setLanguage] = useState<string>("plaintext");

	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const [isFormatting, setIsFormatting] = useState(false);

	const [formattedSuccessfully, setFormattedSuccessfully] = useState(false);

	const handleEditorMount: OnMount = useCallback((editor) => {
		editorRef.current = editor;

		editor.focus();
	}, []);

	const handleEditorChange = useCallback((value: string | undefined) => {
		codeRef.current = value ?? "";

		/*
		 * Không setState ở đây.
		 *
		 * Nếu dùng:
		 *
		 * setCode(value)
		 *
		 * thì SmartFormatter sẽ re-render theo từng keystroke.
		 */
	}, []);

	const replaceEditorContent = useCallback((text: string) => {
		const editorInstance = editorRef.current;

		if (!editorInstance) {
			return;
		}

		const model = editorInstance.getModel();

		if (!model) {
			return;
		}

		editorInstance.pushUndoStop();

		editorInstance.executeEdits("smart-formatter", [
			{
				range: model.getFullModelRange(),
				text,
				forceMoveMarkers: true,
			},
		]);

		editorInstance.pushUndoStop();

		codeRef.current = text;
	}, []);

	const handleFormatCode = useCallback(async () => {
		const rawText = codeRef.current.trim();

		if (!rawText) {
			setErrorMsg("Vui lòng nhập JSON, XML, SQL hoặc cURL.");
			setFormattedSuccessfully(false);
			return;
		}

		try {
			setIsFormatting(true);
			setErrorMsg(null);
			setFormattedSuccessfully(false);

			const result = await invoke<FormatResult>("detect_and_format", {
				rawText,
			});

			setLanguage(result.format_type);

			if (!result.is_valid) {
				setErrorMsg(
					result.error_msg ??
						"Không thể xác định hoặc format nội dung.",
				);

				return;
			}

			replaceEditorContent(result.formatted_text);

			setFormattedSuccessfully(true);
		} catch (error) {
			console.error("detect_and_format failed:", error);

			setErrorMsg(error instanceof Error ? error.message : String(error));
		} finally {
			setIsFormatting(false);
		}
	}, [replaceEditorContent]);

	return (
		<div className="flex h-full min-h-0 flex-col p-4">
			<Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<CardHeader className="border-b py-4">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div className="space-y-1">
							<CardTitle className="flex items-center gap-2 text-lg">
								<Code2 className="size-5" />
								Smart Formatter
							</CardTitle>

							<p className="text-sm text-muted-foreground">
								Auto detect JSON, XML, SQL và cURL
							</p>
						</div>

						<Button
							onClick={handleFormatCode}
							disabled={isFormatting}
						>
							{isFormatting ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Formatting...
								</>
							) : (
								<>
									<Sparkles className="size-4" />
									Auto Format
								</>
							)}
						</Button>
					</div>

					<div className="mt-3 flex flex-wrap items-center gap-2">
						<span className="text-sm text-muted-foreground">
							Detected:
						</span>

						<Badge variant="secondary">
							{language.toUpperCase()}
						</Badge>

						{formattedSuccessfully && !errorMsg && (
							<div className="flex items-center gap-1 text-sm text-green-600">
								<CheckCircle2 className="size-4" />
								Formatted
							</div>
						)}
					</div>

					{errorMsg && (
						<Alert variant="destructive" className="mt-3">
							<AlertCircle className="size-4" />

							<AlertDescription>{errorMsg}</AlertDescription>
						</Alert>
					)}
				</CardHeader>

				<CardContent className="min-h-0 flex-1 p-0">
					<Suspense
						fallback={
							<div className="h-full space-y-3 p-4">
								<Skeleton className="h-5 w-52" />
								<Skeleton className="h-[calc(100%-2rem)] w-full" />
							</div>
						}
					>
						<FormatterEditor
							language={language}
							onMount={handleEditorMount}
							onChange={handleEditorChange}
						/>
					</Suspense>
				</CardContent>
			</Card>
		</div>
	);
};

export default SmartFormatter;
