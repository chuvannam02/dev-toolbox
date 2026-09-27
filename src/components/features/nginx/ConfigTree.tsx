import { useState } from "react";
import { ChevronRight, FileCode2, Braces } from "lucide-react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "../../ui/collapsible";
import { Badge } from "../../ui/badge";
import { cn } from "../../../lib/utils";
import {
	isBlock,
	nodeLabel,
	type NginxNode,
	type NginxIssue,
} from "./types";

interface ConfigTreeProps {
	tree: NginxNode[];
	issues: NginxIssue[];
	/** Dòng đang được chọn trong editor (đồng bộ 2 chiều), nếu có. */
	activeLine?: number;
	onSelectLine?: (line: number) => void;
}

function lastLine(node: NginxNode): number {
	if (isBlock(node) && node.children.length > 0) {
		return Math.max(node.line, ...node.children.map(lastLine));
	}
	return node.line;
}

function TreeNode({
	node,
	issues,
	depth,
	activeLine,
	onSelectLine,
}: {
	node: NginxNode;
	issues: NginxIssue[];
	depth: number;
	activeLine?: number;
	onSelectLine?: (line: number) => void;
}) {
	const [open, setOpen] = useState(depth < 2);

	if (node.type === "Comment") {
		return (
			<div
				className="truncate px-2 py-0.5 text-xs italic text-muted-foreground"
				style={{ paddingLeft: depth * 14 + 8 }}
			>
				{nodeLabel(node)}
			</div>
		);
	}

	const isActive = activeLine === node.line;
	const errorCount = isBlock(node)
		? issues.filter(
				(i) =>
					i.severity === "error" &&
					i.line >= node.line &&
					i.line <= lastLine(node),
			).length
		: issues.filter((i) => i.severity === "error" && i.line === node.line)
				.length;

	const rowClasses = cn(
		"flex items-center gap-1.5 rounded px-1.5 py-1 text-sm hover:bg-accent cursor-pointer select-none",
		isActive && "bg-accent",
	);

	if (isBlock(node)) {
		return (
			<Collapsible open={open} onOpenChange={setOpen}>
				<div
					className={rowClasses}
					style={{ paddingLeft: depth * 14 }}
					onClick={() => onSelectLine?.(node.line)}
				>
					<CollapsibleTrigger>
						<button
							className="shrink-0"
							onClick={(e) => {
								e.stopPropagation();
								setOpen((v) => !v);
							}}
							aria-label={open ? "Collapse" : "Expand"}
						>
							<ChevronRight
								className={cn(
									"h-3.5 w-3.5 transition-transform text-muted-foreground",
									open && "rotate-90",
								)}
							/>
						</button>
					</CollapsibleTrigger>
					<Braces className="h-3.5 w-3.5 shrink-0 text-blue-500" />
					<span className="font-mono truncate">
						{node.name}
						{node.args.length > 0 && (
							<span className="text-muted-foreground">
								{" "}
								{node.args.join(" ")}
							</span>
						)}
					</span>
					{errorCount > 0 && (
						<Badge
							variant="destructive"
							className="ml-auto h-4 px-1 text-[10px]"
						>
							{errorCount}
						</Badge>
					)}
				</div>
				<CollapsibleContent>
					{node.children.length === 0 ? (
						<div
							className="px-2 py-0.5 text-xs text-muted-foreground"
							style={{ paddingLeft: (depth + 1) * 14 + 8 }}
						>
							(empty)
						</div>
					) : (
						node.children.map((child, idx) => (
							<TreeNode
								key={`${child.line}-${idx}`}
								node={child}
								issues={issues}
								depth={depth + 1}
								activeLine={activeLine}
								onSelectLine={onSelectLine}
							/>
						))
					)}
				</CollapsibleContent>
			</Collapsible>
		);
	}

	// Directive
	return (
		<div
			className={rowClasses}
			style={{ paddingLeft: depth * 14 + 18 }}
			onClick={() => onSelectLine?.(node.line)}
		>
			<FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			<span className="font-mono truncate">{nodeLabel(node)}</span>
			{errorCount > 0 && (
				<Badge
					variant="destructive"
					className="ml-auto h-4 px-1 text-[10px]"
				>
					!
				</Badge>
			)}
		</div>
	);
}

/**
 * Hiển thị cây cấu trúc nginx config (Phase 2 của spec: Nginx Config Tree Viewer).
 * Click vào một node sẽ gọi onSelectLine để Editor (Monaco) nhảy tới dòng tương ứng.
 */
export function ConfigTree({
	tree,
	issues,
	activeLine,
	onSelectLine,
}: ConfigTreeProps) {
	if (tree.length === 0) {
		return (
			<div className="p-4 text-sm text-muted-foreground">
				Chưa có config để hiển thị.
			</div>
		);
	}

	return (
		<div className="overflow-y-auto py-1">
			{tree.map((node, idx) => (
				<TreeNode
					key={`${node.line}-${idx}`}
					node={node}
					issues={issues}
					depth={0}
					activeLine={activeLine}
					onSelectLine={onSelectLine}
				/>
			))}
		</div>
	);
}
