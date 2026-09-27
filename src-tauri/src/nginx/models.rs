use serde::{Deserialize, Serialize};

/// Một node trong AST của nginx config.
/// - Directive: dòng đơn kết thúc bằng `;` (vd: `listen 80;`)
/// - Block: có `{ ... }` chứa các node con (vd: `server { ... }`)
/// - Comment: dòng `# ...`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum NginxNode {
    Directive {
        name: String,
        args: Vec<String>,
        line: usize,
    },
    Block {
        name: String,
        args: Vec<String>,
        children: Vec<NginxNode>,
        line: usize,
    },
    Comment {
        text: String,
        line: usize,
    },
}

impl NginxNode {
    pub fn line(&self) -> usize {
        match self {
            NginxNode::Directive { line, .. } => *line,
            NginxNode::Block { line, .. } => *line,
            NginxNode::Comment { line, .. } => *line,
        }
    }

    pub fn name(&self) -> Option<&str> {
        match self {
            NginxNode::Directive { name, .. } => Some(name),
            NginxNode::Block { name, .. } => Some(name),
            NginxNode::Comment { .. } => None,
        }
    }
}

/// Context (ngữ cảnh) hiện tại khi duyệt cây, dùng để validate và autocomplete.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NginxContext {
    Main,
    Events,
    Http,
    Server,
    Location,
    Upstream,
    Stream,
    Map,
    If,
    Types,
    Unknown,
}

impl NginxContext {
    /// Context con khi gặp block có tên `block_name`, dựa trên context cha hiện tại.
    pub fn child_context(&self, block_name: &str) -> NginxContext {
        match block_name {
            "http" => NginxContext::Http,
            "events" => NginxContext::Events,
            "server" => NginxContext::Server,
            "location" => NginxContext::Location,
            "upstream" => NginxContext::Upstream,
            "stream" => NginxContext::Stream,
            "map" => NginxContext::Map,
            "if" => NginxContext::If,
            "types" => NginxContext::Types,
            _ => NginxContext::Unknown,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            NginxContext::Main => "main",
            NginxContext::Events => "events",
            NginxContext::Http => "http",
            NginxContext::Server => "server",
            NginxContext::Location => "location",
            NginxContext::Upstream => "upstream",
            NginxContext::Stream => "stream",
            NginxContext::Map => "map",
            NginxContext::If => "if",
            NginxContext::Types => "types",
            NginxContext::Unknown => "unknown",
        }
    }
}

/// Một vấn đề (lỗi/cảnh báo) phát hiện được khi parse hoặc validate.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NginxIssue {
    pub severity: IssueSeverity,
    pub line: usize,
    pub message: String,
    /// Gợi ý sửa, nếu có (hiển thị dạng "Expected: ...")
    pub hint: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IssueSeverity {
    Error,
    Warning,
}

/// Kết quả tổng hợp trả về cho frontend sau khi parse + validate.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NginxParseResult {
    pub tree: Vec<NginxNode>,
    pub issues: Vec<NginxIssue>,
}
