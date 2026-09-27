use super::types::FormatType;

pub fn detect_format(text: &str) -> FormatType {
    let trimmed = text.trim();

    if trimmed.is_empty() {
        return FormatType::Unknown;
    }

    let lower = trimmed.to_ascii_lowercase();

    // cURL
    if matches!(
        trimmed
            .split_whitespace()
            .next()
            .map(|s| s.to_ascii_lowercase())
            .as_deref(),
        Some("curl") | Some("curl.exe")
    ) {
        return FormatType::Curl;
    }

    // XML
    if trimmed.starts_with('<') {
        return FormatType::Xml;
    }

    // JSON
    if (trimmed.starts_with('{') || trimmed.starts_with('['))
        && serde_json::from_str::<serde_json::Value>(trimmed).is_ok()
    {
        return FormatType::Json;
    }

    let upper = trimmed.to_ascii_uppercase();

    // SQL
    if [
        "SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP", "MERGE", "WITH",
        "TRUNCATE",
    ]
    .iter()
    .any(|keyword| upper.starts_with(keyword))
    {
        return FormatType::Sql;
    }

    // Java
    if lower.contains("public class ")
        || lower.contains("private class ")
        || lower.contains("protected class ")
        || lower.starts_with("package ")
        || lower.contains("import java.")
        || lower.contains("public static void main")
    {
        return FormatType::Java;
    }

    // Python
    if lower.starts_with("def ")
        || lower.starts_with("import ")
        || lower.starts_with("from ")
        || lower.starts_with("class ")
        || lower.contains("\ndef ")
        || lower.contains("\nclass ")
        || lower.contains("__name__")
    {
        return FormatType::Python;
    }

    // JavaScript
    if lower.starts_with("const ")
        || lower.starts_with("let ")
        || lower.starts_with("var ")
        || lower.starts_with("function ")
        || lower.contains("=>")
        || lower.contains("console.log")
        || lower.contains("document.")
        || lower.contains("window.")
    {
        return FormatType::Javascript;
    }

    // CSS
    if trimmed.contains('{')
        && trimmed.contains('}')
        && trimmed.contains(':')
        && !trimmed.contains("=>")
    {
        return FormatType::Css;
    }

    // YAML
    if looks_like_yaml(trimmed) {
        return FormatType::Yaml;
    }

    FormatType::Unknown
}

fn looks_like_yaml(text: &str) -> bool {
    if text.starts_with("---") {
        return true;
    }

    let valid_lines = text
        .lines()
        .filter(|line| {
            let line = line.trim();

            !line.is_empty()
                && !line.starts_with('#')
                && line.contains(':')
                && !line.contains('{')
                && !line.contains('}')
        })
        .count();

    valid_lines >= 2
}
