// src/components/FakeDataGenerator.tsx
//
// Component chọn loại database -> khai báo cột (tên + kiểu dữ liệu) -> nhập số
// bản ghi -> gọi lệnh Tauri `generate_fake_data` (xem fake_data.rs) để sinh
// mảng dữ liệu giả tương ứng.
//
// Cải tiến so với bản đầu:
//  - Tự động gợi ý "kind" theo tên cột (age -> tuổi 1-90, address -> địa chỉ đầy
//    đủ, id -> số tự tăng, price/amount -> tiền...), người dùng vẫn có thể chọn
//    tay để ghi đè gợi ý.
//  - Preset dựng sẵn cho vài bảng thường gặp (Người dùng, Sản phẩm, Đơn hàng).
//  - Option kiểu dữ liệu được gom nhóm (theo DB / ngữ nghĩa thông minh).
//
// Yêu cầu: @tauri-apps/api đã cài trong project (Tauri v2 -> import từ "@tauri-apps/api/core")

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// ---------- Cấu hình kiểu dữ liệu theo từng loại database ----------

type ColumnOption = { label: string; kind: string };

const DB_TYPES = [
	"Oracle",
	"MySQL",
	"PostgreSQL",
	"SQL Server",
	"SQLite",
] as const;
type DbType = (typeof DB_TYPES)[number];

// Kiểu dữ liệu SQL đặc trưng của mỗi DB -> map sang "kind" chung để Rust sinh giá trị
const SQL_TYPE_OPTIONS: Record<DbType, ColumnOption[]> = {
	Oracle: [
		{ label: "VARCHAR2", kind: "string" },
		{ label: "CHAR", kind: "string" },
		{ label: "NUMBER", kind: "int" },
		{ label: "FLOAT", kind: "float" },
		{ label: "DATE", kind: "date" },
		{ label: "TIMESTAMP", kind: "datetime" },
		{ label: "CLOB", kind: "text" },
	],
	MySQL: [
		{ label: "VARCHAR", kind: "string" },
		{ label: "INT", kind: "int" },
		{ label: "FLOAT", kind: "float" },
		{ label: "BOOLEAN", kind: "boolean" },
		{ label: "DATE", kind: "date" },
		{ label: "DATETIME", kind: "datetime" },
		{ label: "TEXT", kind: "text" },
	],
	PostgreSQL: [
		{ label: "VARCHAR", kind: "string" },
		{ label: "INTEGER", kind: "int" },
		{ label: "NUMERIC", kind: "float" },
		{ label: "BOOLEAN", kind: "boolean" },
		{ label: "DATE", kind: "date" },
		{ label: "TIMESTAMP", kind: "datetime" },
		{ label: "UUID", kind: "uuid" },
		{ label: "TEXT", kind: "text" },
	],
	"SQL Server": [
		{ label: "NVARCHAR", kind: "string" },
		{ label: "INT", kind: "int" },
		{ label: "FLOAT", kind: "float" },
		{ label: "BIT", kind: "boolean" },
		{ label: "DATE", kind: "date" },
		{ label: "DATETIME2", kind: "datetime" },
		{ label: "UNIQUEIDENTIFIER", kind: "uuid" },
	],
	SQLite: [
		{ label: "TEXT", kind: "string" },
		{ label: "INTEGER", kind: "int" },
		{ label: "REAL", kind: "float" },
		{ label: "NUMERIC", kind: "float" },
		{ label: "BLOB", kind: "text" },
	],
};

// Các kiểu "ngữ nghĩa" dùng chung cho mọi DB — sinh dữ liệu hợp lý hơn kiểu SQL thô
const SEMANTIC_OPTIONS: ColumnOption[] = [
	{ label: "ID tự tăng", kind: "sequence" },
	{ label: "Tuổi (1-90)", kind: "age" },
	{ label: "Giá tiền", kind: "price" },
	{ label: "Họ tên", kind: "name" },
	{ label: "Email", kind: "email" },
	{ label: "Username", kind: "username" },
	{ label: "Số điện thoại", kind: "phone" },
	{ label: "Địa chỉ đầy đủ", kind: "full_address" },
	{ label: "Thành phố", kind: "city" },
	{ label: "Quốc gia", kind: "country" },
	{ label: "UUID", kind: "uuid" },
	{ label: "Đoạn văn ngắn", kind: "text" },
	{ label: "Từ ngẫu nhiên", kind: "word" },
];

function optionsForDb(db: DbType): {
	dbGroup: ColumnOption[];
	semanticGroup: ColumnOption[];
} {
	return { dbGroup: SQL_TYPE_OPTIONS[db], semanticGroup: SEMANTIC_OPTIONS };
}

// ---------- Tự động gợi ý "kind" theo tên cột ----------
// Trả về null nếu không nhận diện được -> giữ nguyên lựa chọn hiện tại.
function suggestKindFromName(rawName: string): string | null {
	const name = rawName.trim().toLowerCase();
	if (!name) return null;

	const rules: [RegExp, string][] = [
		[/^id$|_id$|^ma_|^ma$/, "sequence"],
		[/uuid/, "uuid"],
		[/email/, "email"],
		[/(phone|sdt|dien_thoai|so_dien_thoai)/, "phone"],
		[/(age|tuoi)/, "age"],
		[/(price|amount|gia|tien|salary|luong)/, "price"],
		[/(address|dia_chi)/, "full_address"],
		[/(city|thanh_pho|tinh)/, "city"],
		[/(country|quoc_gia)/, "country"],
		[/(full_name|fullname|ho_ten|^name$|ten_)/, "name"],
		[/username|user_name/, "username"],
		[/(created_at|updated_at|_at$|datetime|thoi_gian)/, "datetime"],
		[/(date|ngay)/, "date"],
		[/(is_|active|enabled|^bool)/, "boolean"],
		[/(description|note|content|mo_ta|ghi_chu)/, "text"],
	];

	for (const [pattern, kind] of rules) {
		if (pattern.test(name)) return kind;
	}
	return null;
}

// ---------- Preset dựng sẵn ----------

type Preset = { label: string; columns: { name: string; kind: string }[] };

const PRESETS: Preset[] = [
	{
		label: "Người dùng",
		columns: [
			{ name: "id", kind: "sequence" },
			{ name: "full_name", kind: "name" },
			{ name: "email", kind: "email" },
			{ name: "age", kind: "age" },
			{ name: "address", kind: "full_address" },
		],
	},
	{
		label: "Sản phẩm",
		columns: [
			{ name: "id", kind: "sequence" },
			{ name: "product_name", kind: "word" },
			{ name: "price", kind: "price" },
			{ name: "in_stock", kind: "boolean" },
		],
	},
	{
		label: "Đơn hàng",
		columns: [
			{ name: "id", kind: "sequence" },
			{ name: "customer_name", kind: "name" },
			{ name: "amount", kind: "price" },
			{ name: "created_at", kind: "datetime" },
		],
	},
];

// ---------- Kiểu dữ liệu state ----------

type ColumnRow = {
	id: string;
	name: string;
	kind: string;
	/** true khi người dùng đã tự tay chọn kind -> ngừng auto-suggest cho dòng này */
	touched: boolean;
};

function newColumn(defaultKind: string): ColumnRow {
	return {
		id: crypto.randomUUID(),
		name: "",
		kind: defaultKind,
		touched: false,
	};
}

export default function FakeDataGenerator() {
	const [dbType, setDbType] = useState<DbType>("PostgreSQL");
	const [columns, setColumns] = useState<ColumnRow[]>([
		newColumn(optionsForDb("PostgreSQL").dbGroup[0].kind),
	]);
	const [recordCount, setRecordCount] = useState<number>(10);
	const [autoDetect, setAutoDetect] = useState(true);
	const [results, setResults] = useState<Record<string, unknown>[] | null>(
		null,
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { dbGroup, semanticGroup } = optionsForDb(dbType);
	const allOptions = [...dbGroup, ...semanticGroup];

	function handleDbChange(next: DbType) {
		setDbType(next);
		setResults(null);
	}

	function applyPreset(preset: Preset) {
		setColumns(
			preset.columns.map((c) => ({
				id: crypto.randomUUID(),
				name: c.name,
				kind: c.kind,
				touched: true, // preset đã chọn kind rõ ràng, không cần auto-suggest ghi đè
			})),
		);
		setResults(null);
	}

	function addColumn() {
		setColumns((cols) => [...cols, newColumn(dbGroup[0].kind)]);
	}

	function removeColumn(id: string) {
		setColumns((cols) =>
			cols.length > 1 ? cols.filter((c) => c.id !== id) : cols,
		);
	}

	function handleNameChange(id: string, name: string) {
		setColumns((cols) =>
			cols.map((c) => {
				if (c.id !== id) return c;
				if (autoDetect && !c.touched) {
					const suggested = suggestKindFromName(name);
					if (suggested) return { ...c, name, kind: suggested };
				}
				return { ...c, name };
			}),
		);
	}

	function handleKindChange(id: string, kind: string) {
		setColumns((cols) =>
			cols.map((c) => (c.id === id ? { ...c, kind, touched: true } : c)),
		);
	}

	async function handleGenerate() {
		setError(null);

		const trimmed = columns.map((c) => ({ ...c, name: c.name.trim() }));
		if (trimmed.some((c) => !c.name)) {
			setError("Vui lòng nhập tên cho tất cả các cột.");
			return;
		}
		const names = trimmed.map((c) => c.name);
		if (new Set(names).size !== names.length) {
			setError("Tên cột bị trùng nhau.");
			return;
		}
		if (!recordCount || recordCount < 1) {
			setError("Số bản ghi phải lớn hơn 0.");
			return;
		}

		setLoading(true);
		try {
			const rows = await invoke<Record<string, unknown>[]>(
				"generate_fake_data",
				{
					args: {
						db_type: dbType,
						columns: trimmed.map((c) => ({
							name: c.name,
							kind: c.kind,
						})),
						record_count: recordCount,
					},
				},
			);
			setResults(rows);
		} catch (e) {
			setError(typeof e === "string" ? e : "Sinh dữ liệu thất bại.");
		} finally {
			setLoading(false);
		}
	}

	function exportJson() {
		if (!results) return;
		downloadBlob(
			JSON.stringify(results, null, 2),
			"fake-data.json",
			"application/json",
		);
	}

	function exportCsv() {
		if (!results || results.length === 0) return;
		const headers = Object.keys(results[0]);
		const csvLines = [
			headers.join(","),
			...results.map((row) =>
				headers.map((h) => csvEscape(row[h])).join(","),
			),
		];
		downloadBlob(csvLines.join("\n"), "fake-data.csv", "text/csv");
	}

	const kindLabel = (kind: string) =>
		allOptions.find((o) => o.kind === kind)?.label ?? kind;

	return (
		<div className="fdg" style={styles.root}>
			<style>{cssVars}</style>

			{/* Preset nhanh */}
			<div style={styles.section}>
				<div style={styles.label}>Mẫu dựng sẵn</div>
				<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					{PRESETS.map((p) => (
						<button
							key={p.label}
							type="button"
							style={styles.chipButton}
							onClick={() => applyPreset(p)}
						>
							{p.label}
						</button>
					))}
				</div>
			</div>

			{/* Chọn loại database */}
			<div style={styles.section}>
				<div style={styles.label}>Loại database</div>
				<select
					value={dbType}
					onChange={(e) => handleDbChange(e.target.value as DbType)}
					style={styles.select}
				>
					{DB_TYPES.map((db) => (
						<option key={db} value={db}>
							{db}
						</option>
					))}
				</select>
			</div>

			{/* Danh sách cột */}
			<div style={styles.section}>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: 8,
					}}
				>
					<div style={styles.label}>Cột dữ liệu</div>
					<label style={styles.autoToggle}>
						<input
							type="checkbox"
							checked={autoDetect}
							onChange={(e) => setAutoDetect(e.target.checked)}
						/>
						Tự động gợi ý kiểu theo tên cột
					</label>
				</div>

				<div
					style={{ display: "flex", flexDirection: "column", gap: 6 }}
				>
					{columns.map((col) => {
						const suggested =
							autoDetect &&
							!col.touched &&
							suggestKindFromName(col.name);
						return (
							<div key={col.id} style={styles.columnRow}>
								<input
									type="text"
									placeholder="Tên cột (vd: full_name)"
									value={col.name}
									onChange={(e) =>
										handleNameChange(col.id, e.target.value)
									}
									style={{
										...styles.input,
										flex: 1,
										fontFamily: "var(--fdg-mono)",
									}}
								/>
								<select
									value={col.kind}
									onChange={(e) =>
										handleKindChange(col.id, e.target.value)
									}
									style={{ ...styles.select, width: 190 }}
								>
									<optgroup label={`Kiểu ${dbType}`}>
										{dbGroup.map((opt) => (
											<option
												key={opt.label}
												value={opt.kind}
											>
												{opt.label}
											</option>
										))}
									</optgroup>
									<optgroup label="Ngữ nghĩa thông minh">
										{semanticGroup.map((opt) => (
											<option
												key={opt.label}
												value={opt.kind}
											>
												{opt.label}
											</option>
										))}
									</optgroup>
								</select>
								<button
									type="button"
									onClick={() => removeColumn(col.id)}
									disabled={columns.length === 1}
									style={styles.iconButton}
									title="Xoá cột"
								>
									✕
								</button>
								{suggested && suggested !== col.kind && (
									<span style={styles.hint}>
										gợi ý: {kindLabel(suggested)}
									</span>
								)}
							</div>
						);
					})}
				</div>
				<button
					type="button"
					onClick={addColumn}
					style={{ ...styles.chipButton, marginTop: 10 }}
				>
					+ Thêm cột
				</button>
			</div>

			{/* Số bản ghi + generate */}
			<div
				style={{
					...styles.section,
					display: "flex",
					gap: 16,
					alignItems: "flex-end",
					flexWrap: "wrap",
				}}
			>
				<div>
					<div style={styles.label}>Số bản ghi</div>
					<input
						type="number"
						min={1}
						max={1_000_000}
						value={recordCount}
						onChange={(e) =>
							setRecordCount(parseInt(e.target.value, 10) || 0)
						}
						style={{ ...styles.input, width: 140 }}
					/>
				</div>
				<button
					type="button"
					onClick={handleGenerate}
					disabled={loading}
					style={styles.primaryButton}
				>
					{loading ? "Đang sinh dữ liệu…" : "Generate"}
				</button>
			</div>

			{error && <div style={styles.error}>{error}</div>}

			{/* Kết quả */}
			{results && results.length > 0 && (
				<div style={styles.section}>
					<div
						style={{
							display: "flex",
							gap: 8,
							marginBottom: 10,
							alignItems: "center",
						}}
					>
						<span style={{ color: "var(--fdg-muted)" }}>
							{results.length} bản ghi
						</span>
						<button
							type="button"
							onClick={exportJson}
							style={styles.chipButton}
						>
							Export JSON
						</button>
						<button
							type="button"
							onClick={exportCsv}
							style={styles.chipButton}
						>
							Export CSV
						</button>
					</div>
					<div style={styles.tableWrap}>
						<table
							style={{
								borderCollapse: "collapse",
								width: "100%",
								fontFamily: "var(--fdg-mono)",
								fontSize: 13,
							}}
						>
							<thead>
								<tr>
									{Object.keys(results[0]).map((h) => (
										<th key={h} style={styles.th}>
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{results.slice(0, 200).map((row, i) => (
									<tr
										key={i}
										style={
											i % 2 === 1
												? {
														background:
															"var(--fdg-row-alt)",
													}
												: undefined
										}
									>
										{Object.keys(results[0]).map((h) => (
											<td key={h} style={styles.td}>
												{String(row[h])}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
						{results.length > 200 && (
							<div
								style={{
									padding: 10,
									color: "var(--fdg-muted)",
								}}
							>
								Chỉ hiển thị 200/{results.length} dòng đầu tiên
								— export để lấy đủ dữ liệu.
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// ---------- Style (inline, dùng CSS variables để hoà theo theme dark sẵn có) ----------

const cssVars = `
:root {
  --fdg-bg: #1c1c1e;
  --fdg-panel: #232326;
  --fdg-border: #38383c;
  --fdg-text: #e7e7ea;
  --fdg-muted: #9a9aa2;
  --fdg-accent: #5b8cff;
  --fdg-row-alt: #202023;
  --fdg-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
.fdg input, .fdg select, .fdg button { color-scheme: dark; }
.fdg input:focus, .fdg select:focus { outline: 2px solid var(--fdg-accent); outline-offset: 1px; }
`;

const styles: Record<string, React.CSSProperties> = {
	root: {
		display: "flex",
		flexDirection: "column",
		gap: 20,
		color: "var(--fdg-text)",
		maxWidth: 900,
	},
	section: {
		background: "var(--fdg-panel)",
		border: "1px solid var(--fdg-border)",
		borderRadius: 8,
		padding: 14,
	},
	label: {
		fontWeight: 600,
		fontSize: 13,
		color: "var(--fdg-muted)",
		marginBottom: 6,
	},
	input: {
		background: "#141416",
		border: "1px solid var(--fdg-border)",
		borderRadius: 6,
		padding: "7px 10px",
		color: "var(--fdg-text)",
		fontSize: 14,
	},
	select: {
		background: "#141416",
		border: "1px solid var(--fdg-border)",
		borderRadius: 6,
		padding: "7px 10px",
		color: "var(--fdg-text)",
		fontSize: 14,
	},
	columnRow: {
		display: "flex",
		gap: 8,
		alignItems: "center",
		position: "relative",
	},
	hint: {
		position: "absolute",
		right: 40,
		fontSize: 11,
		color: "var(--fdg-accent)",
		pointerEvents: "none",
	},
	iconButton: {
		background: "transparent",
		border: "1px solid var(--fdg-border)",
		borderRadius: 6,
		color: "var(--fdg-muted)",
		width: 32,
		height: 32,
		cursor: "pointer",
	},
	chipButton: {
		background: "#2a2a2e",
		border: "1px solid var(--fdg-border)",
		borderRadius: 6,
		color: "var(--fdg-text)",
		padding: "6px 12px",
		fontSize: 13,
		cursor: "pointer",
	},
	primaryButton: {
		background: "var(--fdg-accent)",
		border: "none",
		borderRadius: 6,
		color: "#fff",
		padding: "9px 20px",
		fontSize: 14,
		fontWeight: 600,
		cursor: "pointer",
	},
	autoToggle: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		fontSize: 12,
		color: "var(--fdg-muted)",
		cursor: "pointer",
	},
	error: {
		color: "#ff6b6b",
		fontSize: 13,
	},
	tableWrap: {
		maxHeight: 420,
		overflow: "auto",
		border: "1px solid var(--fdg-border)",
		borderRadius: 6,
	},
	th: {
		textAlign: "left",
		borderBottom: "1px solid var(--fdg-border)",
		padding: "8px 10px",
		position: "sticky",
		top: 0,
		background: "var(--fdg-panel)",
		color: "var(--fdg-muted)",
		fontWeight: 600,
	},
	td: {
		padding: "6px 10px",
		borderBottom: "1px solid #2a2a2d",
	},
};

// ---------- Helpers ----------

function csvEscape(value: unknown): string {
	const s = value === null || value === undefined ? "" : String(value);
	if (s.includes(",") || s.includes('"') || s.includes("\n")) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

function downloadBlob(content: string, filename: string, mime: string) {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
