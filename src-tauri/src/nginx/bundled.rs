use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use super::process::{run_binary_dump, run_binary_test, NginxNativeCheckResult};

/// Tên thư mục nginx portable đã bundle sẵn trong resources của app.
/// Đặt bản nginx Windows portable (tải .zip từ https://nginx.org/en/download.html,
/// KHÔNG dùng bản installer) vào `src-tauri/binaries/nginx-windows/`, giữ nguyên
/// cấu trúc gốc sau khi giải nén:
///
///   src-tauri/binaries/nginx-windows/
///     nginx.exe
///     conf/
///       nginx.conf        <- config mặc định, dùng làm template ban đầu
///       mime.types
///     html/
///     logs/                <- thư mục rỗng; git không track thư mục rỗng,
///                              thêm file .gitkeep nếu cần commit
///     temp/                <- thư mục rỗng, nginx cần để chạy
///
/// Giấy phép nginx (2-clause BSD) cho phép redistribute tự do kèm theo file
/// LICENSE gốc — nên copy luôn file đó vào thư mục trên cho đúng luật.
const BUNDLED_DIR_NAME: &str = "nginx-windows";

/// Thư mục ghi được, nơi bản nginx bundled sẽ thực sự chạy. Không chạy trực
/// tiếp từ resource dir vì thư mục cài đặt app (thường trong Program Files)
/// có thể read-only với user thường, trong khi nginx cần ghi logs/ và temp/.
fn writable_nginx_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Không lấy được app data dir: {}", e))?;
    Ok(data_dir.join("nginx-runtime"))
}

fn bundled_resource_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Không lấy được resource dir: {}", e))?;
    Ok(resource_dir.join("binaries").join(BUNDLED_DIR_NAME))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            // Giữ nguyên nginx.conf người dùng đã tự sửa ở lần chạy trước,
            // không ghi đè mỗi khi app khởi động lại hoặc update.
            if dst_path.exists() && entry.file_name() == "nginx.conf" {
                continue;
            }
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// Copy nginx bundled từ resource (read-only, nằm trong thư mục cài app) sang
/// app data dir (writable) nếu chưa có, rồi trả về đường dẫn nginx.exe có thể
/// chạy được. Idempotent — gọi lại nhiều lần an toàn, chỉ copy ở lần đầu.
pub fn ensure_bundled_nginx(app: &AppHandle) -> Result<PathBuf, String> {
    let target_dir = writable_nginx_dir(app)?;
    let exe_path = target_dir.join("nginx.exe");

    if !exe_path.exists() {
        let source_dir = bundled_resource_dir(app)?;
        if !source_dir.exists() {
            return Err(format!(
                "Không tìm thấy nginx bundled tại {:?} — kiểm tra lại mục \"bundle.resources\" trong tauri.conf.json và đảm bảo đã đặt file vào src-tauri/binaries/{}/",
                source_dir, BUNDLED_DIR_NAME
            ));
        }
        copy_dir_recursive(&source_dir, &target_dir)
            .map_err(|e| format!("Copy nginx bundled thất bại: {}", e))?;

        // Một số bản zip nginx không có sẵn logs/temp vì chúng rỗng.
        fs::create_dir_all(target_dir.join("logs")).ok();
        fs::create_dir_all(target_dir.join("temp")).ok();
    }

    Ok(exe_path)
}

pub fn bundled_test(
    app: &AppHandle,
    config_path: Option<&str>,
) -> Result<NginxNativeCheckResult, String> {
    let exe = ensure_bundled_nginx(app)?;
    let prefix = exe
        .parent()
        .ok_or_else(|| "Không xác định được thư mục chứa nginx.exe".to_string())?
        .to_path_buf();
    run_binary_test(&exe, &prefix, config_path)
}

pub fn bundled_dump(
    app: &AppHandle,
    config_path: Option<&str>,
) -> Result<NginxNativeCheckResult, String> {
    let exe = ensure_bundled_nginx(app)?;
    let prefix = exe
        .parent()
        .ok_or_else(|| "Không xác định được thư mục chứa nginx.exe".to_string())?
        .to_path_buf();
    run_binary_dump(&exe, &prefix, config_path)
}