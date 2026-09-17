// src-tauri/src/database/sql_server.rs

use super::models::{ConnectionTestResult, DatabaseConfig, TableInfo, TableSchema};

pub async fn test_connection(_config: &DatabaseConfig) -> Result<ConnectionTestResult, String> {
    Err("SQL Server chưa được triển khai.".to_string())
}

pub async fn list_tables(_config: &DatabaseConfig) -> Result<Vec<TableInfo>, String> {
    Err("SQL Server: chức năng lấy danh sách bảng chưa được triển khai.".to_string())
}

pub async fn describe_table(
    _config: &DatabaseConfig,
    _schema: &str,
    _table: &str,
) -> Result<TableSchema, String> {
    Err("SQL Server: chức năng đọc metadata bảng chưa được triển khai.".to_string())
}
