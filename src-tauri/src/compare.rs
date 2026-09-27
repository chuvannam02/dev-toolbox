use crate::AppState;

use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCompareInput {
    pub name: String,

    pub original_name: String,
    pub original_content: String,

    pub modified_name: String,
    pub modified_content: String,

    pub language: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareHistory {
    pub id: i64,

    pub name: String,

    pub original_name: String,
    pub original_content: String,

    pub modified_name: String,
    pub modified_content: String,

    pub language: String,

    pub created_at: String,
}

#[tauri::command]
pub fn save_compare_history(
    state: State<AppState>,
    input: SaveCompareInput,
) -> Result<i64, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Không thể truy cập database")?;

    db.execute(
        r#"
        INSERT INTO compare_history (
            name,
            original_name,
            original_content,
            modified_name,
            modified_content,
            language
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        rusqlite::params![
            input.name,
            input.original_name,
            input.original_content,
            input.modified_name,
            input.modified_content,
            input.language,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(db.last_insert_rowid())
}

#[tauri::command]
pub fn search_compare_history(
    state: State<AppState>,
    query: String,
) -> Result<Vec<CompareHistory>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Không thể truy cập database")?;

    let search = format!(
        "%{}%",
        query.trim()
    );

    let mut statement = db
        .prepare(
            r#"
            SELECT
                id,
                name,
                original_name,
                original_content,
                modified_name,
                modified_content,
                language,
                created_at
            FROM compare_history
            WHERE
                ?1 = '%%'
                OR name LIKE ?1
                OR original_name LIKE ?1
                OR modified_name LIKE ?1
            ORDER BY created_at DESC
            LIMIT 100
            "#,
        )
        .map_err(|e| e.to_string())?;

    let rows = statement
        .query_map(
            [search],
            |row| {
                Ok(CompareHistory {
                    id: row.get(0)?,

                    name: row.get(1)?,

                    original_name: row.get(2)?,
                    original_content: row.get(3)?,

                    modified_name: row.get(4)?,
                    modified_content: row.get(5)?,

                    language: row.get(6)?,

                    created_at: row.get(7)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();

    for row in rows {
        result.push(
            row.map_err(|e| e.to_string())?
        );
    }

    Ok(result)
}