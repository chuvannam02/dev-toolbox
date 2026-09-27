use rusqlite::Connection;
use std::path::Path;

pub fn init_database(db_path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(db_path)
        .map_err(|e| format!("Không thể mở database: {e}"))?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS compare_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL,

            original_name TEXT NOT NULL,
            original_content TEXT NOT NULL,

            modified_name TEXT NOT NULL,
            modified_content TEXT NOT NULL,

            language TEXT NOT NULL DEFAULT 'plaintext',

            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_compare_history_name
        ON compare_history(name);

        CREATE INDEX IF NOT EXISTS idx_compare_history_created_at
        ON compare_history(created_at);
        "#,
    )
    .map_err(|e| format!("Không thể tạo database schema: {e}"))?;

    Ok(conn)
}