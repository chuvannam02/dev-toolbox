use sqlx::{
    postgres::{PgPool, PgPoolOptions},
    Row,
};

use std::time::Duration;

use super::models::{
    ColumnInfo, ConnectionTestResult, DatabaseConfig, ForeignKeyInfo, TableInfo, TableSchema,
};

fn build_url(config: &DatabaseConfig) -> Result<String, String> {
    let host = config.host.as_deref().ok_or("Thiếu host")?;

    let username = config.username.as_deref().ok_or("Thiếu username")?;

    let password = config.password.as_deref().unwrap_or("");

    let database = config.database.as_deref().ok_or("Thiếu database")?;

    let port = config.port.unwrap_or(5432);

    Ok(format!(
        "postgres://{}:{}@{}:{}/{}",
        urlencoding::encode(username),
        urlencoding::encode(password),
        host,
        port,
        database
    ))
}

async fn pool(config: &DatabaseConfig) -> Result<PgPool, String> {
    let url = build_url(config)?;

    PgPoolOptions::new()
        .max_connections(3)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&url)
        .await
        .map_err(|e| format!("Không thể kết nối PostgreSQL: {}", e))
}

pub async fn test_connection(config: &DatabaseConfig) -> Result<ConnectionTestResult, String> {
    let pool = pool(config).await?;

    let version: String = sqlx::query_scalar("SELECT version()")
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(ConnectionTestResult {
        success: true,
        message: "Kết nối PostgreSQL thành công".into(),
        database_version: Some(version),
    })
}

pub async fn list_tables(config: &DatabaseConfig) -> Result<Vec<TableInfo>, String> {
    let pool = pool(config).await?;

    let schema = config.schema.as_deref().unwrap_or("public");

    let rows = sqlx::query(
        r#"
        SELECT
            table_schema,
            table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
        "#,
    )
    .bind(schema)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| TableInfo {
            schema: r.get("table_schema"),
            name: r.get("table_name"),
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
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.character_maximum_length,
            c.numeric_precision,
            c.numeric_scale,
            c.column_default,
            c.is_identity,

            EXISTS (
                SELECT 1
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.constraint_schema = kcu.constraint_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_schema = c.table_schema
                  AND tc.table_name = c.table_name
                  AND kcu.column_name = c.column_name
            ) AS primary_key,

            EXISTS (
                SELECT 1
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.constraint_schema = kcu.constraint_schema
                WHERE tc.constraint_type = 'UNIQUE'
                  AND tc.table_schema = c.table_schema
                  AND tc.table_name = c.table_name
                  AND kcu.column_name = c.column_name
            ) AS unique_column

        FROM information_schema.columns c

        WHERE c.table_schema = $1
          AND c.table_name = $2

        ORDER BY c.ordinal_position
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut columns = Vec::new();

    for row in rows {
        let column_name: String = row.get("column_name");

        let foreign_key = find_foreign_key(&pool, schema, table, &column_name).await?;

        let checks = find_check_constraints(&pool, schema, table, &column_name).await?;

        let identity: String = row.try_get("is_identity").unwrap_or_else(|_| "NO".into());

        columns.push(ColumnInfo {
            name: column_name,
            data_type: row.get("data_type"),

            nullable: row.get::<String, _>("is_nullable") == "YES",

            max_length: row
                .try_get::<Option<i32>, _>("character_maximum_length")
                .ok()
                .flatten()
                .map(i64::from),

            numeric_precision: row
                .try_get::<Option<i32>, _>("numeric_precision")
                .ok()
                .flatten()
                .map(i64::from),

            numeric_scale: row
                .try_get::<Option<i32>, _>("numeric_scale")
                .ok()
                .flatten()
                .map(i64::from),

            default_value: row.try_get("column_default").ok(),

            primary_key: row.get("primary_key"),

            unique: row.get("unique_column"),

            identity: identity == "YES",

            foreign_key,

            check_constraints: checks,
        });
    }

    Ok(TableSchema {
        schema: schema.into(),
        table: table.into(),
        columns,
        constraints: Vec::new(),
    })
}

async fn find_foreign_key(
    pool: &PgPool,
    schema: &str,
    table: &str,
    column: &str,
) -> Result<Option<ForeignKeyInfo>, String> {
    let row = sqlx::query(
        r#"
        SELECT
            tc.constraint_name,
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name

        FROM information_schema.table_constraints tc

        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.constraint_schema = kcu.constraint_schema

        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.constraint_schema = tc.constraint_schema

        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
          AND kcu.column_name = $3
        "#,
    )
    .bind(schema)
    .bind(table)
    .bind(column)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|r| ForeignKeyInfo {
        constraint_name: r.get("constraint_name"),
        referenced_schema: r.get("foreign_table_schema"),
        referenced_table: r.get("foreign_table_name"),
        referenced_column: r.get("foreign_column_name"),
    }))
}

async fn find_check_constraints(
    pool: &PgPool,
    schema: &str,
    table: &str,
    column: &str,
) -> Result<Vec<String>, String> {
    let rows = sqlx::query(
        r#"
        SELECT pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class rel
          ON rel.oid = con.conrelid
        JOIN pg_namespace nsp
          ON nsp.oid = rel.relnamespace
        WHERE con.contype = 'c'
          AND nsp.nspname = $1
          AND rel.relname = $2
          AND pg_get_constraintdef(con.oid) ILIKE '%' || $3 || '%'
        "#,
    )
    .bind(schema)
    .bind(table)
    .bind(column)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .filter_map(|r| r.try_get("definition").ok())
        .collect())
}
