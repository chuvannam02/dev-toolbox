use chrono::Local;
use cron::Schedule;
use serde::Serialize;
use std::str::FromStr;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CronPreviewResponse {
    pub valid: bool,

    /// Cron expression gốc sau khi normalize khoảng trắng.
    /// Ví dụ: */5 * * * *
    pub expression: String,

    /// Danh sách thời điểm chạy tiếp theo.
    pub next_runs: Vec<String>,

    /// Error khi cron không hợp lệ.
    pub error: Option<String>,
}

/// mode:
/// - "unix"    -> cron Linux 5 fields
/// - "seconds" -> cron 6 fields có seconds
///
/// Unix:
/// minute hour day-of-month month day-of-week
///
/// Seconds:
/// second minute hour day-of-month month day-of-week
#[tauri::command]
pub fn preview_cron(
    expression: String,
    mode: String,
    count: usize,
) -> CronPreviewResponse {
    let normalized = normalize_expression(&expression);

    if normalized.is_empty() {
        return error_response(
            normalized,
            "Cron expression cannot be empty.".to_string(),
        );
    }

    let actual_fields = normalized.split_whitespace().count();

    let parser_expression = match mode.as_str() {
        "unix" => {
            if actual_fields != 5 {
                return error_response(
                    normalized,
                    format!(
                        "Unix cron requires exactly 5 fields, but received {}.",
                        actual_fields
                    ),
                );
            }

            // Rust crate `cron` expects seconds as the first field.
            //
            // User:
            // */5 * * * *
            //
            // Parser:
            // 0 */5 * * * *
            format!("0 {}", normalized)
        }

        "seconds" => {
            if actual_fields != 6 {
                return error_response(
                    normalized,
                    format!(
                        "Cron with seconds requires exactly 6 fields, but received {}.",
                        actual_fields
                    ),
                );
            }

            normalized.clone()
        }

        _ => {
            return error_response(
                normalized,
                format!("Unsupported cron mode: {}", mode),
            );
        }
    };

    let schedule = match Schedule::from_str(&parser_expression) {
        Ok(schedule) => schedule,

        Err(error) => {
            return error_response(
                normalized,
                error.to_string(),
            );
        }
    };

    // Không cho FE bắt backend calculate quá nhiều.
    let preview_count = count.clamp(1, 20);

    let next_runs: Vec<String> = schedule
        .upcoming(Local)
        .take(preview_count)
        .map(|date_time| {
            date_time
                .format("%Y-%m-%d %H:%M:%S %:z")
                .to_string()
        })
        .collect();

    CronPreviewResponse {
        valid: true,
        expression: normalized,
        next_runs,
        error: None,
    }
}

fn normalize_expression(expression: &str) -> String {
    expression
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn error_response(
    expression: String,
    error: String,
) -> CronPreviewResponse {
    CronPreviewResponse {
        valid: false,
        expression,
        next_runs: Vec::new(),
        error: Some(error),
    }
}