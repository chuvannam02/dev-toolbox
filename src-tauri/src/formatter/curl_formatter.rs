pub fn format_curl_for_windows_cmd(input: &str) -> Result<String, String> {
    let mut tokens = tokenize_curl_command(input)?;
    let executable = tokens.first().map(|token| token.to_ascii_lowercase());
    if !matches!(executable.as_deref(), Some("curl") | Some("curl.exe")) {
        return Err("Không phải lệnh cURL.".into());
    }

    // Explicit .exe avoids the Invoke-WebRequest alias in Windows PowerShell and also works in CMD.
    tokens[0] = "curl.exe".into();
    let lines = tokens
        .into_iter()
        .map(|token| quote_for_windows_cmd(&token))
        .collect::<Vec<_>>();

    // One physical line lets users paste directly into CMD without the `More?` prompt.
    Ok(lines.join(" "))
}

/// Split a shell-style curl command without executing it. This intentionally supports the
/// quoting normally produced by Postman/Insomnia (`'...'` and `"..."`) and line continuations.
fn tokenize_curl_command(input: &str) -> Result<Vec<String>, String> {
    let normalized = input
        .lines()
        .map(|line| {
            let trimmed = line.trim_end();
            trimmed
                .strip_suffix('\\')
                .or_else(|| trimmed.strip_suffix('^'))
                .unwrap_or(trimmed)
        })
        .collect::<Vec<_>>()
        .join(" ");

    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut chars = normalized.chars().peekable();

    while let Some(ch) = chars.next() {
        if let Some(active_quote) = quote {
            if ch == active_quote {
                quote = None;
            } else if ch == '\\' && active_quote == '"' && matches!(chars.peek(), Some('"' | '\\'))
            {
                // Keep escaped JSON quotes/backslashes as literal characters.
                current.push(chars.next().expect("peeked character must exist"));
            } else {
                current.push(ch);
            }
        } else {
            match ch {
                '\'' | '"' => quote = Some(ch),
                ch if ch.is_whitespace() => {
                    if !current.is_empty() {
                        tokens.push(std::mem::take(&mut current));
                    }
                }
                _ => current.push(ch),
            }
        }
    }

    if quote.is_some() {
        return Err("Lệnh cURL có dấu nháy chưa được đóng.".into());
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    Ok(tokens)
}

fn quote_for_windows_cmd(argument: &str) -> String {
    if argument.is_empty() {
        return "\"\"".into();
    }

    // CMD accepts quoted arguments; `\\"` makes an embedded quote reach curl literally,
    // which is required for JSON supplied through --data/--data-raw.
    if argument
        .chars()
        .any(|ch| ch.is_whitespace() || "\"&|<>()^".contains(ch))
    {
        format!("\"{}\"", argument.replace('"', "\\\""))
    } else {
        argument.into()
    }
}