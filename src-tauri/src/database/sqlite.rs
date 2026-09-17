// src-tauri/src/database/sqlite.rs

use rusqlite::{
    Connection,
    OptionalExtension,
};

use tokio::task;

use super::models::{
    ColumnInfo,
    ConnectionTestResult,
    DatabaseConfig,
    ForeignKeyInfo,
    TableInfo,
    TableSchema,
};

fn get_file_path(
    config: &DatabaseConfig,
) -> Result<String, String> {
    let file_path = config
        .file_path
        .as_deref()
        .ok_or(
            "Thiếu đường dẫn file SQLite",
        )?
        .trim();

    if file_path.is_empty() {
        return Err(
            "Đường dẫn SQLite không được để trống"
                .to_string(),
        );
    }

    Ok(file_path.to_string())
}

fn open_connection(
    config: &DatabaseConfig,
) -> Result<Connection, String> {
    let file_path =
        get_file_path(config)?;

    Connection::open(&file_path)
        .map_err(|e| {
            format!(
                "Không thể mở SQLite '{}': {}",
                file_path,
                e
            )
        })
}

pub async fn test_connection(
    config: &DatabaseConfig,
) -> Result<ConnectionTestResult, String> {
    let config = config.clone();

    task::spawn_blocking(move || {
        let conn =
            open_connection(&config)?;

        let version: String = conn
            .query_row(
                "SELECT sqlite_version()",
                [],
                |row| row.get(0),
            )
            .map_err(|e| {
                format!(
                    "Không thể đọc SQLite version: {}",
                    e
                )
            })?;

        Ok(ConnectionTestResult {
            success: true,

            message:
                "Kết nối SQLite thành công"
                    .to_string(),

            database_version:
                Some(version),
        })
    })
    .await
    .map_err(|e| {
        format!(
            "SQLite task error: {}",
            e
        )
    })?
}

pub async fn list_tables(
    config: &DatabaseConfig,
) -> Result<Vec<TableInfo>, String> {
    let config = config.clone();

    task::spawn_blocking(move || {
        let conn =
            open_connection(&config)?;

        let mut stmt = conn
            .prepare(
                r#"
                SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                  AND name NOT LIKE 'sqlite_%'
                ORDER BY name
                "#,
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(
                [],
                |row| {
                    let name: String =
                        row.get(0)?;

                    Ok(TableInfo {
                        schema:
                            "main".to_string(),

                        name,
                    })
                },
            )
            .map_err(|e| e.to_string())?;

        let mut result =
            Vec::new();

        for row in rows {
            result.push(
                row.map_err(
                    |e| e.to_string(),
                )?,
            );
        }

        Ok(result)
    })
    .await
    .map_err(|e| {
        format!(
            "SQLite task error: {}",
            e
        )
    })?
}

pub async fn describe_table(
    config: &DatabaseConfig,
    table: &str,
) -> Result<TableSchema, String> {
    let config =
        config.clone();

    let table =
        table.to_string();

    task::spawn_blocking(move || {
        let conn =
            open_connection(&config)?;

        describe_table_sync(
            &conn,
            &table,
        )
    })
    .await
    .map_err(|e| {
        format!(
            "SQLite task error: {}",
            e
        )
    })?
}

fn describe_table_sync(
    conn: &Connection,
    table: &str,
) -> Result<TableSchema, String> {
    let foreign_keys =
        load_foreign_keys(
            conn,
            table,
        )?;

    let unique_columns =
        load_unique_columns(
            conn,
            table,
        )?;

    /*
     * table name không thể bind trực tiếp
     * vào PRAGMA:
     *
     * PRAGMA table_info(?)
     *
     * nên escape identifier.
     */
    let escaped_table =
        escape_identifier(table);

    let sql = format!(
        r#"PRAGMA table_info("{}")"#,
        escaped_table
    );

    let mut stmt =
        conn.prepare(&sql)
            .map_err(
                |e| e.to_string(),
            )?;

    let rows = stmt
        .query_map(
            [],
            |row| {
                let name: String =
                    row.get("name")?;

                let data_type: String =
                    row.get("type")?;

                let not_null: i64 =
                    row.get("notnull")?;

                let primary_key: i64 =
                    row.get("pk")?;

                let default_value:
                    Option<String> =
                    row.get(
                        "dflt_value",
                    )?;

                Ok((
                    name,
                    data_type,
                    not_null,
                    primary_key,
                    default_value,
                ))
            },
        )
        .map_err(|e| {
            e.to_string()
        })?;

    let mut columns =
        Vec::new();

    for row in rows {
        let (
            name,
            data_type,
            not_null,
            primary_key,
            default_value,
        ) = row.map_err(
            |e| e.to_string(),
        )?;

        let foreign_key =
            foreign_keys
                .iter()
                .find(
                    |(
                        source_column,
                        _,
                    )| {
                        source_column
                            == &name
                    },
                )
                .map(
                    |(_, fk)| {
                        fk.clone()
                    },
                );

        let unique =
            unique_columns
                .iter()
                .any(
                    |column| {
                        column
                            == &name
                    },
                );

        /*
         * SQLite INTEGER PRIMARY KEY
         * alias rowid.
         */
        let identity =
            primary_key > 0
                && data_type
                    .eq_ignore_ascii_case(
                        "INTEGER",
                    );

        columns.push(
            ColumnInfo {
                name,

                data_type,

                nullable:
                    not_null == 0
                        && primary_key
                            == 0,

                max_length:
                    None,

                numeric_precision:
                    None,

                numeric_scale:
                    None,

                default_value,

                primary_key:
                    primary_key > 0,

                unique,

                identity,

                foreign_key,

                check_constraints:
                    Vec::new(),
            },
        );
    }

    Ok(TableSchema {
        schema:
            "main".to_string(),

        table:
            table.to_string(),

        columns,

        constraints:
            Vec::new(),
    })
}

fn load_foreign_keys(
    conn: &Connection,
    table: &str,
) -> Result<
    Vec<(String, ForeignKeyInfo)>,
    String,
> {
    let table =
        escape_identifier(table);

    let sql = format!(
        r#"PRAGMA foreign_key_list("{}")"#,
        table
    );

    let mut stmt =
        conn.prepare(&sql)
            .map_err(
                |e| e.to_string(),
            )?;

    let rows = stmt
        .query_map(
            [],
            |row| {
                let id: i64 =
                    row.get("id")?;

                let seq: i64 =
                    row.get("seq")?;

                let source_column:
                    String =
                    row.get("from")?;

                let target_table:
                    String =
                    row.get("table")?;

                let target_column:
                    String =
                    row.get("to")?;

                Ok((
                    source_column,

                    ForeignKeyInfo {
                        constraint_name:
                            format!(
                                "fk_{}_{}_{}",
                                table,
                                id,
                                seq
                            ),

                        referenced_schema:
                            "main"
                                .to_string(),

                        referenced_table:
                            target_table,

                        referenced_column:
                            target_column,
                    },
                ))
            },
        )
        .map_err(
            |e| e.to_string(),
        )?;

    let mut result =
        Vec::new();

    for row in rows {
        result.push(
            row.map_err(
                |e| e.to_string(),
            )?,
        );
    }

    Ok(result)
}

fn load_unique_columns(
    conn: &Connection,
    table: &str,
) -> Result<Vec<String>, String> {
    let escaped_table =
        escape_identifier(table);

    let sql = format!(
        r#"PRAGMA index_list("{}")"#,
        escaped_table
    );

    let mut stmt =
        conn.prepare(&sql)
            .map_err(
                |e| e.to_string(),
            )?;

    let index_rows = stmt
        .query_map(
            [],
            |row| {
                let name: String =
                    row.get("name")?;

                let unique: i64 =
                    row.get("unique")?;

                Ok((
                    name,
                    unique,
                ))
            },
        )
        .map_err(
            |e| e.to_string(),
        )?;

    let mut unique_columns =
        Vec::new();

    for index in index_rows {
        let (
            index_name,
            unique,
        ) = index.map_err(
            |e| e.to_string(),
        )?;

        if unique == 0 {
            continue;
        }

        let escaped_index =
            escape_identifier(
                &index_name,
            );

        let sql = format!(
            r#"PRAGMA index_info("{}")"#,
            escaped_index
        );

        let mut stmt =
            conn.prepare(&sql)
                .map_err(
                    |e| {
                        e.to_string()
                    },
                )?;

        let rows = stmt
            .query_map(
                [],
                |row| {
                    row.get::<_, String>(
                        "name",
                    )
                },
            )
            .map_err(
                |e| e.to_string(),
            )?;

        let mut names =
            Vec::new();

        for row in rows {
            names.push(
                row.map_err(
                    |e| {
                        e.to_string()
                    },
                )?,
            );
        }

        /*
         * UNIQUE(email)
         *
         * => email unique
         *
         * UNIQUE(first_name, last_name)
         *
         * => composite constraint,
         * không đánh dấu riêng từng column.
         */
        if names.len() == 1 {
            unique_columns.push(
                names[0].clone(),
            );
        }
    }

    Ok(unique_columns)
}

fn escape_identifier(
    value: &str,
) -> String {
    value.replace(
        '"',
        "\"\"",
    )
}