// src-tauri/src/database/oracle.rs

use std::collections::{HashMap, HashSet};

use oracle::Connection;
use tokio::task;

use super::models::{
    ColumnInfo, ConnectionTestResult, DatabaseConfig, ForeignKeyInfo, TableInfo, TableSchema,
};

// ============================================================
// Public API
// ============================================================

pub async fn test_connection(config: DatabaseConfig) -> Result<ConnectionTestResult, String> {
    task::spawn_blocking(move || {
        let conn = open_connection(&config)?;

        // Connection thành công là đủ để xác nhận DB reachable.
        // Version chỉ là thông tin bổ sung, không nên làm fail test
        // nếu user không có permission đọc v$version.
        let database_version = read_database_version(&conn).ok();

        let schema = get_current_schema(&conn).unwrap_or_else(|_| "UNKNOWN".to_string());

        Ok(ConnectionTestResult {
            success: true,

            message: format!("Kết nối Oracle thành công. Current schema: {}", schema),

            database_version,
        })
    })
    .await
    .map_err(|e| format!("Oracle background task thất bại: {}", e))?
}

pub async fn list_tables(config: DatabaseConfig) -> Result<Vec<TableInfo>, String> {
    task::spawn_blocking(move || {
        let conn = open_connection(&config)?;

        let schema = resolve_schema(&conn, config.schema.as_deref())?;

        list_tables_sync(&conn, &schema)
    })
    .await
    .map_err(|e| format!("Oracle background task thất bại: {}", e))?
}

pub async fn describe_table(
    config: DatabaseConfig,
    schema: String,
    table: String,
) -> Result<TableSchema, String> {
    task::spawn_blocking(move || {
        let conn = open_connection(&config)?;

        let resolved_schema = if schema.trim().is_empty() {
            resolve_schema(&conn, config.schema.as_deref())?
        } else {
            schema
        };

        describe_table_sync(&conn, &resolved_schema, &table)
    })
    .await
    .map_err(|e| format!("Oracle background task thất bại: {}", e))?
}

// ============================================================
// Connection
// ============================================================

fn open_connection(config: &DatabaseConfig) -> Result<Connection, String> {
    let host = config.host.as_deref().ok_or("Oracle: thiếu host")?.trim();

    let username = config
        .username
        .as_deref()
        .ok_or("Oracle: thiếu username")?
        .trim();

    let password = config.password.as_deref().unwrap_or("");

    /*
     * Field database của frontend được dùng
     * như Oracle SERVICE_NAME:
     *
     * XE
     * XEPDB1
     * ORCL
     * ORCLPDB1
     *
     * EZConnect:
     *
     * //localhost:1521/XEPDB1
     */
    let service_name = config
        .database
        .as_deref()
        .ok_or("Oracle: thiếu Service Name")?
        .trim();

    if host.is_empty() {
        return Err("Oracle host không được để trống".to_string());
    }

    if username.is_empty() {
        return Err("Oracle username không được để trống".to_string());
    }

    if service_name.is_empty() {
        return Err("Oracle Service Name không được để trống".to_string());
    }

    let port = config.port.unwrap_or(1521);

    let connect_string = format!("//{}:{}/{}", host, port, service_name,);

    Connection::connect(username, password, &connect_string)
        .map_err(|e| format!("Không thể kết nối Oracle tại {}: {}", connect_string, e))
}

fn read_database_version(conn: &Connection) -> Result<String, String> {
    /*
     * v$version thường đọc được,
     * nhưng không coi việc thiếu permission
     * là connection failure.
     */
    let row = conn
        .query_row(
            r#"
            SELECT banner
            FROM v$version
            WHERE ROWNUM = 1
            "#,
            &[],
        )
        .map_err(|e| e.to_string())?;

    let version: String = row.get(0).map_err(|e| e.to_string())?;

    Ok(version)
}

fn get_current_schema(conn: &Connection) -> Result<String, String> {
    let row = conn
        .query_row(
            r#"
            SELECT SYS_CONTEXT(
                'USERENV',
                'CURRENT_SCHEMA'
            )
            FROM dual
            "#,
            &[],
        )
        .map_err(|e| format!("Không lấy được Oracle current schema: {}", e))?;

    row.get::<_, String>(0).map_err(|e| e.to_string())
}

fn resolve_schema(conn: &Connection, configured_schema: Option<&str>) -> Result<String, String> {
    match configured_schema {
        Some(schema) if !schema.trim().is_empty() => {
            /*
             * Oracle unquoted identifier thường
             * được lưu uppercase.
             */
            Ok(schema.trim().to_uppercase())
        }

        _ => get_current_schema(conn),
    }
}

// ============================================================
// Tables
// ============================================================

fn list_tables_sync(conn: &Connection, schema: &str) -> Result<Vec<TableInfo>, String> {
    let sql = r#"
        SELECT
            owner,
            table_name
        FROM all_tables
        WHERE owner = :1
        ORDER BY table_name
    "#;

    let rows = conn
        .query(sql, &[&schema])
        .map_err(|e| format!("Không lấy được danh sách Oracle tables: {}", e))?;

    let mut result = Vec::new();

    for row_result in rows {
        let row = row_result.map_err(|e| e.to_string())?;

        let owner: String = row.get("OWNER").map_err(|e| e.to_string())?;

        let table_name: String = row.get("TABLE_NAME").map_err(|e| e.to_string())?;

        result.push(TableInfo {
            schema: owner,
            name: table_name,
        });
    }

    Ok(result)
}

// ============================================================
// Describe table
// ============================================================

fn describe_table_sync(
    conn: &Connection,
    schema: &str,
    table: &str,
) -> Result<TableSchema, String> {
    /*
     * Nếu schema/table đến từ ALL_TABLES thì
     * giữ nguyên chính xác.
     *
     * Trường hợp user nhập tay thì thường
     * Oracle metadata là uppercase.
     */
    let owner = schema.trim().to_uppercase();

    let table_name = table.trim().to_uppercase();

    if owner.is_empty() {
        return Err("Oracle schema không được để trống".to_string());
    }

    if table_name.is_empty() {
        return Err("Oracle table không được để trống".to_string());
    }

    // --------------------------------------------------------
    // Load constraint metadata trước
    // --------------------------------------------------------

    let primary_keys = load_primary_key_columns(conn, &owner, &table_name)?;

    let unique_columns = load_single_unique_columns(conn, &owner, &table_name)?;

    let foreign_keys = load_foreign_keys(conn, &owner, &table_name)?;

    let check_constraints = load_check_constraints(conn, &owner, &table_name)?;

    let table_constraints = load_table_constraints(conn, &owner, &table_name)?;

    // --------------------------------------------------------
    // Columns
    // --------------------------------------------------------

    let sql = r#"
        SELECT
            column_name,
            data_type,

            data_length,
            char_length,

            data_precision,
            data_scale,

            nullable,
            data_default,

            identity_column,

            column_id
        FROM all_tab_columns
        WHERE owner = :1
          AND table_name = :2
        ORDER BY column_id
    "#;

    let rows = conn.query(sql, &[&owner, &table_name]).map_err(|e| {
        format!(
            "Không đọc được Oracle columns của {}.{}: {}",
            owner, table_name, e
        )
    })?;

    let mut columns = Vec::new();

    for row_result in rows {
        let row = row_result.map_err(|e| e.to_string())?;

        let column_name: String = row.get("COLUMN_NAME").map_err(|e| e.to_string())?;

        let data_type: String = row.get("DATA_TYPE").map_err(|e| e.to_string())?;

        let data_length: Option<i64> = row.get("DATA_LENGTH").map_err(|e| e.to_string())?;

        let char_length: Option<i64> = row.get("CHAR_LENGTH").map_err(|e| e.to_string())?;

        let numeric_precision: Option<i64> =
            row.get("DATA_PRECISION").map_err(|e| e.to_string())?;

        let numeric_scale: Option<i64> = row.get("DATA_SCALE").map_err(|e| e.to_string())?;

        let nullable: String = row.get("NULLABLE").map_err(|e| e.to_string())?;

        /*
         * DATA_DEFAULT là kiểu LONG trong
         * Oracle data dictionary.
         *
         * rust-oracle có thể convert về String
         * trong trường hợp thông thường.
         */
        let default_value: Option<String> = row.get("DATA_DEFAULT").unwrap_or(None);

        /*
         * Oracle 12c+:
         *
         * IDENTITY_COLUMN = YES / NO
         */
        let identity_column: Option<String> = row.get("IDENTITY_COLUMN").unwrap_or(None);

        let max_length = match data_type.as_str() {
            "VARCHAR2" | "NVARCHAR2" | "CHAR" | "NCHAR" => char_length.or(data_length),

            _ => data_length,
        };

        let foreign_key = foreign_keys.get(&column_name).cloned();

        let checks = check_constraints
            .get(&column_name)
            .cloned()
            .unwrap_or_default();

        columns.push(ColumnInfo {
            name: column_name.clone(),

            data_type,

            nullable: nullable == "Y",

            max_length,

            numeric_precision,

            numeric_scale,

            default_value: default_value.map(|v| v.trim().to_string()),

            primary_key: primary_keys.contains(&column_name),

            unique: unique_columns.contains(&column_name),

            identity: identity_column
                .as_deref()
                .map(|value| value.eq_ignore_ascii_case("YES"))
                .unwrap_or(false),

            foreign_key,

            check_constraints: checks,
        });
    }

    if columns.is_empty() {
        return Err(format!(
            "Không tìm thấy bảng Oracle {}.{} hoặc user không có quyền đọc metadata.",
            owner, table_name
        ));
    }

    Ok(TableSchema {
        schema: owner,
        table: table_name,

        columns,

        constraints: table_constraints,
    })
}

// ============================================================
// Primary Key
// ============================================================

fn load_primary_key_columns(
    conn: &Connection,
    owner: &str,
    table: &str,
) -> Result<HashSet<String>, String> {
    let sql = r#"
        SELECT
            acc.column_name
        FROM all_constraints ac
        JOIN all_cons_columns acc
          ON acc.owner = ac.owner
         AND acc.constraint_name =
             ac.constraint_name
         AND acc.table_name =
             ac.table_name
        WHERE ac.owner = :1
          AND ac.table_name = :2
          AND ac.constraint_type = 'P'
        ORDER BY acc.position
    "#;

    let rows = conn
        .query(sql, &[&owner, &table])
        .map_err(|e| format!("Không đọc được Oracle primary key: {}", e))?;

    let mut result = HashSet::new();

    for row_result in rows {
        let row = row_result.map_err(|e| e.to_string())?;

        let column: String = row.get("COLUMN_NAME").map_err(|e| e.to_string())?;

        result.insert(column);
    }

    Ok(result)
}

// ============================================================
// UNIQUE
// ============================================================

fn load_single_unique_columns(
    conn: &Connection,
    owner: &str,
    table: &str,
) -> Result<HashSet<String>, String> {
    /*
     * Chỉ đánh dấu column.unique = true
     * khi UNIQUE constraint có đúng 1 column.
     *
     * Ví dụ:
     *
     * UNIQUE(email)
     * => email.unique = true
     *
     * UNIQUE(first_name, last_name)
     * => không column nào riêng lẻ unique.
     */

    let sql = r#"
        SELECT
            acc.column_name
        FROM all_constraints ac
        JOIN all_cons_columns acc
          ON acc.owner = ac.owner
         AND acc.constraint_name =
             ac.constraint_name
         AND acc.table_name =
             ac.table_name
        WHERE ac.owner = :1
          AND ac.table_name = :2
          AND ac.constraint_type = 'U'
          AND (
              SELECT COUNT(*)
              FROM all_cons_columns x
              WHERE x.owner = ac.owner
                AND x.constraint_name =
                    ac.constraint_name
                AND x.table_name =
                    ac.table_name
          ) = 1
    "#;

    let rows = conn
        .query(sql, &[&owner, &table])
        .map_err(|e| format!("Không đọc được Oracle UNIQUE constraints: {}", e))?;

    let mut result = HashSet::new();

    for row_result in rows {
        let row = row_result.map_err(|e| e.to_string())?;

        let column: String = row.get("COLUMN_NAME").map_err(|e| e.to_string())?;

        result.insert(column);
    }

    Ok(result)
}

// ============================================================
// Foreign Keys
// ============================================================

fn load_foreign_keys(
    conn: &Connection,
    owner: &str,
    table: &str,
) -> Result<HashMap<String, ForeignKeyInfo>, String> {
    /*
     * Mapping:
     *
     * ORDERS.CUSTOMER_ID
     *
     * FK_ORDER_CUSTOMER
     *
     * ->
     *
     * CUSTOMER.ID
     */

    let sql = r#"
        SELECT
            fk.constraint_name,

            fk_col.column_name
                AS source_column,

            pk.owner
                AS referenced_owner,

            pk.table_name
                AS referenced_table,

            pk_col.column_name
                AS referenced_column

        FROM all_constraints fk

        JOIN all_cons_columns fk_col
          ON fk_col.owner =
             fk.owner
         AND fk_col.constraint_name =
             fk.constraint_name
         AND fk_col.table_name =
             fk.table_name

        JOIN all_constraints pk
          ON pk.owner =
             fk.r_owner
         AND pk.constraint_name =
             fk.r_constraint_name

        JOIN all_cons_columns pk_col
          ON pk_col.owner =
             pk.owner
         AND pk_col.constraint_name =
             pk.constraint_name
         AND pk_col.table_name =
             pk.table_name
         AND pk_col.position =
             fk_col.position

        WHERE fk.owner = :1
          AND fk.table_name = :2
          AND fk.constraint_type = 'R'

        ORDER BY
            fk.constraint_name,
            fk_col.position
    "#;

    let rows = conn
        .query(sql, &[&owner, &table])
        .map_err(|e| format!("Không đọc được Oracle foreign keys: {}", e))?;

    let mut result = HashMap::new();

    for row_result in rows {
        let row = row_result.map_err(|e| e.to_string())?;

        let constraint_name: String = row.get("CONSTRAINT_NAME").map_err(|e| e.to_string())?;

        let source_column: String = row.get("SOURCE_COLUMN").map_err(|e| e.to_string())?;

        let referenced_owner: String = row.get("REFERENCED_OWNER").map_err(|e| e.to_string())?;

        let referenced_table: String = row.get("REFERENCED_TABLE").map_err(|e| e.to_string())?;

        let referenced_column: String = row.get("REFERENCED_COLUMN").map_err(|e| e.to_string())?;

        result.insert(
            source_column,
            ForeignKeyInfo {
                constraint_name,

                referenced_schema: referenced_owner,

                referenced_table,

                referenced_column,
            },
        );
    }

    Ok(result)
}

// ============================================================
// CHECK constraints
// ============================================================

fn load_check_constraints(
    conn: &Connection,
    owner: &str,
    table: &str,
) -> Result<HashMap<String, Vec<String>>, String> {
    /*
     * SEARCH_CONDITION_VC có từ các version
     * Oracle mới.
     *
     * Ta thử nó trước.
     *
     * Nếu DB cũ không hỗ trợ column này,
     * fallback về SEARCH_CONDITION.
     */

    match load_check_constraints_vc(conn, owner, table) {
        Ok(value) => Ok(value),

        Err(_) => load_check_constraints_legacy(conn, owner, table),
    }
}

fn load_check_constraints_vc(
    conn: &Connection,
    owner: &str,
    table: &str,
) -> Result<HashMap<String, Vec<String>>, String> {
    let sql = r#"
        SELECT
            ac.constraint_name,
            acc.column_name,
            ac.search_condition_vc
                AS search_condition
        FROM all_constraints ac
        LEFT JOIN all_cons_columns acc
          ON acc.owner =
             ac.owner
         AND acc.constraint_name =
             ac.constraint_name
         AND acc.table_name =
             ac.table_name
        WHERE ac.owner = :1
          AND ac.table_name = :2
          AND ac.constraint_type = 'C'
        ORDER BY
            ac.constraint_name,
            acc.position
    "#;

    read_check_constraint_rows(conn, sql, owner, table)
}

fn load_check_constraints_legacy(
    conn: &Connection,
    owner: &str,
    table: &str,
) -> Result<HashMap<String, Vec<String>>, String> {
    let sql = r#"
        SELECT
            ac.constraint_name,
            acc.column_name,
            ac.search_condition
                AS search_condition
        FROM all_constraints ac
        LEFT JOIN all_cons_columns acc
          ON acc.owner =
             ac.owner
         AND acc.constraint_name =
             ac.constraint_name
         AND acc.table_name =
             ac.table_name
        WHERE ac.owner = :1
          AND ac.table_name = :2
          AND ac.constraint_type = 'C'
        ORDER BY
            ac.constraint_name,
            acc.position
    "#;

    read_check_constraint_rows(conn, sql, owner, table)
}

fn read_check_constraint_rows(
    conn: &Connection,
    sql: &str,
    owner: &str,
    table: &str,
) -> Result<HashMap<String, Vec<String>>, String> {
    let rows = conn
        .query(sql, &[&owner, &table])
        .map_err(|e| format!("Không đọc được Oracle CHECK constraints: {}", e))?;

    let mut result: HashMap<String, Vec<String>> = HashMap::new();

    for row_result in rows {
        let row = row_result.map_err(|e| e.to_string())?;

        let constraint_name: String = row.get("CONSTRAINT_NAME").map_err(|e| e.to_string())?;

        let column_name: Option<String> = row.get("COLUMN_NAME").unwrap_or(None);

        let condition: Option<String> = row.get("SEARCH_CONDITION").unwrap_or(None);

        let Some(column_name) = column_name else {
            continue;
        };

        let text = match condition {
            Some(condition) => {
                format!("{}: {}", constraint_name, condition.trim(),)
            }

            None => constraint_name,
        };

        result.entry(column_name).or_default().push(text);
    }

    Ok(result)
}

// ============================================================
// All table constraints
// ============================================================

fn load_table_constraints(
    conn: &Connection,
    owner: &str,
    table: &str,
) -> Result<Vec<String>, String> {
    /*
     * Tạo dữ liệu text cho frontend,
     * ví dụ:
     *
     * PK_CUSTOMER [PRIMARY KEY]
     * UK_CUSTOMER_EMAIL [UNIQUE]
     * FK_ORDER_USER [FOREIGN KEY]
     */

    let sql = r#"
        SELECT
            constraint_name,
            constraint_type,
            status
        FROM all_constraints
        WHERE owner = :1
          AND table_name = :2
          AND constraint_type
              IN ('P', 'U', 'R', 'C')
        ORDER BY constraint_name
    "#;

    let rows = conn
        .query(sql, &[&owner, &table])
        .map_err(|e| format!("Không đọc được Oracle table constraints: {}", e))?;

    let mut result = Vec::new();

    for row_result in rows {
        let row = row_result.map_err(|e| e.to_string())?;

        let name: String = row.get("CONSTRAINT_NAME").map_err(|e| e.to_string())?;

        let constraint_type: String = row.get("CONSTRAINT_TYPE").map_err(|e| e.to_string())?;

        let status: Option<String> = row.get("STATUS").unwrap_or(None);

        let type_name = match constraint_type.as_str() {
            "P" => "PRIMARY KEY",

            "U" => "UNIQUE",

            "R" => "FOREIGN KEY",

            "C" => "CHECK",

            _ => "OTHER",
        };

        result.push(format!(
            "{} [{}]{}",
            name,
            type_name,
            status
                .map(|status| { format!(" ({})", status) },)
                .unwrap_or_default(),
        ));
    }

    Ok(result)
}
