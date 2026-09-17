// src/components/DatabaseConnectionPanel.tsx

import { useState } from "react";

import {
	DB_TYPES,
	DEFAULT_PORTS,
	type DatabaseConfig,
	type DbType,
	type TableInfo,
	type TableSchema,
} from "../types/database";

import {
	describeDatabaseTable,
	listDatabaseTables,
	testDatabaseConnection,
} from "../services/databaseService";

type Props = {
	connection: DatabaseConfig;

	onConnectionChange: (connection: DatabaseConfig) => void;

	onSchemaLoaded: (schema: TableSchema | null) => void;
};

export default function DatabaseConnectionPanel({
	connection,
	onConnectionChange,
	onSchemaLoaded,
}: Props) {
	const [loading, setLoading] = useState(false);

	const [error, setError] = useState<string | null>(null);

	const [connectionMessage, setConnectionMessage] = useState<string | null>(
		null,
	);

	const [tables, setTables] = useState<TableInfo[]>([]);

	const [selectedTable, setSelectedTable] = useState<string>("");

	const [tableSchema, setTableSchema] = useState<TableSchema | null>(null);

	function updateConnection(patch: Partial<DatabaseConfig>) {
		onConnectionChange({
			...connection,
			...patch,
		});
	}

	function handleDatabaseTypeChange(dbType: DbType) {
		onConnectionChange({
			dbType,

			host: dbType === "SQLite" ? undefined : "localhost",

			port: DEFAULT_PORTS[dbType],

			database: "",

			schema: dbType === "PostgreSQL" ? "public" : "",

			username: "",
			password: "",

			filePath: dbType === "SQLite" ? "" : undefined,

			trustServerCertificate: dbType === "SQL Server" ? true : undefined,
		});

		setTables([]);
		setSelectedTable("");
		setTableSchema(null);
		setConnectionMessage(null);
		setError(null);

		onSchemaLoaded(null);
	}

	async function handleTestConnection() {
		setLoading(true);
		setError(null);
		setConnectionMessage(null);

		try {
			const result = await testDatabaseConnection(connection);

			if (!result.success) {
				setError(result.message);
				return;
			}

			setConnectionMessage(
				result.databaseVersion
					? `${result.message} — ${result.databaseVersion}`
					: result.message,
			);

			const loadedTables = await listDatabaseTables(connection);

			setTables(loadedTables);
		} catch (e) {
			setError(typeof e === "string" ? e : "Không thể kết nối database.");
		} finally {
			setLoading(false);
		}
	}

	async function handleTableChange(value: string) {
		setSelectedTable(value);
		setTableSchema(null);
		onSchemaLoaded(null);

		if (!value) {
			return;
		}

		const table = tables.find((t) => `${t.schema}.${t.name}` === value);

		if (!table) {
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const schema = await describeDatabaseTable(
				connection,
				table.schema,
				table.name,
			);

			setTableSchema(schema);

			onSchemaLoaded(schema);
		} catch (e) {
			setError(
				typeof e === "string" ? e : "Không thể đọc metadata của bảng.",
			);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 16,
			}}
		>
			{/* Database Type */}

			<div>
				<div style={labelStyle}>Loại database</div>

				<select
					value={connection.dbType}
					onChange={(e) =>
						handleDatabaseTypeChange(e.target.value as DbType)
					}
					style={inputStyle}
				>
					{DB_TYPES.map((db) => (
						<option key={db} value={db}>
							{db}
						</option>
					))}
				</select>
			</div>

			{/* SQLite */}

			{connection.dbType === "SQLite" ? (
				<div>
					<div style={labelStyle}>SQLite file</div>

					<input
						type="text"
						placeholder="D:\data\demo.db"
						value={connection.filePath ?? ""}
						onChange={(e) =>
							updateConnection({
								filePath: e.target.value,
							})
						}
						style={inputStyle}
					/>
				</div>
			) : (
				<>
					<div style={gridStyle}>
						<div>
							<div style={labelStyle}>Host</div>

							<input
								value={connection.host ?? ""}
								onChange={(e) =>
									updateConnection({
										host: e.target.value,
									})
								}
								placeholder="localhost"
								style={inputStyle}
							/>
						</div>

						<div>
							<div style={labelStyle}>Port</div>

							<input
								type="number"
								value={connection.port ?? ""}
								onChange={(e) =>
									updateConnection({
										port: Number(e.target.value),
									})
								}
								style={inputStyle}
							/>
						</div>
					</div>

					<div style={gridStyle}>
						<div>
							<div style={labelStyle}>Database / Service</div>

							<input
								value={connection.database ?? ""}
								onChange={(e) =>
									updateConnection({
										database: e.target.value,
									})
								}
								placeholder={
									connection.dbType === "Oracle"
										? "ORCL / XEPDB1"
										: "Database name"
								}
								style={inputStyle}
							/>
						</div>

						<div>
							<div style={labelStyle}>Schema</div>

							<input
								value={connection.schema ?? ""}
								onChange={(e) =>
									updateConnection({
										schema: e.target.value,
									})
								}
								placeholder={
									connection.dbType === "PostgreSQL"
										? "public"
										: "Schema"
								}
								style={inputStyle}
							/>
						</div>
					</div>

					<div style={gridStyle}>
						<div>
							<div style={labelStyle}>Username</div>

							<input
								value={connection.username ?? ""}
								onChange={(e) =>
									updateConnection({
										username: e.target.value,
									})
								}
								style={inputStyle}
							/>
						</div>

						<div>
							<div style={labelStyle}>Password</div>

							<input
								type="password"
								value={connection.password ?? ""}
								onChange={(e) =>
									updateConnection({
										password: e.target.value,
									})
								}
								style={inputStyle}
							/>
						</div>
					</div>
				</>
			)}

			{/* SQL Server */}

			{connection.dbType === "SQL Server" && (
				<label>
					<input
						type="checkbox"
						checked={connection.trustServerCertificate ?? false}
						onChange={(e) =>
							updateConnection({
								trustServerCertificate: e.target.checked,
							})
						}
					/>

					<span
						style={{
							marginLeft: 8,
						}}
					>
						Trust server certificate
					</span>
				</label>
			)}

			<button
				type="button"
				onClick={handleTestConnection}
				disabled={loading}
				style={primaryButtonStyle}
			>
				{loading ? "Đang kết nối..." : "Test Connection"}
			</button>

			{connectionMessage && (
				<div
					style={{
						color: "#4ade80",
					}}
				>
					✓ {connectionMessage}
				</div>
			)}

			{error && (
				<div
					style={{
						color: "#ff6b6b",
					}}
				>
					{error}
				</div>
			)}

			{/* Tables */}

			{tables.length > 0 && (
				<div>
					<div style={labelStyle}>Bảng</div>

					<select
						value={selectedTable}
						onChange={(e) => handleTableChange(e.target.value)}
						style={inputStyle}
					>
						<option value="">-- Chọn bảng --</option>

						{tables.map((table) => (
							<option
								key={`${table.schema}.${table.name}`}
								value={`${table.schema}.${table.name}`}
							>
								{table.schema}.{table.name}
							</option>
						))}
					</select>
				</div>
			)}

			{/* Schema */}

			{tableSchema && <SchemaTable schema={tableSchema} />}
		</div>
	);
}

function SchemaTable({ schema }: { schema: TableSchema }) {
	return (
		<div>
			<div
				style={{
					fontWeight: 600,
					marginBottom: 8,
				}}
			>
				{schema.schema}.{schema.table}
			</div>

			<div
				style={{
					overflow: "auto",
					border: "1px solid #38383c",
					borderRadius: 6,
				}}
			>
				<table
					style={{
						width: "100%",
						borderCollapse: "collapse",
						fontSize: 13,
					}}
				>
					<thead>
						<tr>
							<th style={thStyle}>Column</th>

							<th style={thStyle}>Type</th>

							<th style={thStyle}>Null</th>

							<th style={thStyle}>Key</th>

							<th style={thStyle}>Constraint</th>
						</tr>
					</thead>

					<tbody>
						{schema.columns.map((column) => (
							<tr key={column.name}>
								<td style={tdStyle}>{column.name}</td>

								<td style={tdStyle}>
									{column.dataType}

									{column.maxLength
										? `(${column.maxLength})`
										: ""}
								</td>

								<td style={tdStyle}>
									{column.nullable ? "YES" : "NO"}
								</td>

								<td style={tdStyle}>
									{column.primaryKey && "🔑 PK "}

									{column.foreignKey && "🔗 FK "}

									{column.unique && "UQ "}

									{column.identity && "Identity"}
								</td>

								<td style={tdStyle}>
									{column.foreignKey && (
										<div>
											→{" "}
											{column.foreignKey.referencedSchema}
											.{column.foreignKey.referencedTable}
											.
											{column.foreignKey.referencedColumn}
										</div>
									)}

									{column.checkConstraints.map(
										(check, index) => (
											<div key={index}>{check}</div>
										),
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

const inputStyle: React.CSSProperties = {
	width: "100%",
	boxSizing: "border-box",

	background: "#141416",

	border: "1px solid #38383c",
	borderRadius: 6,

	padding: "8px 10px",

	color: "#e7e7ea",
};

const labelStyle: React.CSSProperties = {
	fontSize: 13,
	fontWeight: 600,
	color: "#9a9aa2",
	marginBottom: 6,
};

const gridStyle: React.CSSProperties = {
	display: "grid",
	gridTemplateColumns: "1fr 1fr",
	gap: 12,
};

const primaryButtonStyle: React.CSSProperties = {
	background: "#5b8cff",

	border: "none",
	borderRadius: 6,

	padding: "9px 20px",

	color: "white",

	fontWeight: 600,

	cursor: "pointer",
};

const thStyle: React.CSSProperties = {
	textAlign: "left",

	padding: "8px 10px",

	borderBottom: "1px solid #38383c",

	background: "#232326",
};

const tdStyle: React.CSSProperties = {
	padding: "7px 10px",

	borderBottom: "1px solid #2a2a2d",
};
