use serde::Serialize;

#[derive(Debug, Clone, Copy)]
pub enum FormatType {
    Json,
    Xml,
    Yaml,
    Css,
    Javascript,
    Java,
    Python,
    Sql,
    Curl,
    Plaintext,
    Unknown,
}

impl FormatType {
    pub fn as_str(&self) -> &'static str {
        match self {
            FormatType::Json => "json",
            FormatType::Xml => "xml",
            FormatType::Yaml => "yaml",
            FormatType::Css => "css",
            FormatType::Javascript => "javascript",
            FormatType::Java => "java",
            FormatType::Python => "python",
            FormatType::Sql => "sql",
            FormatType::Curl => "curl",
            FormatType::Plaintext => "plaintext",
            FormatType::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Serialize)]
pub struct FormatResult {
    pub format_type: String,
    pub is_valid: bool,
    pub formatted_text: String,
    pub error_msg: Option<String>,
}

impl FormatResult {
    pub fn success(format_type: FormatType, formatted_text: String) -> Self {
        Self {
            format_type: format_type.as_str().into(),
            is_valid: true,
            formatted_text,
            error_msg: None,
        }
    }

    pub fn error(format_type: FormatType, original_text: String, message: String) -> Self {
        Self {
            format_type: format_type.as_str().into(),
            is_valid: false,
            formatted_text: original_text,
            error_msg: Some(message),
        }
    }
}
