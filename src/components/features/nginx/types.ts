// Khớp 1-1 với src-tauri/src/nginx/models.rs (serde tag = "type")

export type NginxNode =
	| { type: "Directive"; name: string; args: string[]; line: number }
	| {
			type: "Block";
			name: string;
			args: string[];
			children: NginxNode[];
			line: number;
	  }
	| { type: "Comment"; text: string; line: number };

export type IssueSeverity = "error" | "warning";

export interface NginxIssue {
	severity: IssueSeverity;
	line: number;
	message: string;
	hint: string | null;
}

export interface NginxParseResult {
	tree: NginxNode[];
	issues: NginxIssue[];
}

export interface NginxNativeCheckResult {
	success: boolean;
	stdout: string;
	stderr: string;
}

export function isBlock(
	node: NginxNode,
): node is Extract<NginxNode, { type: "Block" }> {
	return node.type === "Block";
}

/** Nhãn hiển thị ngắn gọn cho một node, dùng trong tree/breadcrumb. */
export function nodeLabel(node: NginxNode): string {
	switch (node.type) {
		case "Block":
			return node.args.length > 0
				? `${node.name} ${node.args.join(" ")}`
				: node.name;
		case "Directive":
			return `${node.name} ${node.args.join(" ")};`;
		case "Comment":
			return `# ${node.text}`;
	}
}
