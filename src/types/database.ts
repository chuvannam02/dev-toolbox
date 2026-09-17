// src/types/database.ts

export const DB_TYPES = [
	"Oracle",
	"MySQL",
	"PostgreSQL",
	"SQL Server",
	"SQLite",
] as const;

export type DbType = (typeof DB_TYPES)[number];

export type DatabaseConfig = {
	dbType: DbType;

	host?: string;
	port?: number;

	database?: string;
	schema?: string;

	username?: string;
	password?: string;

	// SQLite
	filePath?: string;

	// SQL Server
	trustServerCertificate?: boolean;
};

export const DEFAULT_PORTS: Partial<Record<DbType, number>> = {
	PostgreSQL: 5432,
	MySQL: 3306,
	Oracle: 1521,
	"SQL Server": 1433,
};

export type ConnectionTestResult = {
	success: boolean;
	message: string;
	databaseVersion?: string;
};

export type TableInfo = {
	schema: string;
	name: string;
};

export type ForeignKeyInfo = {
	constraintName: string;

	referencedSchema: string;
	referencedTable: string;
	referencedColumn: string;
};

export type ColumnInfo = {
	name: string;

	dataType: string;

	nullable: boolean;

	maxLength?: number | null;

	numericPrecision?: number | null;
	numericScale?: number | null;

	defaultValue?: string | null;

	primaryKey: boolean;
	unique: boolean;
	identity: boolean;

	foreignKey?: ForeignKeyInfo | null;

	checkConstraints: string[];
};

export type TableSchema = {
	schema: string;
	table: string;

	columns: ColumnInfo[];

	constraints: string[];
};