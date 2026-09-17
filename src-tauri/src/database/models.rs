use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConfig {
    pub db_type: String,

    pub host: Option<String>,
    pub port: Option<u16>,

    pub database: Option<String>,
    pub schema: Option<String>,

    pub username: Option<String>,
    pub password: Option<String>,

    // SQLite
    pub file_path: Option<String>,

    // SQL Server dev/local
    pub trust_server_certificate: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub database_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeyInfo {
    pub constraint_name: String,

    pub referenced_schema: String,
    pub referenced_table: String,
    pub referenced_column: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,

    pub data_type: String,

    pub nullable: bool,

    pub max_length: Option<i64>,

    pub numeric_precision: Option<i64>,
    pub numeric_scale: Option<i64>,

    pub default_value: Option<String>,

    pub primary_key: bool,
    pub unique: bool,
    pub identity: bool,

    pub foreign_key: Option<ForeignKeyInfo>,

    pub check_constraints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSchema {
    pub schema: String,
    pub table: String,

    pub columns: Vec<ColumnInfo>,

    /// Raw table-level constraints để hiển thị cho user.
    pub constraints: Vec<String>,
}