pub fn format_sql(text: &str) -> Result<String, String> {
    Ok(sqlformat::format(
        text,
        &sqlformat::QueryParams::None,
        &sqlformat::FormatOptions::default(),
    ))
}