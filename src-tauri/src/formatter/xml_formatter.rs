use quick_xml::{events::Event, Reader, Writer};

use std::io::Cursor;

pub fn format_xml(text: &str) -> Result<String, String> {
    let mut reader = Reader::from_str(text);

    let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 2);

    loop {
        match reader.read_event() {
            Ok(Event::Eof) => break,

            // Bỏ whitespace cũ để Writer tự indent lại.
            Ok(Event::Text(event)) if event.as_ref().chars().all(|b| b.is_ascii_whitespace()) => {}

            Ok(event) => {
                writer
                    .write_event(event.into_owned())
                    .map_err(|e| format!("Lỗi khi format XML: {}", e))?;
            }

            Err(e) => {
                return Err(format!("Lỗi cú pháp XML: {}", e));
            }
        }
    }

    String::from_utf8(writer.into_inner().into_inner())
        .map_err(|e| format!("XML UTF-8 error: {}", e))
}
