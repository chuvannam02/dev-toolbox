use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct NginxNativeCheckResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

/// Hàm lõi dùng chung: chạy một binary nginx cụ thể (system hoặc bundled).
/// `prefix` tương ứng flag `-p <dir>` của nginx — bắt buộc khi chạy bản bundled,
/// vì nginx mặc định tìm `conf/nginx.conf`, `logs/`, `temp/` tương đối theo prefix
/// (mặc định là thư mục cài đặt lúc build, không phải nơi ta copy binary tới).
fn run_binary(
    exe: &Path,
    args: &[&str],
    prefix: Option<&Path>,
) -> Result<NginxNativeCheckResult, String> {
    let mut cmd = Command::new(exe);
    cmd.args(args);
    if let Some(p) = prefix {
        cmd.arg("-p").arg(p);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Không chạy được '{}': {}", exe.display(), e))?;

    Ok(NginxNativeCheckResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

/// Chạy `nginx -t` từ PATH hệ thống. Trả lỗi rõ ràng nếu máy không cài nginx,
/// để frontend tự động fallback sang bundled nginx hoặc static validator.
pub fn run_native_test(config_path: Option<&str>) -> Result<NginxNativeCheckResult, String> {
    let mut args = vec!["-t"];
    if let Some(p) = config_path {
        args.push("-c");
        args.push(p);
    }
    run_binary(Path::new("nginx"), &args, None)
}

/// Chạy `nginx -T` từ PATH hệ thống — test + dump toàn bộ config đã resolve include.
pub fn run_native_dump(config_path: Option<&str>) -> Result<NginxNativeCheckResult, String> {
    let mut args = vec!["-T"];
    if let Some(p) = config_path {
        args.push("-c");
        args.push(p);
    }
    run_binary(Path::new("nginx"), &args, None)
}

/// Chạy `-t` với một binary + prefix cụ thể (dùng cho nginx bundled sẵn trong app).
pub fn run_binary_test(
    exe: &Path,
    prefix: &Path,
    config_path: Option<&str>,
) -> Result<NginxNativeCheckResult, String> {
    let mut args = vec!["-t"];
    if let Some(p) = config_path {
        args.push("-c");
        args.push(p);
    }
    run_binary(exe, &args, Some(prefix))
}

/// Chạy `-T` với một binary + prefix cụ thể (dùng cho nginx bundled sẵn trong app).
pub fn run_binary_dump(
    exe: &Path,
    prefix: &Path,
    config_path: Option<&str>,
) -> Result<NginxNativeCheckResult, String> {
    let mut args = vec!["-T"];
    if let Some(p) = config_path {
        args.push("-c");
        args.push(p);
    }
    run_binary(exe, &args, Some(prefix))
}