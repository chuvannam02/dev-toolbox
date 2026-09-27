pub fn format_yaml(text: &str) -> Result<String, String> {
    let value: serde_yaml_ng::Value =
        serde_yaml_ng::from_str(text).map_err(|e| format!("Lỗi cú pháp YAML: {}", e))?;

    serde_yaml_ng::to_string(&value).map_err(|e| format!("Không thể format YAML: {}", e))
}
