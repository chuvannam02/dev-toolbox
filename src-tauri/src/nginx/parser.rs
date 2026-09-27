use super::models::{IssueSeverity, NginxIssue, NginxNode, NginxParseResult};

/// Token thô sau bước tokenize.
#[derive(Debug, Clone, PartialEq)]
enum Token {
    Word(String),
    OpenBrace,
    CloseBrace,
    Semicolon,
    Comment(String),
}

#[derive(Debug, Clone)]
struct PositionedToken {
    token: Token,
    line: usize,
}

/// Tokenize nội dung config, có xử lý:
/// - chuỗi có dấu nháy (single/double quote), cho phép khoảng trắng bên trong
/// - comment `# ...` tới hết dòng
/// - escape `\"` bên trong chuỗi quote
fn tokenize(input: &str) -> Vec<PositionedToken> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();
    let mut line = 1usize;
    let mut current_word = String::new();

    macro_rules! flush_word {
        () => {
            if !current_word.is_empty() {
                tokens.push(PositionedToken {
                    token: Token::Word(std::mem::take(&mut current_word)),
                    line,
                });
            }
        };
    }

    while let Some(&c) = chars.peek() {
        match c {
            '\n' => {
                flush_word!();
                line += 1;
                chars.next();
            }
            ' ' | '\t' | '\r' => {
                flush_word!();
                chars.next();
            }
            '#' => {
                flush_word!();
                chars.next();
                let mut text = String::new();
                while let Some(&nc) = chars.peek() {
                    if nc == '\n' {
                        break;
                    }
                    text.push(nc);
                    chars.next();
                }
                tokens.push(PositionedToken {
                    token: Token::Comment(text.trim().to_string()),
                    line,
                });
            }
            '{' => {
                flush_word!();
                chars.next();
                tokens.push(PositionedToken {
                    token: Token::OpenBrace,
                    line,
                });
            }
            '}' => {
                flush_word!();
                chars.next();
                tokens.push(PositionedToken {
                    token: Token::CloseBrace,
                    line,
                });
            }
            ';' => {
                flush_word!();
                chars.next();
                tokens.push(PositionedToken {
                    token: Token::Semicolon,
                    line,
                });
            }
            '"' | '\'' => {
                let quote = c;
                chars.next();
                let start_line = line;
                let mut value = String::new();
                while let Some(&nc) = chars.peek() {
                    if nc == '\\' {
                        chars.next();
                        if let Some(&escaped) = chars.peek() {
                            value.push(escaped);
                            chars.next();
                        }
                        continue;
                    }
                    if nc == quote {
                        chars.next();
                        break;
                    }
                    if nc == '\n' {
                        line += 1;
                    }
                    value.push(nc);
                    chars.next();
                }
                // Giữ nguyên chuỗi đã quote thành một "word" duy nhất.
                tokens.push(PositionedToken {
                    token: Token::Word(value),
                    line: start_line,
                });
            }
            _ => {
                current_word.push(c);
                chars.next();
            }
        }
    }
    flush_word!();
    tokens
}

struct Parser {
    tokens: Vec<PositionedToken>,
    pos: usize,
    issues: Vec<NginxIssue>,
}

impl Parser {
    fn peek(&self) -> Option<&PositionedToken> {
        self.tokens.get(self.pos)
    }

    fn advance(&mut self) -> Option<PositionedToken> {
        let tok = self.tokens.get(self.pos).cloned();
        self.pos += 1;
        tok
    }

    /// Parse một danh sách node cho tới khi gặp `}` (block con) hoặc hết token (root).
    fn parse_nodes(&mut self, inside_block: bool) -> Vec<NginxNode> {
        let mut nodes = Vec::new();

        loop {
            let Some(pt) = self.peek().cloned() else {
                break;
            };

            match pt.token {
                Token::CloseBrace => {
                    if inside_block {
                        self.advance(); // consume '}', caller xử lý
                        return nodes;
                    } else {
                        self.issues.push(NginxIssue {
                            severity: IssueSeverity::Error,
                            line: pt.line,
                            message: "Unexpected '}' — không có block mở tương ứng".into(),
                            hint: None,
                        });
                        self.advance();
                    }
                }
                Token::Comment(text) => {
                    nodes.push(NginxNode::Comment {
                        text,
                        line: pt.line,
                    });
                    self.advance();
                }
                Token::Semicolon => {
                    // Semicolon lạc (vd: `;;`) — bỏ qua nhưng cảnh báo nhẹ.
                    self.advance();
                }
                Token::Word(first_word) => {
                    let start_line = pt.line;
                    self.advance();
                    let mut args = Vec::new();

                    loop {
                        match self.peek().map(|t| t.token.clone()) {
                            Some(Token::Word(w)) => {
                                args.push(w);
                                self.advance();
                            }
                            Some(Token::Semicolon) => {
                                self.advance();
                                nodes.push(NginxNode::Directive {
                                    name: first_word.clone(),
                                    args,
                                    line: start_line,
                                });
                                break;
                            }
                            Some(Token::OpenBrace) => {
                                self.advance();
                                let children = self.parse_nodes(true);
                                nodes.push(NginxNode::Block {
                                    name: first_word.clone(),
                                    args,
                                    children,
                                    line: start_line,
                                });
                                break;
                            }
                            Some(Token::CloseBrace) | None => {
                                self.issues.push(NginxIssue {
                                    severity: IssueSeverity::Error,
                                    line: start_line,
                                    message: format!(
                                        "Missing \";\" hoặc \"{{\" sau directive \"{}\"",
                                        first_word
                                    ),
                                    hint: Some(format!("{} {};", first_word, args.join(" "))),
                                });
                                // Không advance CloseBrace ở đây để vòng ngoài xử lý đóng block.
                                if matches!(
                                    self.peek().map(|t| t.token.clone()),
                                    Some(Token::CloseBrace)
                                ) {
                                    nodes.push(NginxNode::Directive {
                                        name: first_word.clone(),
                                        args,
                                        line: start_line,
                                    });
                                }
                                break;
                            }
                            Some(Token::Comment(_)) => {
                                // comment giữa các arg — bỏ qua, tiếp tục đọc arg
                                self.advance();
                            }
                        }
                    }
                }
                Token::OpenBrace => {
                    self.issues.push(NginxIssue {
                        severity: IssueSeverity::Error,
                        line: pt.line,
                        message: "Unexpected '{' — thiếu tên block trước dấu ngoặc".into(),
                        hint: None,
                    });
                    self.advance();
                }
            }
        }

        if inside_block {
            self.issues.push(NginxIssue {
                severity: IssueSeverity::Error,
                line: self.tokens.last().map(|t| t.line).unwrap_or(0),
                message: "Missing \"}\" — block chưa được đóng".into(),
                hint: None,
            });
        }

        nodes
    }
}

/// Parse toàn bộ nội dung nginx config (một file, sau khi include đã/chưa được resolve).
pub fn parse(input: &str) -> NginxParseResult {
    let tokens = tokenize(input);
    let mut parser = Parser {
        tokens,
        pos: 0,
        issues: Vec::new(),
    };
    let tree = parser.parse_nodes(false);
    NginxParseResult {
        tree,
        issues: parser.issues,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_server_block() {
        let cfg = r#"
            server {
                listen 80;
                server_name api.example.com;
                location /api {
                    proxy_pass http://backend;
                }
            }
        "#;
        let result = parse(cfg);
        assert!(result.issues.is_empty());
        assert_eq!(result.tree.len(), 1);
    }

    #[test]
    fn detects_missing_semicolon() {
        let cfg = r#"
            server {
                listen 443
                server_name api.example.com;
            }
        "#;
        let result = parse(cfg);
        assert!(!result.issues.is_empty());
        assert!(result.issues[0].message.contains("listen"));
    }

    #[test]
    fn detects_unclosed_block() {
        let cfg = "http { server { listen 80; ";
        let result = parse(cfg);
        assert!(result
            .issues
            .iter()
            .any(|i| i.message.contains("Missing \"}\"")));
    }
}
