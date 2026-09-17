import type { Dispatch, SetStateAction } from "react";

export type ColumnOption = {
	label: string;
	kind: string;
};

export type ColumnRow = {
	id: string;
	name: string;
	kind: string;

	/**
	 * true khi user đã tự chọn kind.
	 * Khi đó auto detect sẽ không ghi đè nữa.
	 */
	touched: boolean;
};

type Props = {
	columns: ColumnRow[];
	setColumns: Dispatch<SetStateAction<ColumnRow[]>>;
	dbType: string;
	dbGroup: ColumnOption[];
	semanticGroup: ColumnOption[];
	autoDetect: boolean;
	setAutoDetect: Dispatch<SetStateAction<boolean>>;
};

export default function ManualColumnsSection({
	columns,
	setColumns,

	dbType,

	dbGroup,
	semanticGroup,

	autoDetect,
	setAutoDetect,
}: Props) {
	const allOptions = [...dbGroup, ...semanticGroup];

	function kindLabel(kind: string): string {
		return allOptions.find((option) => option.kind === kind)?.label ?? kind;
	}

	function addColumn() {
		setColumns((current) => [
			...current,

			newColumn(dbGroup[0]?.kind ?? "word"),
		]);
	}

	function removeColumn(id: string) {
		setColumns((current) => {
			// Luôn giữ lại ít nhất 1 cột
			if (current.length <= 1) {
				return current;
			}

			return current.filter((column) => column.id !== id);
		});
	}

	function handleNameChange(id: string, name: string) {
		setColumns((current) =>
			current.map((column) => {
				if (column.id !== id) {
					return column;
				}

				/*
				 * Nếu auto detect đang bật
				 * và user chưa chủ động chọn kind
				 * thì tự suy luận kind theo tên cột.
				 */
				if (autoDetect && !column.touched) {
					const suggested = suggestKindFromName(name);

					if (suggested) {
						return {
							...column,

							name,

							kind: suggested,
						};
					}
				}

				return {
					...column,
					name,
				};
			}),
		);
	}

	function handleKindChange(id: string, kind: string) {
		setColumns((current) =>
			current.map((column) =>
				column.id === id
					? {
							...column,

							kind,

							/*
							 * User đã tự chọn.
							 * Không auto detect ghi đè.
							 */
							touched: true,
						}
					: column,
			),
		);
	}

	function resetAutoDetect(id: string) {
		setColumns((current) =>
			current.map((column) => {
				if (column.id !== id) {
					return column;
				}

				const suggested = suggestKindFromName(column.name);

				return {
					...column,

					touched: false,

					kind: suggested ?? dbGroup[0]?.kind ?? column.kind,
				};
			}),
		);
	}

	return (
		<div style={styles.section}>
			{/* Header */}

			<div
				style={{
					display: "flex",

					justifyContent: "space-between",

					alignItems: "center",

					marginBottom: 8,

					gap: 16,

					flexWrap: "wrap",
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

			{/* Column list */}

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 8,
				}}
			>
				{columns.map((column) => {
					const suggested =
						autoDetect && !column.touched
							? suggestKindFromName(column.name)
							: null;

					return (
						<div key={column.id} style={styles.columnRow}>
							{/* Column name */}

							<input
								type="text"
								placeholder="Tên cột (vd: full_name)"
								value={column.name}
								onChange={(e) =>
									handleNameChange(column.id, e.target.value)
								}
								style={{
									...styles.input,

									flex: 1,

									minWidth: 180,

									fontFamily: "var(--fdg-mono)",
								}}
							/>

							{/* Kind */}

							<select
								value={column.kind}
								onChange={(e) =>
									handleKindChange(column.id, e.target.value)
								}
								style={{
									...styles.select,

									width: 210,
								}}
							>
								<optgroup label={`Kiểu ${dbType}`}>
									{dbGroup.map((option) => (
										<option
											key={`${option.label}-${option.kind}`}
											value={option.kind}
										>
											{option.label}
										</option>
									))}
								</optgroup>

								<optgroup label="Ngữ nghĩa thông minh">
									{semanticGroup.map((option) => (
										<option
											key={`${option.label}-${option.kind}`}
											value={option.kind}
										>
											{option.label}
										</option>
									))}
								</optgroup>
							</select>

							{/* Reset auto detect */}

							{column.touched && (
								<button
									type="button"
									onClick={() => resetAutoDetect(column.id)}
									style={styles.secondaryIconButton}
									title="Cho phép tự động nhận diện lại"
								>
									↻
								</button>
							)}

							{/* Delete */}

							<button
								type="button"
								onClick={() => removeColumn(column.id)}
								disabled={columns.length === 1}
								style={{
									...styles.iconButton,

									opacity: columns.length === 1 ? 0.4 : 1,
								}}
								title="Xoá cột"
							>
								✕
							</button>

							{/* Suggestion */}

							{suggested && suggested !== column.kind && (
								<span style={styles.hint}>
									gợi ý: {kindLabel(suggested)}
								</span>
							)}
						</div>
					);
				})}
			</div>

			{/* Add column */}

			<button
				type="button"
				onClick={addColumn}
				style={{
					...styles.chipButton,
					marginTop: 12,
				}}
			>
				+ Thêm cột
			</button>
		</div>
	);
}

/**
 * Tạo một column mới.
 */
export function newColumn(defaultKind: string): ColumnRow {
	return {
		id: crypto.randomUUID(),

		name: "",

		kind: defaultKind,

		touched: false,
	};
}

/**
 * Suy luận loại fake-data dựa vào tên column.
 *
 * Ví dụ:
 *
 * email -> email
 * full_name -> name
 * customer_id -> sequence
 * price -> price
 * created_at -> datetime
 */
function suggestKindFromName(rawName: string): string | null {
	const name = rawName.trim().toLowerCase();

	if (!name) {
		return null;
	}

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
		if (pattern.test(name)) {
			return kind;
		}
	}

	return null;
}

const styles: Record<string, React.CSSProperties> = {
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

		flexWrap: "wrap",
	},

	hint: {
		fontSize: 11,

		color: "var(--fdg-accent)",
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

	secondaryIconButton: {
		background: "#2a2a2e",

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

	autoToggle: {
		display: "flex",

		alignItems: "center",

		gap: 6,

		fontSize: 12,

		color: "var(--fdg-muted)",

		cursor: "pointer",
	},
};
