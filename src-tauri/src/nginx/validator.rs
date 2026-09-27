use super::models::{IssueSeverity, NginxContext, NginxIssue, NginxNode};

/// Danh sách block-name hợp lệ được phép mở ở một context cha cho trước.
/// Đây không phải danh sách đầy đủ 100% của nginx, nhưng bao phủ các block
/// phổ biến — đủ để bắt phần lớn lỗi cấu trúc hay gặp.
fn allowed_child_blocks(ctx: NginxContext) -> &'static [&'static str] {
    match ctx {
        NginxContext::Main => &["events", "http", "stream", "mail"],
        NginxContext::Http => &["server", "upstream", "map", "geo", "types", "if", "limit_except"],
        NginxContext::Server => &["location", "if", "limit_except"],
        NginxContext::Location => &["if", "limit_except"],
        NginxContext::Stream => &["server", "upstream", "map"],
        NginxContext::Upstream => &[], // chỉ chứa directive (server, least_conn, ...)
        NginxContext::Events => &[],
        NginxContext::Map => &[],
        NginxContext::If => &[],
        NginxContext::Types => &[],
        NginxContext::Unknown => &[],
    }
}

/// Danh sách directive (không phải block) hợp lệ ở từng context.
/// Bao phủ các directive hay dùng nhất; directive lạ chỉ bị cảnh báo (warning),
/// không báo lỗi cứng, vì nginx có rất nhiều module/directive.
fn known_directives(ctx: NginxContext) -> &'static [&'static str] {
    match ctx {
        NginxContext::Main => &[
            "user", "worker_processes", "worker_rlimit_nofile", "pid", "error_log",
            "include", "daemon", "master_process",
        ],
        NginxContext::Events => &["worker_connections", "use", "multi_accept", "accept_mutex"],
        NginxContext::Http => &[
            "include", "default_type", "sendfile", "tcp_nopush", "tcp_nodelay",
            "keepalive_timeout", "gzip", "gzip_types", "gzip_min_length",
            "client_max_body_size", "log_format", "access_log", "error_log",
            "proxy_cache_path", "limit_req_zone", "server_tokens", "resolver",
            "map_hash_bucket_size", "types_hash_max_size", "charset",
        ],
        NginxContext::Server => &[
            "listen", "server_name", "root", "index", "access_log", "error_log",
            "ssl_certificate", "ssl_certificate_key", "ssl_protocols", "ssl_ciphers",
            "return", "rewrite", "client_max_body_size", "error_page", "try_files",
            "charset", "include",
        ],
        NginxContext::Location => &[
            "proxy_pass", "proxy_set_header", "proxy_connect_timeout",
            "proxy_read_timeout", "proxy_send_timeout", "proxy_buffering",
            "proxy_buffers", "proxy_cache", "proxy_http_version", "try_files",
            "root", "alias", "index", "return", "rewrite", "client_max_body_size",
            "limit_req", "add_header", "expires", "autoindex", "include",
        ],
        NginxContext::Upstream => &[
            "server", "least_conn", "ip_hash", "hash", "keepalive", "zone",
        ],
        NginxContext::Stream | NginxContext::Map | NginxContext::If | NginxContext::Types | NginxContext::Unknown => &[],
    }
}

/// Directive chỉ hợp lệ ở đúng một số context nhất định, dù tên trùng phổ biến.
/// Dùng để bắt lỗi kiểu "proxy_pass đặt thẳng trong http {}" (phải nằm trong location).
fn directive_requires_context(name: &str) -> Option<&'static [NginxContext]> {
    match name {
        "proxy_pass" => Some(&[NginxContext::Location, NginxContext::If]),
        "worker_processes" => Some(&[NginxContext::Main]),
        "worker_connections" => Some(&[NginxContext::Events]),
        "server_name" => Some(&[NginxContext::Server]),
        _ => None,
    }
}

pub fn validate(tree: &[NginxNode]) -> Vec<NginxIssue> {
    let mut issues = Vec::new();
    walk(tree, NginxContext::Main, &mut issues);
    issues
}

fn walk(nodes: &[NginxNode], ctx: NginxContext, issues: &mut Vec<NginxIssue>) {
    for node in nodes {
        match node {
            NginxNode::Block { name, children, line, .. } => {
                let allowed_blocks = allowed_child_blocks(ctx);
                let is_known_block_anywhere = matches!(
                    name.as_str(),
                    "http" | "events" | "server" | "location" | "upstream" | "stream"
                        | "map" | "geo" | "types" | "if" | "mail" | "limit_except"
                );

                if is_known_block_anywhere && !allowed_blocks.contains(&name.as_str()) {
                    issues.push(NginxIssue {
                        severity: IssueSeverity::Error,
                        line: *line,
                        message: format!(
                            "\"{}\" directive is not allowed inside {} context",
                            name,
                            ctx.label()
                        ),
                        hint: expected_path_hint(name),
                    });
                }

                let child_ctx = ctx.child_context(name);
                walk(children, child_ctx, issues);
            }
            NginxNode::Directive { name, line, .. } => {
                if let Some(required_contexts) = directive_requires_context(name) {
                    if !required_contexts.contains(&ctx) {
                        issues.push(NginxIssue {
                            severity: IssueSeverity::Error,
                            line: *line,
                            message: format!(
                                "\"{}\" is not allowed directly inside {} context",
                                name,
                                ctx.label()
                            ),
                            hint: expected_path_hint(name),
                        });
                        continue;
                    }
                }

                let known = known_directives(ctx);
                if !known.is_empty() && !known.contains(&name.as_str()) {
                    issues.push(NginxIssue {
                        severity: IssueSeverity::Warning,
                        line: *line,
                        message: format!(
                            "Directive \"{}\" không nằm trong danh sách directive phổ biến của context {} — kiểm tra lại chính tả hoặc module liên quan",
                            name,
                            ctx.label()
                        ),
                        hint: None,
                    });
                }
            }
            NginxNode::Comment { .. } => {}
        }
    }
}

fn expected_path_hint(directive_or_block: &str) -> Option<String> {
    match directive_or_block {
        "proxy_pass" => Some("http\n └── server\n      └── location\n           └── proxy_pass".into()),
        "server" => Some("http\n └── server   (hoặc stream └── server)".into()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nginx::parser::parse;

    #[test]
    fn flags_server_inside_events() {
        let cfg = "events { server { } }";
        let result = parse(cfg);
        let issues = validate(&result.tree);
        assert!(issues.iter().any(|i| i.message.contains("not allowed inside events")));
    }

    #[test]
    fn flags_proxy_pass_directly_in_http() {
        let cfg = "http { proxy_pass http://backend; }";
        let result = parse(cfg);
        let issues = validate(&result.tree);
        assert!(issues
            .iter()
            .any(|i| i.message.contains("proxy_pass") && i.message.contains("not allowed directly")));
    }

    #[test]
    fn allows_valid_reverse_proxy() {
        let cfg = r#"
            http {
                server {
                    listen 80;
                    location /api {
                        proxy_pass http://backend;
                    }
                }
            }
        "#;
        let result = parse(cfg);
        let issues = validate(&result.tree);
        assert!(issues.iter().all(|i| i.severity == super::IssueSeverity::Warning));
    }
}