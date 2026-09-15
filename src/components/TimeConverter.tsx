import { useMemo, useState } from "react";
import { Check, Clipboard, Clock3 } from "lucide-react";
import { Button } from "./ui/button";
import "./TimeConverter.css";

type SourceType =
	| "unix-seconds"
	| "unix-milliseconds"
	| "timestamp"
	| "timestampz";

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

function parseOffset(value: string) {
	const match = /^UTC([+-])(\d{2}):(\d{2})$/.exec(value);
	if (!match) return 0;
	const minutes = Number(match[2]) * 60 + Number(match[3]);
	return (match[1] === "+" ? 1 : -1) * minutes;
}

function parseDate(value: string, source: SourceType): Date | null {
	if (!value.trim()) return null;
	if (source === "unix-seconds" || source === "unix-milliseconds") {
		const timestamp = Number(value);
		if (!Number.isFinite(timestamp)) return null;
		const date = new Date(
			source === "unix-seconds" ? timestamp * 1000 : timestamp,
		);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	// A timestamp without an explicit zone is interpreted as UTC, whereas timestampz/ISO keeps its provided zone.
	const normalized =
		source === "timestamp" && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)
			? `${value.trim().replace(" ", "T")}Z`
			: value.trim().replace(" ", "T");
	const date = new Date(normalized);
	return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date, format: string, offsetMinutes: number) {
	const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
	const tokens: Record<string, string> = {
		yyyy: String(shifted.getUTCFullYear()),
		MM: pad(shifted.getUTCMonth() + 1),
		dd: pad(shifted.getUTCDate()),
		HH: pad(shifted.getUTCHours()),
		mm: pad(shifted.getUTCMinutes()),
		ss: pad(shifted.getUTCSeconds()),
		SSS: pad(shifted.getUTCMilliseconds(), 3),
	};
	return format.replace(/yyyy|SSS|MM|dd|HH|mm|ss/g, (token) => tokens[token]);
}

const TimeConverter: React.FC = (): React.JSX.Element => {
	const [sourceType, setSourceType] = useState<SourceType>("unix-seconds");
	const [value, setValue] = useState(String(Math.floor(Date.now() / 1000)));
	const [targetOffset, setTargetOffset] = useState("UTC+07:00");
	const [format, setFormat] = useState("dd-MM-yyyy HH:mm:ss");
	const [copied, setCopied] = useState(false);
	const date = useMemo(
		() => parseDate(value, sourceType),
		[value, sourceType],
	);
	const result = date
		? formatDate(date, format, parseOffset(targetOffset))
		: null;

	const copyResult = async () => {
		if (!result) return;
		await navigator.clipboard.writeText(result);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1500);
	};

	return (
		<section className="time-converter view-container">
			<div className="time-converter-heading">
				<div>
					<h2>
						<Clock3 size={24} /> Time Converter
					</h2>
					<p>
						Chuyển đổi Unix time, timestamp, timestampz và UTC sang
						múi giờ cùng định dạng bạn cần.
					</p>
				</div>
			</div>
			<div className="time-converter-grid">
				<label>
					Nguồn dữ liệu
					<select
						value={sourceType}
						onChange={(event) =>
							setSourceType(event.target.value as SourceType)
						}
					>
						<option value="unix-seconds">Unix time (giây)</option>
						<option value="unix-milliseconds">
							Unix time (mili-giây)
						</option>
						<option value="timestamp">Timestamp UTC</option>
						<option value="timestampz">
							Timestampz / ISO 8601
						</option>
					</select>
				</label>
				<label>
					Giá trị
					<input
						value={value}
						onChange={(event) => setValue(event.target.value)}
						placeholder="Ví dụ: 1735689600"
					/>
				</label>
				<label>
					Múi giờ đích
					<select
						value={targetOffset}
						onChange={(event) =>
							setTargetOffset(event.target.value)
						}
					>
						{[
							"UTC-12:00",
							"UTC-08:00",
							"UTC-05:00",
							"UTC+00:00",
							"UTC+01:00",
							"UTC+07:00",
							"UTC+08:00",
							"UTC+09:00",
							"UTC+10:00",
						].map((zone) => (
							<option key={zone}>{zone}</option>
						))}
					</select>
				</label>
				<label>
					Định dạng đầu ra
					<input
						value={format}
						onChange={(event) => setFormat(event.target.value)}
						placeholder="dd-MM-yyyy HH:mm:ss"
					/>
				</label>
			</div>
			<div className={`time-result ${result ? "" : "invalid"}`}>
				<span>Kết quả</span>
				<output>{result ?? "Giá trị thời gian không hợp lệ"}</output>
				{result && (
					<Button
						variant="secondary"
						size="sm"
						onClick={() => void copyResult()}
					>
						{copied ? <Check size={15} /> : <Clipboard size={15} />}
						{copied ? "Đã chép" : "Sao chép"}
					</Button>
				)}
			</div>
			<div className="format-hint">
				<strong>Token hỗ trợ:</strong> <code>dd</code> ngày,{" "}
				<code>MM</code> tháng, <code>yyyy</code> năm, <code>HH</code>{" "}
				giờ, <code>mm</code> phút, <code>ss</code> giây,{" "}
				<code>SSS</code> mili-giây.
			</div>
		</section>
	);
};

export default TimeConverter;
