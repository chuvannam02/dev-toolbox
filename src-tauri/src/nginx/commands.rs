use tauri::AppHandle;

use super::bundled;
use super::models::NginxParseResult;
use super::parser;
use super::process::{self, NginxNativeCheckResult};
use super::validator;

/// Parse + static-validate nội dung config (không cần cài nginx trên máy).
/// Đây là command chính dùng cho Editor / Config Tree / live-lint khi gõ.
#[tauri::command]
pub fn nginx_parse(content: String) -> NginxParseResult {
    let mut result = parser::parse(&content);
    let structural_issues = validator::validate(&result.tree);
    result.issues.extend(structural_issues);
    result.issues.sort_by_key(|i| i.line);
    result
}

/// Gọi `nginx -t` thật trên máy (nếu có cài). Dùng cho nút "Test Config" chính.
#[tauri::command]
pub fn nginx_native_test(config_path: Option<String>) -> Result<NginxNativeCheckResult, String> {
    process::run_native_test(config_path.as_deref())
}

/// Gọi `nginx -T` — dump full config sau khi resolve include, để hiển thị Config Tree
/// chính xác 100% với những gì nginx thực sự nạp.
#[tauri::command]
pub fn nginx_native_dump(config_path: Option<String>) -> Result<NginxNativeCheckResult, String> {
    process::run_native_dump(config_path.as_deref())
}

/// Đọc file từ đường dẫn rồi parse — dùng khi người dùng "Open nginx.conf".
#[tauri::command]
pub fn nginx_parse_file(path: String) -> Result<NginxParseResult, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Không đọc được file {}: {}", path, e))?;
    Ok(nginx_parse(content))
}

/// Chạy `-t` bằng bản nginx bundled sẵn trong app (copy ra app data dir ở lần
/// gọi đầu tiên nếu chưa có). Đây là command mặc định cho nút "Test Config" —
/// người dùng không cần tự cài nginx.
#[tauri::command]
pub fn nginx_bundled_test(
    app: AppHandle,
    config_path: Option<String>,
) -> Result<NginxNativeCheckResult, String> {
    bundled::bundled_test(&app, config_path.as_deref())
}

/// Chạy `-T` bằng bản nginx bundled — dump full config đã resolve include.
#[tauri::command]
pub fn nginx_bundled_dump(
    app: AppHandle,
    config_path: Option<String>,
) -> Result<NginxNativeCheckResult, String> {
    bundled::bundled_dump(&app, config_path.as_deref())
}

/// Đảm bảo nginx bundled đã được giải nén ra thư mục ghi được, trả về đường dẫn
/// thư mục đó — dùng khi UI cần biết vị trí `conf/nginx.conf` mặc định để mở lên
/// cho người dùng chỉnh trực tiếp lần đầu.
#[tauri::command]
pub fn nginx_ensure_bundled(app: AppHandle) -> Result<String, String> {
    bundled::ensure_bundled_nginx(&app).map(|p| p.to_string_lossy().to_string())
}