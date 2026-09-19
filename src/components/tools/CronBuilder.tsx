import { invoke } from "@tauri-apps/api/core";
import {
	Check,
	Clock3,
	Copy,
	RefreshCcw,
	CalendarClock,
	Terminal,
} from "lucide-react";
import {
	useEffect,
	useMemo,
	useState,
} from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Separator } from "../ui/separator";

type CronMode = "unix" | "seconds";

type CronPreviewResponse = {
	valid: boolean;
	expression: string;
	nextRuns: string[];
	error: string | null;
};

type CronField = {
	label: string;
	description: string;
};

const UNIX_FIELDS: CronField[] = [
	{
		label: "Minute",
		description: "0-59",
	},
	{
		label: "Hour",
		description: "0-23",
	},
	{
		label: "Day",
		description: "1-31",
	},
	{
		label: "Month",
		description: "1-12",
	},
	{
		label: "Weekday",
		description: "0-7",
	},
];

const SECONDS_FIELDS: CronField[] = [
	{
		label: "Second",
		description: "0-59",
	},
	...UNIX_FIELDS,
];

type Preset = {
	label: string;
	unix: string;
};

const PRESETS: Preset[] = [
	{
		label: "Every minute",
		unix: "* * * * *",
	},
	{
		label: "Every 5 minutes",
		unix: "*/5 * * * *",
	},
	{
		label: "Every 15 minutes",
		unix: "*/15 * * * *",
	},
	{
		label: "Hourly",
		unix: "0 * * * *",
	},
	{
		label: "Daily 09:00",
		unix: "0 9 * * *",
	},
	{
		label: "Weekdays 09:00",
		unix: "0 9 * * 1-5",
	},
	{
		label: "Midnight",
		unix: "0 0 * * *",
	},
	{
		label: "Monthly",
		unix: "0 9 1 * *",
	},
];

const defaultExpression = (
	mode: CronMode,
): string => {
	if (mode === "seconds") {
		return "0 */5 * * * *";
	}

	return "*/5 * * * *";
};

const presetExpression = (
	preset: Preset,
	mode: CronMode,
): string => {
	if (mode === "seconds") {
		return `0 ${preset.unix}`;
	}

	return preset.unix;
};

const describeCron = (
	expression: string,
	mode: CronMode,
): string => {
	let value = expression
		.trim()
		.replace(/\s+/g, " ");

	// bỏ second = 0 để reuse description
	if (
		mode === "seconds" &&
		value.startsWith("0 ")
	) {
		value = value.substring(2);
	}

	switch (value) {
		case "* * * * *":
			return "Run every minute";

		case "*/5 * * * *":
			return "Run every 5 minutes";

		case "*/15 * * * *":
			return "Run every 15 minutes";

		case "0 * * * *":
			return "Run every hour";

		case "0 9 * * *":
			return "Run every day at 09:00";

		case "0 9 * * 1-5":
			return "Run Monday through Friday at 09:00";

		case "0 0 * * *":
			return "Run every day at midnight";

		case "0 9 1 * *":
			return "Run at 09:00 on the first day of every month";

		default:
			return "Custom cron schedule";
	}
};

const CronBuilder = (): React.JSX.Element => {
	const [mode, setMode] =
		useState<CronMode>("unix");

	const [expression, setExpression] =
		useState<string>(
			defaultExpression("unix"),
		);

	const [preview, setPreview] =
		useState<CronPreviewResponse | null>(
			null,
		);

	const [loading, setLoading] =
		useState(false);

	const [copied, setCopied] =
		useState(false);

	const fields =
		mode === "unix"
			? UNIX_FIELDS
			: SECONDS_FIELDS;

	const expressionParts = useMemo(
		() =>
			expression
				.trim()
				.split(/\s+/)
				.filter(Boolean),
		[expression],
	);

	/*
	 * Debounce validation để user đang gõ cron
	 * không invoke Rust liên tục.
	 */
	useEffect(() => {
		const timer =
			window.setTimeout(async () => {
				await validateCron();
			}, 300);

		return () =>
			window.clearTimeout(timer);
	}, [expression, mode]);

	const validateCron =
		async (): Promise<void> => {
			setLoading(true);

			try {
				const result =
					await invoke<CronPreviewResponse>(
						"preview_cron",
						{
							expression,
							mode,
							count: 8,
						},
					);

				setPreview(result);
			} catch (error) {
				setPreview({
					valid: false,
					expression,
					nextRuns: [],
					error: String(error),
				});
			} finally {
				setLoading(false);
			}
		};

	const changeMode = (
		nextMode: CronMode,
	): void => {
		if (nextMode === mode) {
			return;
		}

		/*
		 * 5 fields -> 6 fields
		 */
		if (nextMode === "seconds") {
			setExpression(
				`0 ${expression}`,
			);
		} else {
			/*
			 * 6 fields -> 5 fields
			 */
			const currentParts =
				expression
					.trim()
					.split(/\s+/);

			if (
				currentParts.length === 6
			) {
				setExpression(
					currentParts
						.slice(1)
						.join(" "),
				);
			} else {
				setExpression(
					defaultExpression(
						nextMode,
					),
				);
			}
		}

		setMode(nextMode);
	};

	const updateField = (
		index: number,
		value: string,
	): void => {
		const expected =
			fields.length;

		const parts =
			expression
				.trim()
				.split(/\s+/)
				.filter(Boolean);

		/*
		 * Nếu raw expression đang thiếu field,
		 * bổ sung * để field editor vẫn thao tác được.
		 */
		while (
			parts.length < expected
		) {
			parts.push("*");
		}

		parts[index] =
			value || "*";

		setExpression(
			parts
				.slice(0, expected)
				.join(" "),
		);
	};

	const copyCron =
		async (): Promise<void> => {
			await navigator.clipboard.writeText(
				expression,
			);

			setCopied(true);

			window.setTimeout(
				() =>
					setCopied(false),
				1200,
			);
		};

	const reset = (): void => {
		setExpression(
			defaultExpression(mode),
		);
	};

	return (
		<div
			className="
				mx-auto
				flex
				w-full
				max-w-7xl
				flex-col
				gap-6
				p-6
			"
		>
			{/* Header */}

			<div
				className="
					flex
					flex-col
					gap-4
					md:flex-row
					md:items-center
					md:justify-between
				"
			>
				<div>
					<div
						className="
							flex
							items-center
							gap-2
						"
					>
						<Clock3
							className="h-6 w-6"
						/>

						<h1
							className="
								text-2xl
								font-semibold
								tracking-tight
							"
						>
							Cron Builder
						</h1>
					</div>

					<p
						className="
							mt-1
							text-sm
							text-muted-foreground
						"
					>
						Build, validate and preview cron schedules.
					</p>
				</div>

				<div
					className="
						flex
						items-center
						gap-2
					"
				>
					{loading ? (
						<Badge variant="secondary">
							Checking...
						</Badge>
					) : preview?.valid ? (
						<Badge>
							Valid cron
						</Badge>
					) : (
						<Badge variant="destructive">
							Invalid
						</Badge>
					)}

					<Button
						variant="outline"
						onClick={reset}
					>
						<RefreshCcw
							className="
								mr-2
								h-4
								w-4
							"
						/>

						Reset
					</Button>
				</div>
			</div>

			<div
				className="
					grid
					gap-6
					xl:grid-cols-[1fr_420px]
				"
			>
				{/* LEFT */}

				<div
					className="
						flex
						flex-col
						gap-6
					"
				>
					{/* MODE */}

					<Card>
						<CardHeader>
							<CardTitle>
								Cron format
							</CardTitle>

							<CardDescription>
								Choose the cron syntax you want to build.
							</CardDescription>
						</CardHeader>

						<CardContent>
							<Select
								value={mode}
								onValueChange={(
									value,
								) =>
									changeMode(
										value as CronMode,
									)
								}
							>
								<SelectTrigger
									className="
										w-full
										md:w-[340px]
									"
								>
									<SelectValue />
								</SelectTrigger>

								<SelectContent>
									<SelectItem
										value="unix"
									>
										Unix / Linux
										— 5 fields
									</SelectItem>

									<SelectItem
										value="seconds"
									>
										Cron with
										seconds —
										6 fields
									</SelectItem>
								</SelectContent>
							</Select>
						</CardContent>
					</Card>

					{/* PRESETS */}

					<Card>
						<CardHeader>
							<CardTitle>
								Quick presets
							</CardTitle>

							<CardDescription>
								Common schedules for development and DevOps.
							</CardDescription>
						</CardHeader>

						<CardContent
							className="
								flex
								flex-wrap
								gap-2
							"
						>
							{PRESETS.map(
								(preset) => (
									<Button
										key={
											preset.label
										}
										variant="outline"
										size="sm"
										onClick={() =>
											setExpression(
												presetExpression(
													preset,
													mode,
												),
											)
										}
									>
										{
											preset.label
										}
									</Button>
								),
							)}
						</CardContent>
					</Card>

					{/* FIELD BUILDER */}

					<Card>
						<CardHeader>
							<CardTitle>
								Schedule
							</CardTitle>

							<CardDescription>
								Edit individual cron fields.
							</CardDescription>
						</CardHeader>

						<CardContent>
							<div
								className="
									grid
									gap-4
									sm:grid-cols-2
									lg:grid-cols-3
									xl:grid-cols-5
								"
							>
								{fields.map(
									(
										field,
										index,
									) => (
										<div
											key={
												field.label
											}
											className="
												space-y-2
											"
										>
											<Label>
												{
													field.label
												}
											</Label>

											<Input
												className="
													font-mono
												"
												value={
													expressionParts[
														index
													] ??
													""
												}
												onChange={(
													event,
												) =>
													updateField(
														index,
														event
															.target
															.value,
													)
												}
											/>

											<p
												className="
													text-xs
													text-muted-foreground
												"
											>
												{
													field.description
												}
											</p>
										</div>
									),
								)}
							</div>
						</CardContent>
					</Card>

					{/* RAW CRON */}

					<Card>
						<CardHeader>
							<CardTitle>
								Cron expression
							</CardTitle>

							<CardDescription>
								You can edit the expression directly.
							</CardDescription>
						</CardHeader>

						<CardContent
							className="
								space-y-4
							"
						>
							<div
								className="
									flex
									gap-2
								"
							>
								<Input
									value={
										expression
									}
									onChange={(
										event,
									) =>
										setExpression(
											event
												.target
												.value,
										)
									}
									className="
										h-12
										font-mono
										text-base
									"
								/>

								<Button
									variant="outline"
									size="icon"
									className="
										h-12
										w-12
										shrink-0
									"
									onClick={
										copyCron
									}
								>
									{copied ? (
										<Check
											className="
												h-4
												w-4
											"
										/>
									) : (
										<Copy
											className="
												h-4
												w-4
											"
										/>
									)}
								</Button>
							</div>

							<div
								className="
									rounded-lg
									border
									bg-muted/40
									p-4
								"
							>
								<div
									className="
										flex
										gap-3
									"
								>
									<Terminal
										className="
											mt-0.5
											h-4
											w-4
										"
									/>

									<div>
										<p
											className="
												font-medium
											"
										>
											{describeCron(
												expression,
												mode,
											)}
										</p>

										<p
											className="
												mt-1
												text-xs
												text-muted-foreground
											"
										>
											{mode ===
											"unix"
												? "minute · hour · day · month · weekday"
												: "second · minute · hour · day · month · weekday"}
										</p>
									</div>
								</div>
							</div>

							{preview &&
								!preview.valid && (
									<div
										className="
											rounded-md
											border
											border-destructive/40
											bg-destructive/5
											p-3
											text-sm
											text-destructive
										"
									>
										{
											preview.error
										}
									</div>
								)}
						</CardContent>
					</Card>
				</div>

				{/* RIGHT */}

				<Card
					className="
						h-fit
						xl:sticky
						xl:top-6
					"
				>
					<CardHeader>
						<div
							className="
								flex
								items-center
								gap-2
							"
						>
							<CalendarClock
								className="
									h-5
									w-5
								"
							/>

							<CardTitle>
								Next executions
							</CardTitle>
						</div>

						<CardDescription>
							Calculated by Rust using your local timezone.
						</CardDescription>
					</CardHeader>

					<CardContent>
						{preview?.valid &&
						preview.nextRuns
							.length >
							0 ? (
							<div>
								{preview.nextRuns.map(
									(
										run,
										index,
									) => (
										<div
											key={`${run}-${index}`}
										>
											<div
												className="
													flex
													items-center
													gap-3
													py-3
												"
											>
												<div
													className="
														flex
														h-7
														w-7
														items-center
														justify-center
														rounded-full
														bg-muted
														text-xs
														font-semibold
													"
												>
													{index +
														1}
												</div>

												<code
													className="
														text-sm
													"
												>
													{
														run
													}
												</code>
											</div>

											{index <
												preview
													.nextRuns
													.length -
													1 && (
												<Separator />
											)}
										</div>
									),
								)}
							</div>
						) : (
							<div
								className="
									rounded-lg
									border
									border-dashed
									p-8
									text-center
									text-sm
									text-muted-foreground
								"
							>
								Enter a valid
								cron expression
								to see upcoming
								executions.
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			{/* CHEATSHEET */}

			<Card>
				<CardHeader>
					<CardTitle>
						Cron syntax
					</CardTitle>
				</CardHeader>

				<CardContent
					className="
						grid
						gap-3
						md:grid-cols-4
					"
				>
					<SyntaxItem
						code="*"
						text="Any value"
					/>

					<SyntaxItem
						code="*/5"
						text="Every 5 units"
					/>

					<SyntaxItem
						code="1-5"
						text="Range"
					/>

					<SyntaxItem
						code="1,3,5"
						text="Specific values"
					/>
				</CardContent>
			</Card>
		</div>
	);
};

type SyntaxItemProps = {
	code: string;
	text: string;
};

const SyntaxItem = ({
	code,
	text,
}: SyntaxItemProps) => (
	<div
		className="
			rounded-md
			bg-muted/50
			p-3
		"
	>
		<code className="font-semibold">
			{code}
		</code>

		<p
			className="
				mt-1
				text-sm
				text-muted-foreground
			"
		>
			{text}
		</p>
	</div>
);

export default CronBuilder;