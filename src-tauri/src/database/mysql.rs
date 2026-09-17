// src-tauri/src/database/mysql.rs

use std::time::Duration;

use sqlx::{
    mysql::{MySqlPool, MySqlPoolOptions},
    Row,
};

use super::models::{
    ColumnInfo, ConnectionTestResult, DatabaseConfig, ForeignKeyInfo, TableInfo, TableSchema,
};

fn build_url(config: &DatabaseConfig) -> Result<String, String> {
    let host = config.host.as_deref().ok_or("Thiếu host")?;

    let username = config.username.as_deref().ok_or("Thiếu username")?;

    let password = config.password.as_deref().unwrap_or("");

    let database = config.database.as_deref().ok_or("Thiếu database")?;

    let port = config.port.unwrap_or(3306);

    Ok(format!(
        "mysql://{}:{}@{}:{}/{}",
        urlencoding::encode(username),
        urlencoding::encode(password),
        host,
        port,
        database
    ))
}

async fn pool(config: &DatabaseConfig) -> Result<MySqlPool, String> {
    let url = build_url(config)?;

    MySqlPoolOptions::new()
        .max_connections(3)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&url)
        .await
        .map_err(|e| format!("Không thể kết nối MySQL: {}", e))
}

pub async fn test_connection(config: &DatabaseConfig) -> Result<ConnectionTestResult, String> {
    let pool = pool(config).await?;

    let version: String = sqlx::query_scalar("SELECT VERSION()")
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(ConnectionTestResult {
        success: true,
        message: "Kết nối MySQL thành công".to_string(),
        database_version: Some(version),
    })
}

pub async fn list_tables(config: &DatabaseConfig) -> Result<Vec<TableInfo>, String> {
    let pool = pool(config).await?;

    let database = config.database.as_deref().ok_or("Thiếu database")?;

    let rows = sqlx::query(
        r#"
        SELECT
            TABLE_SCHEMA,
            TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
        "#,
    )
    .bind(database)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| TableInfo {
            schema: row.get("TABLE_SCHEMA"),
            name: row.get("TABLE_NAME"),
        })
        .collect())
}

pub async fn describe_table(
    config: &DatabaseConfig,
    schema: &str,
    table: &str,
) -> Result<TableSchema, String> {
    let pool = pool(config).await?;

    let rows = sqlx::query(
        r#"
        SELECT
            c.COLUMN_NAME,
            c.DATA_TYPE,
            c.IS_NULLABLE,
            c.CHARACTER_MAXIMUM_LENGTH,
            c.NUMERIC_PRECISION,
            c.NUMERIC_SCALE,
            c.COLUMN_DEFAULT,
            c.COLUMN_KEY,
            c.EXTRA
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_SCHEMA = ?
          AND c.TABLE_NAME = ?
        ORDER BY c.ORDINAL_POSITION
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut columns = Vec::new();

    for row in rows {
        let column_name: String = row.get("COLUMN_NAME");

        let data_type: String = row.get("DATA_TYPE");

        let nullable: String = row.get("IS_NULLABLE");

        let column_key: String = row.try_get("COLUMN_KEY").unwrap_or_default();

        let extra: String = row.try_get("EXTRA").unwrap_or_default();

        let foreign_key = find_foreign_key(&pool, schema, table, &column_name).await?;

        let checks = find_check_constraints(&pool, schema, table, &column_name).await?;

        let max_length = row
            .try_get::<Option<u64>, _>("CHARACTER_MAXIMUM_LENGTH")
            .ok()
            .flatten()
            .map(|v| v as i64);

        let precision = row
            .try_get::<Option<u64>, _>("NUMERIC_PRECISION")
            .ok()
            .flatten()
            .map(|v| v as i64);

        let scale = row
            .try_get::<Option<u64>, _>("NUMERIC_SCALE")
            .ok()
            .flatten()
            .map(|v| v as i64);

        let default_value = row
            .try_get::<Option<String>, _>("COLUMN_DEFAULT")
            .ok()
            .flatten();

        columns.push(ColumnInfo {
            name: column_name,

            data_type,

            nullable: nullable == "YES",

            max_length,

            numeric_precision: precision,

            numeric_scale: scale,

            default_value,

            primary_key: column_key == "PRI",

            unique: column_key == "UNI",

            identity: extra.to_lowercase().contains("auto_increment"),

            foreign_key,

            check_constraints: checks,
        });
    }

    Ok(TableSchema {
        schema: schema.to_string(),
        table: table.to_string(),
        columns,
        constraints: Vec::new(),
    })
}

async fn find_foreign_key(
    pool: &MySqlPool,
    schema: &str,
    table: &str,
    column: &str,
) -> Result<Option<ForeignKeyInfo>, String> {
    let row = sqlx::query(
        r#"
        SELECT
            CONSTRAINT_NAME,
            REFERENCED_TABLE_SCHEMA,
            REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
          AND REFERENCED_TABLE_NAME IS NOT NULL
        LIMIT 1
        "#,
    )
    .bind(schema)
    .bind(table)
    .bind(column)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|row| ForeignKeyInfo {
        constraint_name: row.get("CONSTRAINT_NAME"),

        referenced_schema: row.get("REFERENCED_TABLE_SCHEMA"),

        referenced_table: row.get("REFERENCED_TABLE_NAME"),

        referenced_column: row.get("REFERENCED_COLUMN_NAME"),
    }))
}

async fn find_check_constraints(
    pool: &MySqlPool,
    schema: &str,
    table: &str,
    column: &str,
) -> Result<Vec<String>, String> {
    let rows = sqlx::query(
        r#"
        SELECT
            cc.CHECK_CLAUSE
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
          ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
         AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        WHERE tc.TABLE_SCHEMA = ?
          AND tc.TABLE_NAME = ?
          AND tc.CONSTRAINT_TYPE = 'CHECK'
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let column_lowercase = column.to_lowercase();

    Ok(rows
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("CHECK_CLAUSE").ok())
        .filter(|constraint| constraint.to_lowercase().contains(&column_lowercase))
        .collect())
}
