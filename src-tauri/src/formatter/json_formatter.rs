pub fn format_json(text: &str) -> Result<String, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("Lỗi cú pháp JSON: {}", e))?;

    serde_json::to_string_pretty(&parsed).map_err(|e| format!("Không thể format JSON: {}", e))
}
