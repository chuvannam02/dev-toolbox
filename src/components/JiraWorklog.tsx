import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import {
	CalendarDays,
	CheckCircle2,
	RefreshCw,
	Settings2,
	LoaderCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { DatePicker } from "./ui/date-picker";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type Settings = {
	baseUrl: string;
	email: string;
	workdayStart: number;
	workdayEnd: number;
	mondayToThursdayHours: number;
	fridayHours: number;
	checkHour: number;
	checkMinute: number;
	scheduleEnabled: boolean;
	scheduleFrequency: "daily" | "monthly" | "yearly";
	scheduleDay: number;
	scheduleMonth: number;
	maxMissedChecks: number;
	smtpHost: string;
	smtpPort: number;
	smtpUsername: string;
	smtpFrom: string;
	notificationEmail: string;
	smtpTls: boolean;
	hasJiraToken: boolean;
	hasSmtpPassword: boolean;
};
type Issue = {
	key: string;
	summary: string;
	status: string;
	issueType: string;
	updated: string;
	url: string;
};
type Worklog = {
	date: string;
	issueKey: string;
	summary: string;
	seconds: number;
	comment: string;
	started: string;
	url: string;
};
type CheckResult = {
	date: string;
	loggedSeconds: number;
	expectedSeconds: number;
	sufficient: boolean;
};
const defaults: Settings = {
	baseUrl: "",
	email: "",
	workdayStart: 26,
	workdayEnd: 25,
	mondayToThursdayHours: 9,
	fridayHours: 8,
	checkHour: 15,
	checkMinute: 0,
	scheduleEnabled: false,
	scheduleFrequency: "daily",
	scheduleDay: 1,
	scheduleMonth: 1,
	maxMissedChecks: 3,
	smtpHost: "",
	smtpPort: 587,
	smtpUsername: "",
	smtpFrom: "",
	notificationEmail: "",
	smtpTls: true,
	hasJiraToken: false,
	hasSmtpPassword: false,
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const cycle = (now = new Date()) => {
	const end = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() <= 25 ? 25 : 25,
	);
	if (now.getDate() > 25) end.setMonth(end.getMonth() + 1);
	const start = new Date(end);
	start.setMonth(start.getMonth() - 1);
	start.setDate(26);
	return { from: iso(start), to: iso(end) };
};

export default function JiraWorklog() {
	const [settings, setSettings] = useState<Settings>(defaults);
	const [token, setToken] = useState("");
	const [smtpPassword, setSmtpPassword] = useState("");
	const [range, setRange] = useState(cycle);
	const [issues, setIssues] = useState<Issue[]>([]);
	const [logs, setLogs] = useState<Worklog[]>([]);
	const [view, setView] = useState<
		"tasks" | "logs" | "calendar" | "settings"
	>("tasks");
	const [selectedDate, setSelectedDate] = useState<string | null>(null);
	const [message, setMessage] = useState("");
	const [loading, setLoading] = useState(false);
	useEffect(() => {
		invoke<Settings | null>("get_jira_settings")
			.then((v) => v && setSettings(v))
			.catch(() => undefined);
	}, []);
	const update = (key: keyof Settings, value: string | number | boolean) =>
		setSettings((s) => ({ ...s, [key]: value }));
	const loadIssues = async () => {
		setLoading(true);
		try {
			setIssues(
				await invoke<Issue[]>("get_jira_issues", {
					fromDate: range.from,
					toDate: range.to,
					openOnly: true,
				}),
			);
			setMessage("");
		} catch (e) {
			setMessage(String(e));
		} finally {
			setLoading(false);
		}
	};
	const loadLogs = async () => {
		setLoading(true);
		try {
			setLogs(
				await invoke<Worklog[]>("get_jira_worklogs", {
					fromDate: range.from,
					toDate: range.to,
				}),
			);
			setMessage("");
		} catch (e) {
			setMessage(String(e));
		} finally {
			setLoading(false);
		}
	};
	useEffect(() => {
		if (settings.hasJiraToken) void loadIssues();
	}, [settings.hasJiraToken]);
	const days = useMemo(() => {
		const grouped = new Map<string, Worklog[]>();
		logs.forEach((log) =>
			grouped.set(log.date, [...(grouped.get(log.date) ?? []), log]),
		);
		return [...grouped].map(([date, items]) => ({
			date,
			items,
			seconds: items.reduce((sum, x) => sum + x.seconds, 0),
		}));
	}, [logs]);
	const save = async () => {
		try {
			const saved = await invoke<Settings>("save_jira_settings", {
				input: {
					...settings,
					jiraToken: token || undefined,
					smtpPassword: smtpPassword || undefined,
				},
			});
			setSettings(saved);
			setToken("");
			setSmtpPassword("");
			setMessage(
				"Đã lưu cấu hình. Token và mật khẩu SMTP được lưu trong Windows Credential Manager.",
			);
		} catch (e) {
			setMessage(String(e));
		}
	};
	const test = async () => {
		try {
			setMessage(
				`Kết nối thành công: ${await invoke<string>("test_jira_connection")}`,
			);
		} catch (e) {
			setMessage(String(e));
		}
	};
	const checkToday = async () => {
		setLoading(true);
		try {
			const result = await invoke<CheckResult>(
				"check_jira_worklog_today",
			);
			setMessage(
				`${result.date}: ${(result.loggedSeconds / 3600).toFixed(2)}h / ${(result.expectedSeconds / 3600).toFixed(2)}h — ${result.sufficient ? "đã đủ giờ" : "chưa đủ giờ"}.`,
			);
		} catch (e) {
			setMessage(String(e));
		} finally {
			setLoading(false);
		}
	};
	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="flex items-center gap-2 text-2xl font-semibold">
						<CalendarDays /> Jira Worklog
					</h1>
					<p className="text-sm text-muted-foreground">
						Theo dõi task được giao và worklog theo kỳ lương.
					</p>
				</div>
				<Button variant="outline" onClick={() => setView("settings")}>
					<Settings2 className="mr-2 h-4 w-4" /> Cấu hình
				</Button>
			</div>
			{message && (
				<div className="rounded-md border p-3 text-sm">{message}</div>
			)}
			{loading && (
				<div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
					<LoaderCircle className="size-4 animate-spin" /> Đang tải dữ
					liệu Jira…
				</div>
			)}
			{view === "settings" ? (
				<Card>
					<CardHeader>
						<CardTitle>Kết nối & chính sách công</CardTitle>
						<CardDescription>
							Jira Cloud dùng email Atlassian + API token. URL ví
							dụ: https://your-company.atlassian.net
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 md:grid-cols-2">
						{(
							[
								["baseUrl", "Jira URL"],
								["email", "Email Atlassian"],
								["smtpHost", "SMTP host"],
								["smtpPort", "SMTP port"],
								["smtpUsername", "SMTP username"],
								["smtpFrom", "Email gửi"],
								["notificationEmail", "Email nhận cảnh báo"],
								["mondayToThursdayHours", "Giờ T2–T5"],
								["fridayHours", "Giờ Thứ 6"],
								["checkHour", "Giờ kiểm tra"],
								["checkMinute", "Phút kiểm tra"],
								["maxMissedChecks", "Số lần thiếu tối đa"],
								["workdayStart", "Ngày bắt đầu kỳ"],
								["workdayEnd", "Ngày kết thúc kỳ"],
							] as [keyof Settings, string][]
						).map(([key, label]) => (
							<div key={key}>
								<Label>{label}</Label>
								<Input
									type={
										typeof settings[key] === "number"
											? "number"
											: "text"
									}
									value={String(settings[key])}
									onChange={(e) =>
										update(
											key,
											typeof settings[key] === "number"
												? Number(e.target.value)
												: e.target.value,
										)
									}
								/>
							</div>
						))}
						<div>
							<Label>Lịch kiểm tra</Label>
							<select
								className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
								value={settings.scheduleFrequency}
								onChange={(e) =>
									update(
										"scheduleFrequency",
										e.target
											.value as Settings["scheduleFrequency"],
									)
								}
							>
								<option value="daily">
									Mỗi ngày (Thứ 2–Thứ 6)
								</option>
								<option value="monthly">Mỗi tháng</option>
								<option value="yearly">Mỗi năm</option>
							</select>
						</div>
						{settings.scheduleFrequency !== "daily" && (
							<div>
								<Label>Ngày chạy</Label>
								<Input
									type="number"
									min="1"
									max="31"
									value={settings.scheduleDay}
									onChange={(e) =>
										update(
											"scheduleDay",
											Number(e.target.value),
										)
									}
								/>
							</div>
						)}
						{settings.scheduleFrequency === "yearly" && (
							<div>
								<Label>Tháng chạy</Label>
								<Input
									type="number"
									min="1"
									max="12"
									value={settings.scheduleMonth}
									onChange={(e) =>
										update(
											"scheduleMonth",
											Number(e.target.value),
										)
									}
								/>
							</div>
						)}
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={settings.scheduleEnabled}
								onChange={(e) =>
									update("scheduleEnabled", e.target.checked)
								}
							/>{" "}
							Bật chạy theo lịch đã chọn
						</label>
						<div>
							<Label>
								Jira API token{" "}
								{settings.hasJiraToken && "✓ đã lưu"}
							</Label>
							<Input
								type="password"
								value={token}
								onChange={(e) => setToken(e.target.value)}
								placeholder="Chỉ nhập khi cần thay token"
							/>
						</div>
						<div>
							<Label>
								SMTP password{" "}
								{settings.hasSmtpPassword && "✓ đã lưu"}
							</Label>
							<Input
								type="password"
								value={smtpPassword}
								onChange={(e) =>
									setSmtpPassword(e.target.value)
								}
								placeholder="Chỉ nhập khi cần thay mật khẩu"
							/>
						</div>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={settings.smtpTls}
								onChange={(e) =>
									update("smtpTls", e.target.checked)
								}
							/>{" "}
							Dùng TLS cho SMTP
						</label>
						<div className="flex gap-2 md:col-span-2">
							<Button onClick={save}>Lưu cấu hình</Button>
							<Button variant="outline" onClick={test}>
								Kiểm tra Jira
							</Button>
							<Button
								variant="outline"
								onClick={() => void checkToday()}
								disabled={loading}
							>
								Kiểm tra hôm nay ngay
							</Button>
							<Button
								variant="ghost"
								onClick={() => setView("tasks")}
							>
								Quay lại
							</Button>
						</div>
					</CardContent>
				</Card>
			) : (
				<>
					<Card>
						<CardContent className="flex flex-wrap items-end gap-3 p-4">
							<div>
								<Label>Từ ngày</Label>
								<DatePicker
									label="Chọn ngày bắt đầu"
									value={range.from}
									onChange={(from) =>
										setRange((r) => ({ ...r, from }))
									}
								/>
							</div>
							<div>
								<Label>Đến ngày</Label>
								<DatePicker
									label="Chọn ngày kết thúc"
									value={range.to}
									onChange={(to) =>
										setRange((r) => ({ ...r, to }))
									}
								/>
							</div>
							<Button
								variant={
									view === "tasks" ? "default" : "outline"
								}
								onClick={() => {
									setView("tasks");
									void loadIssues();
								}}
							>
								Task đang mở
							</Button>
							<Button
								variant={
									view === "logs" ? "default" : "outline"
								}
								onClick={() => {
									setView("logs");
									void loadLogs();
								}}
							>
								Worklog theo ngày
							</Button>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant={
											view === "calendar"
												? "default"
												: "outline"
										}
										onClick={() => {
											setView("calendar");
											void loadLogs();
										}}
									>
										Lịch worklog
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									Hiển thị tổng giờ theo ngày; click một ngày
									để xem chi tiết.
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="icon"
										variant="outline"
										onClick={() =>
											view === "tasks"
												? void loadIssues()
												: void loadLogs()
										}
										disabled={loading}
									>
										<RefreshCw
											className={
												loading ? "animate-spin" : ""
											}
										/>
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									Làm mới dữ liệu của tab hiện tại
								</TooltipContent>
							</Tooltip>
						</CardContent>
					</Card>
					{view === "tasks" ? (
						<Card>
							<CardHeader>
								<CardTitle>Task của tôi</CardTitle>
								<CardDescription>
									To Do, In Progress, In Review và Reopened.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Table
									headers={[
										"Key",
										"Tóm tắt",
										"Trạng thái",
										"Loại",
										"Cập nhật",
									]}
									rows={issues.map((x) => [
										<a
											className="text-primary underline"
											href={x.url}
											target="_blank"
										>
											{x.key}
										</a>,
										x.summary,
										x.status,
										x.issueType,
										x.updated.slice(0, 10),
									])}
								/>
							</CardContent>
						</Card>
					) : view === "calendar" ? (
						<Card>
							<CardHeader>
								<CardTitle>Lịch worklog</CardTitle>
								<CardDescription>
									Chọn một ngày để mở chi tiết worklog.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
									{days.map((day) => (
										<Tooltip key={day.date}>
											<TooltipTrigger asChild>
												<button
													onClick={() =>
														setSelectedDate(
															day.date,
														)
													}
													className={`rounded-md border p-3 text-left hover:bg-muted ${selectedDate === day.date ? "border-primary bg-primary/5" : ""}`}
												>
													<div className="text-xs text-muted-foreground">
														{day.date}
													</div>
													<div className="mt-1 font-semibold">
														{(
															day.seconds / 3600
														).toFixed(2)}
														h
													</div>
												</button>
											</TooltipTrigger>
											<TooltipContent>
												Click để xem các task đã log
												trong ngày này
											</TooltipContent>
										</Tooltip>
									))}
								</div>
								{selectedDate && (
									<div className="mt-5 rounded-lg border p-4">
										<div className="mb-3 flex items-center justify-between">
											<h3 className="font-semibold">
												Chi tiết {selectedDate}
											</h3>
											<Button
												size="sm"
												variant="ghost"
												onClick={() =>
													setSelectedDate(null)
												}
											>
												Đóng
											</Button>
										</div>
										<Table
											headers={[
												"Task",
												"Tóm tắt",
												"Thời gian",
												"Ghi chú",
											]}
											rows={(
												days.find(
													(day) =>
														day.date ===
														selectedDate,
												)?.items ?? []
											).map((x) => [
												<a
													className="text-primary underline"
													href={x.url}
													target="_blank"
													rel="noreferrer"
												>
													{x.issueKey}
												</a>,
												x.summary,
												`${(x.seconds / 3600).toFixed(2)}h`,
												x.comment,
											])}
										/>
									</div>
								)}
								{!days.length && (
									<p className="text-sm text-muted-foreground">
										Chưa có worklog trong khoảng đã chọn.
									</p>
								)}
							</CardContent>
						</Card>
					) : (
						<Card>
							<CardHeader>
								<CardTitle>Worklog theo ngày</CardTitle>
								<CardDescription>
									Kỳ {range.from} → {range.to}. Giờ yêu cầu có
									thể điều chỉnh trong Cấu hình.
								</CardDescription>
							</CardHeader>
							<CardContent>
								{days.map((day) => (
									<div
										className="mb-5 rounded-lg border p-3"
										key={day.date}
									>
										<div className="mb-2 flex justify-between font-medium">
											<span>{day.date}</span>
											<span className="flex items-center gap-1">
												{day.seconds / 3600}h{" "}
												<CheckCircle2 className="h-4 w-4" />
											</span>
										</div>
										<Table
											headers={[
												"Task",
												"Tóm tắt",
												"Thời gian",
												"Ghi chú",
											]}
											rows={day.items.map((x) => [
												<a
													className="text-primary underline"
													href={x.url}
													target="_blank"
													rel="noreferrer"
												>
													{x.issueKey}
												</a>,
												x.summary,
												`${(x.seconds / 3600).toFixed(2)}h`,
												x.comment,
											])}
										/>
									</div>
								))}
								{!days.length && (
									<p className="text-sm text-muted-foreground">
										Chưa có worklog trong khoảng đã chọn.
									</p>
								)}
							</CardContent>
						</Card>
					)}
				</>
			)}
		</div>
	);
}
function Table({
	headers,
	rows,
}: {
	headers: string[];
	rows: React.ReactNode[][];
}) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-left text-sm">
				<thead className="border-b text-muted-foreground">
					<tr>
						{headers.map((h) => (
							<th className="p-2" key={h}>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, i) => (
						<tr className="border-b" key={i}>
							{row.map((cell, j) => (
								<td className="p-2" key={j}>
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
