// src-tauri/src/database/mod.rs

pub mod models;

pub mod mysql;
pub mod oracle;
pub mod postgres;
pub mod sql_server;
pub mod sqlite;

use models::{ConnectionTestResult, DatabaseConfig, TableInfo, TableSchema};

#[tauri::command]
pub async fn test_database_connection(
    config: DatabaseConfig,
) -> Result<ConnectionTestResult, String> {
    match config.db_type.as_str() {
        "PostgreSQL" => postgres::test_connection(&config).await,

        "MySQL" => mysql::test_connection(&config).await,

        "SQLite" => sqlite::test_connection(&config).await,

        "Oracle" => oracle::test_connection(config).await,

        "SQL Server" => sql_server::test_connection(&config).await,

        other => Err(format!("Database chưa được hỗ trợ: {}", other)),
    }
}

#[tauri::command]
pub async fn list_database_tables(config: DatabaseConfig) -> Result<Vec<TableInfo>, String> {
    match config.db_type.as_str() {
        "PostgreSQL" => postgres::list_tables(&config).await,

        "MySQL" => mysql::list_tables(&config).await,

        "SQLite" => sqlite::list_tables(&config).await,

        "Oracle" => oracle::list_tables(config).await,

        "SQL Server" => sql_server::list_tables(&config).await,

        other => Err(format!("Database chưa được hỗ trợ: {}", other)),
    }
}

#[tauri::command]
pub async fn describe_database_table(
    config: DatabaseConfig,
    schema: String,
    table: String,
) -> Result<TableSchema, String> {
    match config.db_type.as_str() {
        "PostgreSQL" => postgres::describe_table(&config, &schema, &table).await,

        "MySQL" => mysql::describe_table(&config, &schema, &table).await,

        "SQLite" => sqlite::describe_table(&config, &table).await,

        "Oracle" => oracle::describe_table(config, schema, table).await,

        "SQL Server" => sql_server::describe_table(&config, &schema, &table).await,

        other => Err(format!("Database chưa được hỗ trợ: {}", other)),
    }
}
