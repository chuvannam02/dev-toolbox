pub mod commands;
pub mod models;
pub mod parser;
pub mod process;
pub mod validator;
pub mod bundled;

// Chưa triển khai ở phase này — để sẵn chỗ cho các phần sau của Nginx Studio:
// pub mod resolver;    // resolve include *.conf, đệ quy (Phase 2: Config Tree đầy đủ)
// pub mod diagnostics; // DNS/TCP/HTTP test cho 502/504 troubleshooting (Phase 6)
// pub mod routing;     // Request Routing Simulator (Phase 6)