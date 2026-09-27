import { AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { NginxIssue } from "./types";

interface ProblemsPanelProps {
	issues: NginxIssue[];
	onSelectLine?: (line: number) => void;
}

/** Danh sách Problems dưới editor, giống layout "Problems" trong spec Nginx Studio. */
export function ProblemsPanel({ issues, onSelectLine }: ProblemsPanelProps) {
	if (issues.length === 0) {
		return (
			<div className="flex items-center gap-2 border-t bg-background px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
				<CheckCircle2 className="h-4 w-4" />
				Syntax valid — không phát hiện lỗi
			</div>
		);
	}

	const errorCount = issues.filter((i) => i.severity === "error").length;
	const warningCount = issues.length - errorCount;

	return (
		<div className="flex max-h-40 flex-col border-t bg-background">
			<div className="flex items-center gap-3 border-b px-3 py-1.5 text-xs text-muted-foreground">
				<span>Problems</span>
				{errorCount > 0 && (
					<span className="text-destructive">
						{errorCount} error{errorCount > 1 ? "s" : ""}
					</span>
				)}
				{warningCount > 0 && (
					<span>
						{warningCount} warning{warningCount > 1 ? "s" : ""}
					</span>
				)}
			</div>
			<div className="overflow-y-auto">
				{issues.map((issue, idx) => (
					<button
						key={idx}
						onClick={() => onSelectLine?.(issue.line)}
						className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
					>
						{issue.severity === "error" ? (
							<XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
						) : (
							<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
						)}
						<span
							className={cn(
								"flex-1",
								issue.severity === "error" && "text-foreground",
							)}
						>
							{issue.message}
							{issue.hint && (
								<span className="mt-0.5 block whitespace-pre-line font-mono text-xs text-muted-foreground">
									Expected:{"\n"}
									{issue.hint}
								</span>
							)}
						</span>
						<span className="shrink-0 text-xs text-muted-foreground">
							Line {issue.line}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}
