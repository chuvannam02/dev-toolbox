mod curl_formatter;
mod detector;
mod json_formatter;
mod sql_formatter;
mod types;
mod xml_formatter;
mod yaml_formatter;

use curl_formatter::format_curl_for_windows_cmd;
use detector::detect_format;
use json_formatter::format_json;
use sql_formatter::format_sql;
use types::{FormatResult, FormatType};
use xml_formatter::format_xml;
use yaml_formatter::format_yaml;

#[tauri::command]
pub fn detect_and_format(raw_text: String) -> FormatResult {
    let text = raw_text.trim();

    if text.is_empty() {
        return FormatResult::error(FormatType::Unknown, String::new(), "Nội dung trống.".into());
    }

    let format_type = detect_format(text);

    let result = match format_type {
        FormatType::Json => format_json(text),

        FormatType::Xml => format_xml(text),

        FormatType::Yaml => format_yaml(text),

        FormatType::Sql => format_sql(text),

        FormatType::Curl => format_curl_for_windows_cmd(text),

        /*
         * Chưa tự format bằng regex.
         *
         * Detect để Monaco syntax highlight trước.
         */
        FormatType::Css | FormatType::Javascript | FormatType::Java | FormatType::Python => {
            Ok(raw_text.clone())
        }

        FormatType::Plaintext | FormatType::Unknown => {
            return FormatResult {
                format_type: FormatType::Unknown.as_str().into(),

                is_valid: true,

                formatted_text: raw_text,

                error_msg: Some("Không nhận dạng được định dạng đặc biệt.".into()),
            };
        }
    };

    match result {
        Ok(formatted) => FormatResult::success(format_type, formatted),

        Err(error) => FormatResult::error(format_type, raw_text, error),
    }
}
