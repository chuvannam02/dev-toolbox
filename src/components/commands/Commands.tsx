import { useState } from "react";
import {
	ArrowLeftRight,
	Binary,
	Braces,
	Check,
	Clipboard,
	Clock3,
	Code2,
	FileJson,
	Fingerprint,
	Hash,
	Link2,
	RefreshCw,
	Sparkles,
	Trash2,
} from "lucide-react";

import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

type Tool =
	| "base64"
	| "url"
	| "html"
	| "json"
	| "hex"
	| "hash"
	| "uuid"
	| "timestamp";

type HashType = "SHA-256" | "MD5";
type TimestampUnit = "seconds" | "milliseconds";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const regular: Record<
	Exclude<Tool, "hash" | "uuid" | "timestamp">,
	{
		label: string;
		description: string;
		icon: React.ElementType;
	}
> = {
	base64: {
		label: "Base64",
		description: "Encode / decode Base64",
		icon: Binary,
	},
	url: {
		label: "URL",
		description: "Encode URL parameters",
		icon: Link2,
	},
	html: {
		label: "HTML",
		description: "Escape HTML entities",
		icon: Code2,
	},
	json: {
		label: "JSON",
		description: "Format / minify JSON",
		icon: FileJson,
	},
	hex: {
		label: "Hex",
		description: "Text ↔ hexadecimal",
		icon: Braces,
	},
};

const htmlEncode = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(char) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[char] ?? char,
	);

const htmlDecode = (value: string) => {
	const element = document.createElement("textarea");
	element.innerHTML = value;

	return element.value;
};

const base64Encode = (value: string) =>
	btoa(String.fromCharCode(...encoder.encode(value)));

const base64Decode = (value: string) =>
	decoder.decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)));

const hexEncode = (value: string) =>
	[...encoder.encode(value)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");

const hexDecode = (value: string) => {
	const hex = value.replace(/\s/g, "");

	if (!/^[\da-f]*$/i.test(hex) || hex.length % 2 !== 0) {
		throw new Error("Hex không hợp lệ");
	}

	return decoder.decode(
		Uint8Array.from(hex.match(/.{2}/g) ?? [], (value) =>
			parseInt(value, 16),
		),
	);
};

const localIso = (date: Date) => date.toLocaleString("sv-SE").replace(" ", "T");

const regularTools = Object.entries(regular) as [
	keyof typeof regular,
	(typeof regular)[keyof typeof regular],
][];

export default function Commands() {
	const [tool, setTool] = useState<Tool>("base64");

	const [input, setInput] = useState("Hello Tauri");
	const [output, setOutput] = useState("");

	const [hash, setHash] = useState<HashType>("SHA-256");

	const [count, setCount] = useState(10);
	const [uuids, setUuids] = useState<string[]>([]);

	const [stamp, setStamp] = useState(String(Date.now()));

	const [unit, setUnit] = useState<TimestampUnit>("milliseconds");

	const [time, setTime] = useState<{
		utc: string;
		local: string;
	} | null>(null);

	const [copied, setCopied] = useState(false);

	const isRegular = tool in regular;

	const currentRegularTool = isRegular
		? regular[tool as keyof typeof regular]
		: null;

	const selectTool = (value: Tool) => {
		setTool(value);
		setOutput("");
		setCopied(false);
	};

	const run = (decode = false) => {
		try {
			let value = "";

			if (tool === "base64") {
				value = decode ? base64Decode(input) : base64Encode(input);
			}

			if (tool === "url") {
				value = decode
					? decodeURIComponent(input)
					: encodeURIComponent(input);
			}

			if (tool === "html") {
				value = decode ? htmlDecode(input) : htmlEncode(input);
			}

			if (tool === "hex") {
				value = decode ? hexDecode(input) : hexEncode(input);
			}

			if (tool === "json") {
				const json = JSON.parse(input);

				value = decode
					? JSON.stringify(json)
					: JSON.stringify(json, null, 2);
			}

			setOutput(value);
		} catch {
			setOutput("Dữ liệu không hợp lệ.");
		}
	};

	const makeHash = async () => {
		if (hash === "MD5") {
			setOutput(
				"MD5 không được Web Crypto hỗ trợ. Với Tauri có thể xử lý MD5 ở Rust backend.",
			);

			return;
		}

		const digest = await crypto.subtle.digest(
			"SHA-256",
			encoder.encode(input),
		);

		const bytes = new Uint8Array(digest);

		setOutput(
			[...bytes]
				.map((byte) => byte.toString(16).padStart(2, "0"))
				.join(""),
		);
	};

	const convertTime = () => {
		const value = Number(stamp) * (unit === "seconds" ? 1000 : 1);

		const date = new Date(value);

		if (Number.isNaN(date.getTime())) {
			setTime(null);
			return;
		}

		setTime({
			utc: date.toISOString(),
			local: localIso(date),
		});
	};

	const copyOutput = async () => {
		if (!output) return;

		await navigator.clipboard.writeText(output);

		setCopied(true);

		window.setTimeout(() => {
			setCopied(false);
		}, 1500);
	};

	return (
		<section className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6">
			{/* Header */}
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-start gap-3">
					<div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
						<RefreshCw className="size-5" />
					</div>

					<div>
						<h1 className="text-2xl font-semibold tracking-tight">
							Encode / Decode
						</h1>

						<p className="mt-1 text-sm text-muted-foreground">
							Công cụ xử lý chuỗi và dữ liệu dành cho developer.
						</p>
					</div>
				</div>

				<Badge variant="secondary" className="hidden sm:inline-flex">
					<TerminalIcon />
					Tauri Toolbox
				</Badge>
			</div>

			<Card className="overflow-hidden">
				<div className="grid min-h-[650px] md:grid-cols-[240px_1fr]">
					{/* Sidebar */}
					<aside className="border-b bg-muted/30 md:border-b-0 md:border-r">
						<ScrollArea className="h-auto md:h-[650px]">
							<div className="p-3">
								<p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Encoding
								</p>

								<div className="space-y-1">
									{regularTools.map(([id, item]) => {
										const Icon = item.icon;

										return (
											<button
												key={id}
												onClick={() => selectTool(id)}
												className={cn(
													"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
													"hover:bg-accent hover:text-accent-foreground",
													tool === id &&
														"bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
												)}
											>
												<Icon className="size-4 shrink-0" />

												<div className="min-w-0 flex-1">
													<div className="text-sm font-medium">
														{item.label}
													</div>

													<div
														className={cn(
															"truncate text-xs",
															tool === id
																? "text-primary-foreground/70"
																: "text-muted-foreground",
														)}
													>
														{item.description}
													</div>
												</div>
											</button>
										);
									})}
								</div>

								<Separator className="my-4" />

								<p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Hash
								</p>

								<div className="space-y-1">
									{(["SHA-256", "MD5"] as HashType[]).map(
										(value) => (
											<button
												key={value}
												onClick={() => {
													selectTool("hash");
													setHash(value);
												}}
												className={cn(
													"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
													"hover:bg-accent hover:text-accent-foreground",
													tool === "hash" &&
														hash === value &&
														"bg-primary text-primary-foreground",
												)}
											>
												<Hash className="size-4" />

												{value}
											</button>
										),
									)}
								</div>

								<Separator className="my-4" />

								<p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Utilities
								</p>

								<div className="space-y-1">
									<SidebarButton
										active={tool === "uuid"}
										icon={Fingerprint}
										label="UUID"
										description="Generate UUID v4"
										onClick={() => selectTool("uuid")}
									/>

									<SidebarButton
										active={tool === "timestamp"}
										icon={Clock3}
										label="Timestamp"
										description="Timestamp ↔ Date"
										onClick={() => selectTool("timestamp")}
									/>
								</div>
							</div>
						</ScrollArea>
					</aside>

					{/* Main workspace */}
					<div className="min-w-0">
						{isRegular && currentRegularTool && (
							<RegularTool
								title={currentRegularTool.label}
								description={currentRegularTool.description}
								input={input}
								output={output}
								copied={copied}
								onInputChange={setInput}
								onEncode={() => run(false)}
								onDecode={() => run(true)}
								onSwap={() => {
									setInput(output);
									setOutput(input);
								}}
								onCopy={copyOutput}
								onClear={() => {
									setInput("");
									setOutput("");
								}}
							/>
						)}

						{tool === "hash" && (
							<HashPanel
								hash={hash}
								input={input}
								output={output}
								onInputChange={setInput}
								onGenerate={() => void makeHash()}
								onCopy={copyOutput}
							/>
						)}

						{tool === "uuid" && (
							<UuidPanel
								count={count}
								uuids={uuids}
								onCountChange={setCount}
								onGenerate={() => {
									setUuids(
										Array.from(
											{
												length: Math.max(
													1,
													Math.min(100, count),
												),
											},
											() => crypto.randomUUID(),
										),
									);
								}}
							/>
						)}

						{tool === "timestamp" && (
							<TimestampPanel
								stamp={stamp}
								unit={unit}
								time={time}
								input={input}
								onStampChange={setStamp}
								onUnitChange={setUnit}
								onInputChange={setInput}
								onTimestampToDate={convertTime}
								onDateToTimestamp={() => {
									const date = new Date(input);

									if (Number.isNaN(date.getTime())) {
										return;
									}

									setStamp(
										String(
											unit === "seconds"
												? Math.floor(
														date.getTime() / 1000,
													)
												: date.getTime(),
										),
									);
								}}
							/>
						)}
					</div>
				</div>
			</Card>
		</section>
	);
}

function RegularTool({
	title,
	description,
	input,
	output,
	copied,
	onInputChange,
	onEncode,
	onDecode,
	onSwap,
	onCopy,
	onClear,
}: {
	title: string;
	description: string;
	input: string;
	output: string;
	copied: boolean;
	onInputChange: (value: string) => void;
	onEncode: () => void;
	onDecode: () => void;
	onSwap: () => void;
	onCopy: () => void;
	onClear: () => void;
}) {
	return (
		<div className="flex flex-col">
			<CardHeader className="border-b">
				<CardTitle>{title} Encoder / Decoder</CardTitle>

				<CardDescription>{description}</CardDescription>
			</CardHeader>

			<CardContent className="space-y-5 p-5 md:p-6">
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label>Input</Label>

						<span className="text-xs text-muted-foreground">
							{input.length} chars
						</span>
					</div>

					<Textarea
						value={input}
						onChange={(event) => onInputChange(event.target.value)}
						placeholder="Nhập dữ liệu..."
						className="min-h-40 resize-y font-mono text-sm"
					/>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button onClick={onEncode}>
						<Sparkles className="size-4" />
						Encode
					</Button>

					<Button variant="secondary" onClick={onDecode}>
						<Code2 className="size-4" />
						Decode
					</Button>

					<Button variant="outline" onClick={onSwap}>
						<ArrowLeftRight className="size-4" />
						Swap
					</Button>

					<Button
						variant="ghost"
						className="ml-auto"
						onClick={onClear}
					>
						<Trash2 className="size-4" />
						Clear
					</Button>
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label>Output</Label>

						<Button
							variant="ghost"
							size="sm"
							disabled={!output}
							onClick={onCopy}
						>
							{copied ? (
								<Check className="size-4" />
							) : (
								<Clipboard className="size-4" />
							)}

							{copied ? "Copied" : "Copy"}
						</Button>
					</div>

					<div className="min-h-40 rounded-md border bg-muted/30 p-4">
						<pre className="whitespace-pre-wrap break-all font-mono text-sm">
							{output || (
								<span className="font-sans text-muted-foreground">
									Kết quả sẽ xuất hiện ở đây.
								</span>
							)}
						</pre>
					</div>
				</div>
			</CardContent>
		</div>
	);
}

function HashPanel({
	hash,
	input,
	output,
	onInputChange,
	onGenerate,
	onCopy,
}: {
	hash: HashType;
	input: string;
	output: string;
	onInputChange: (value: string) => void;
	onGenerate: () => void;
	onCopy: () => void;
}) {
	return (
		<>
			<CardHeader className="border-b">
				<div className="flex items-center gap-2">
					<Hash className="size-5" />

					<CardTitle>{hash}</CardTitle>
				</div>

				<CardDescription>
					Tạo hash một chiều từ chuỗi đầu vào.
				</CardDescription>
			</CardHeader>

			<CardContent className="space-y-6 p-5 md:p-6">
				<div className="space-y-2">
					<Label>Input</Label>

					<Textarea
						value={input}
						onChange={(event) => onInputChange(event.target.value)}
						placeholder="Nhập text cần hash..."
						className="min-h-40 font-mono"
					/>
				</div>

				<Button onClick={onGenerate}>
					<Hash className="size-4" />
					Generate {hash}
				</Button>

				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label>Hash</Label>

						<Button
							variant="ghost"
							size="sm"
							onClick={onCopy}
							disabled={!output}
						>
							<Clipboard className="size-4" />
							Copy
						</Button>
					</div>

					<div className="min-h-32 rounded-md border bg-muted/30 p-4">
						<code className="break-all text-sm">
							{output || "Kết quả hash sẽ xuất hiện ở đây."}
						</code>
					</div>
				</div>
			</CardContent>
		</>
	);
}

function UuidPanel({
	count,
	uuids,
	onCountChange,
	onGenerate,
}: {
	count: number;
	uuids: string[];
	onCountChange: (value: number) => void;
	onGenerate: () => void;
}) {
	const copyAll = async () => {
		await navigator.clipboard.writeText(uuids.join("\n"));
	};

	return (
		<>
			<CardHeader className="border-b">
				<div className="flex items-center gap-2">
					<Fingerprint className="size-5" />

					<CardTitle>UUID Generator</CardTitle>
				</div>

				<CardDescription>
					Tạo UUID v4 sử dụng Web Crypto API.
				</CardDescription>
			</CardHeader>

			<CardContent className="space-y-6 p-5 md:p-6">
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label>Version</Label>

						<Select defaultValue="v4">
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>

							<SelectContent>
								<SelectItem value="v4">UUID v4</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label>Count</Label>

						<Input
							type="number"
							min={1}
							max={100}
							value={count}
							onChange={(event) =>
								onCountChange(Number(event.target.value))
							}
						/>
					</div>
				</div>

				<Button onClick={onGenerate}>
					<Sparkles className="size-4" />
					Generate UUID
				</Button>

				<div className="rounded-lg border">
					<div className="flex items-center justify-between border-b px-4 py-3">
						<span className="text-sm font-medium">
							Generated UUIDs
						</span>

						<Badge variant="secondary">{uuids.length}</Badge>
					</div>

					<ScrollArea className="h-[300px]">
						<div className="space-y-1 p-2">
							{uuids.length === 0 ? (
								<div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
									Chưa có UUID.
								</div>
							) : (
								uuids.map((uuid, index) => (
									<div
										key={uuid}
										className="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted"
									>
										<span className="w-6 text-xs text-muted-foreground">
											{index + 1}
										</span>

										<code className="min-w-0 flex-1 truncate text-sm">
											{uuid}
										</code>

										<Button
											variant="ghost"
											size="icon"
											className="size-8 opacity-0 transition-opacity group-hover:opacity-100"
											onClick={() =>
												void navigator.clipboard.writeText(
													uuid,
												)
											}
										>
											<Clipboard className="size-4" />
										</Button>
									</div>
								))
							)}
						</div>
					</ScrollArea>
				</div>

				<Button
					variant="outline"
					disabled={!uuids.length}
					onClick={() => void copyAll()}
				>
					<Clipboard className="size-4" />
					Copy all
				</Button>
			</CardContent>
		</>
	);
}

function TimestampPanel({
	stamp,
	unit,
	time,
	input,
	onStampChange,
	onUnitChange,
	onInputChange,
	onTimestampToDate,
	onDateToTimestamp,
}: {
	stamp: string;
	unit: TimestampUnit;
	time: {
		utc: string;
		local: string;
	} | null;
	input: string;
	onStampChange: (value: string) => void;
	onUnitChange: (value: TimestampUnit) => void;
	onInputChange: (value: string) => void;
	onTimestampToDate: () => void;
	onDateToTimestamp: () => void;
}) {
	return (
		<>
			<CardHeader className="border-b">
				<div className="flex items-center gap-2">
					<Clock3 className="size-5" />

					<CardTitle>Timestamp Converter</CardTitle>
				</div>

				<CardDescription>
					Chuyển đổi Unix Timestamp ↔ Date.
				</CardDescription>
			</CardHeader>

			<CardContent className="space-y-6 p-5 md:p-6">
				<div className="space-y-2">
					<Label>Timestamp</Label>

					<Input
						value={stamp}
						onChange={(event) => onStampChange(event.target.value)}
						className="font-mono"
					/>
				</div>

				<div className="space-y-3">
					<Label>Unit</Label>

					<RadioGroup
						value={unit}
						onValueChange={(value) =>
							onUnitChange(value as TimestampUnit)
						}
						className="flex flex-wrap gap-5"
					>
						<div className="flex items-center gap-2">
							<RadioGroupItem value="seconds" id="seconds" />

							<Label htmlFor="seconds" className="font-normal">
								Seconds
							</Label>
						</div>

						<div className="flex items-center gap-2">
							<RadioGroupItem
								value="milliseconds"
								id="milliseconds"
							/>

							<Label
								htmlFor="milliseconds"
								className="font-normal"
							>
								Milliseconds
							</Label>
						</div>
					</RadioGroup>
				</div>

				<Button onClick={onTimestampToDate}>
					<Clock3 className="size-4" />
					Timestamp → Date
				</Button>

				{time && (
					<div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
						<DateResult label="UTC" value={time.utc} />

						<Separator />

						<DateResult label="Local" value={time.local} />
					</div>
				)}

				<Separator />

				<div className="space-y-2">
					<Label>Date</Label>

					<Input
						value={input}
						onChange={(event) => onInputChange(event.target.value)}
						placeholder="2026-09-19T10:30:00+07:00"
						className="font-mono"
					/>

					<p className="text-xs text-muted-foreground">
						Ví dụ: 2026-09-19T10:30:00+07:00
					</p>
				</div>

				<Button variant="outline" onClick={onDateToTimestamp}>
					<ArrowLeftRight className="size-4" />
					Date → Timestamp
				</Button>
			</CardContent>
		</>
	);
}

function DateResult({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid gap-1">
			<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</span>

			<code className="break-all text-sm">{value}</code>
		</div>
	);
}

function SidebarButton({
	active,
	icon: Icon,
	label,
	description,
	onClick,
}: {
	active: boolean;
	icon: React.ElementType;
	label: string;
	description: string;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className={cn(
				"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
				"hover:bg-accent hover:text-accent-foreground",
				active &&
					"bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
			)}
		>
			<Icon className="size-4 shrink-0" />

			<div className="min-w-0">
				<div className="text-sm font-medium">{label}</div>

				<div
					className={cn(
						"truncate text-xs",
						active
							? "text-primary-foreground/70"
							: "text-muted-foreground",
					)}
				>
					{description}
				</div>
			</div>
		</button>
	);
}

function TerminalIcon() {
	return <Code2 className="mr-1 size-3.5" />;
}
