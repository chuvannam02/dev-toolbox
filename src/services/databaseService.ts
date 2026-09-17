// src/services/databaseService.ts

import { invoke } from "@tauri-apps/api/core";

import type {
	ConnectionTestResult,
	DatabaseConfig,
	TableInfo,
	TableSchema,
} from "../types/database";

export async function testDatabaseConnection(
	config: DatabaseConfig,
): Promise<ConnectionTestResult> {
	return invoke<ConnectionTestResult>("test_database_connection", {
		config,
	});
}

export async function listDatabaseTables(
	config: DatabaseConfig,
): Promise<TableInfo[]> {
	return invoke<TableInfo[]>("list_database_tables", {
		config,
	});
}

export async function describeDatabaseTable(
	config: DatabaseConfig,
	schema: string,
	table: string,
): Promise<TableSchema> {
	return invoke<TableSchema>("describe_database_table", {
		config,
		schema,
		table,
	});
}

export async function generateFakeDataFromSchema(
	schema: TableSchema,
	recordCount: number,
): Promise<Record<string, unknown>[]> {
	return invoke<Record<string, unknown>[]>(
		"generate_fake_data_from_schema",
		{
			args: {
				schema,
				recordCount,
			},
		},
	);
}