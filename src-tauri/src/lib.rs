use keyring::Entry;
use reqwest::Client;
use rusqlite::{params, Connection};
use rust_xlsxwriter::Workbook;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::sleep;

mod fake_data;
mod database;
mod notebook;

#[tauri::command]
async fn trigger_jenkins_job(
    app: AppHandle,
    url: String,
    user: String,
    token: String,
    job_name: String,
    params: HashMap<String, String>,
) -> Result<(), String> {
    let client = Client::new();

    // 1. Xác định URL trigger (Có Parameter hoặc không)
    let trigger_url = if params.is_empty() {
        format!("{}/job/{}/build", url.trim_end_matches('/'), job_name)
    } else {
        format!(
            "{}/job/{}/buildWithParameters",
            url.trim_end_matches('/'),
            job_name
        )
    };

    // 2. Gửi Request bằng API Token
    let res = client
        .post(&trigger_url)
        .basic_auth(&user, Some(&token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!(
            "❌ Lỗi Trigger (HTTP {}): Kiểm tra lại Token hoặc Tên Job.",
            res.status()
        ));
    }

    let _ = app.emit(
        "jenkins-log",
        format!(
            "[Dev Toolbox] 🚀 Đã gửi lệnh trigger Job: {}. Đang đợi Jenkins xử lý...\n",
            job_name
        ),
    );

    // 3. Khởi tạo Background Task để lấy Log Realtime
    tokio::spawn(async move {
        sleep(Duration::from_secs(4)).await; // Đợi Jenkins bốc Job từ Queue lên Build
        let mut start_byte = 0;

        loop {
            let log_url = format!(
                "{}/job/{}/lastBuild/logText/api/json?start={}",
                url.trim_end_matches('/'),
                job_name,
                start_byte
            );

            if let Ok(response) = client
                .get(&log_url)
                .basic_auth(&user, Some(&token))
                .send()
                .await
            {
                // Jenkins trả về Header 'X-More-Data' nếu Job vẫn đang chạy
                let more_data = response.headers().get("X-More-Data").is_some();
                let new_size = response
                    .headers()
                    .get("X-Text-Size")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<usize>().ok())
                    .unwrap_or(start_byte);

                if let Ok(text) = response.text().await {
                    if !text.is_empty() {
                        let _ = app.emit("jenkins-log", text);
                    }
                }

                start_byte = new_size;

                if !more_data {
                    let _ = app.emit("jenkins-log", "\n[Dev Toolbox] ✅ Pipeline hoàn tất.\n");
                    break;
                }
            } else {
                break; // Mất kết nối
            }
            sleep(Duration::from_millis(1500)).await; // Polling mỗi 1.5 giây
        }
    });

    Ok(())
}

// ĐỪNG QUÊN ĐĂNG KÝ HÀM NÀY VÀO invoke_handler TRONG fn run()
// .invoke_handler(tauri::generate_handler![ ..., trigger_jenkins_job ])

// Struct trả kết quả phân tích về cho React
#[derive(Serialize)]
pub struct LogAnalysis {
    pub status: String, // SUCCESS, FAILED, UNKNOWN
    pub error_lines: Vec<String>,
    pub failed_tests: Vec<String>,
    pub suggestion: String,
}

#[tauri::command]
fn analyze_build_log(log_text: String) -> LogAnalysis {
    let mut error_lines = Vec::new();
    let mut failed_tests = Vec::new();
    let mut status = "UNKNOWN".to_string();

    let lines: Vec<&str> = log_text.lines().collect();
    let mut capture_test = false;

    for line in lines {
        let lower = line.to_lowercase();

        // 1. Nhận diện trạng thái tổng thể
        if lower.contains("finished: success") {
            status = "SUCCESS".to_string();
        }
        if lower.contains("finished: failure") || lower.contains("build failure") {
            status = "FAILED".to_string();
        }

        // 2. Bắt lỗi Compile, NPM ERR!, hoặc Docker Fatal
        if line.contains("[ERROR]") || lower.contains("npm err!") || lower.contains("fatal:") {
            // Lọc bớt các dòng rác
            if !line.contains("To see the full stack trace") && !line.contains("Re-run Maven using")
            {
                error_lines.push(line.trim().to_string());
            }
        }

        // 3. Bắt lỗi Unit Test (Đặc trị cho Java Maven/Surefire)
        if line.contains("<<< FAILURE!") || line.contains("<<< ERROR!") {
            failed_tests.push(line.trim().to_string());
        }

        // Block bóc tách danh sách Test Fail
        if line.contains("Failed tests:") {
            capture_test = true;
            continue;
        }
        if capture_test {
            if line.trim().is_empty() || line.contains("Tests run:") || line.contains("[INFO]") {
                capture_test = false;
            } else {
                failed_tests.push(line.trim().to_string());
            }
        }
    }

    // 4. Sinh gợi ý tự động (Suggestion)
    let suggestion = if !failed_tests.is_empty() {
        "💡 Phát hiện lỗi Unit Test. Vui lòng kiểm tra lại các test case bị fail.".to_string()
    } else if !error_lines.is_empty() {
        "💡 Có lỗi biên dịch (Compile Error) hoặc cấu hình. Kiểm tra các dòng [ERROR].".to_string()
    } else if status == "SUCCESS" {
        "✅ Mọi thứ hoạt động trơn tru!".to_string()
    } else {
        "⚠️ Không tìm thấy lỗi rõ ràng, nhưng Pipeline có thể đã bị ngắt.".to_string()
    };

    LogAnalysis {
        status,
        error_lines: error_lines.into_iter().take(15).collect(), // Lấy tối đa 15 lỗi đầu tiên để UI không bị ngợp
        failed_tests,
        suggestion,
    }
}

// ĐỪNG QUÊN ĐĂNG KÝ HÀM: .invoke_handler(tauri::generate_handler![..., analyze_build_log])

// --- CẤU HÌNH SSH ---
#[derive(Deserialize)]
pub struct SshConfig {
    pub enabled: bool,
    pub host: String,
    pub user: String,
    pub port: String,
    pub key_path: String,
}

#[derive(Serialize, Deserialize)]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub status: String,
    pub image: String,
}

// 1. LẤY DANH SÁCH CONTAINER (Hỗ trợ Local & SSH)
#[tauri::command]
fn get_docker_containers(ssh: SshConfig) -> Result<Vec<DockerContainer>, String> {
    // Nếu dùng SSH thì gọi lệnh `ssh`, nếu không thì gọi `docker` trực tiếp
    let mut cmd = Command::new(if ssh.enabled { "ssh" } else { "docker" });

    if ssh.enabled {
        cmd.arg("-i").arg(&ssh.key_path);
        cmd.arg("-p").arg(&ssh.port);
        cmd.arg("-o").arg("StrictHostKeyChecking=no"); // Bỏ qua câu hỏi yes/no của SSH
        cmd.arg(format!("{}@{}", ssh.user, ssh.host));
        cmd.arg("docker"); // Lệnh chạy trên remote
    }

    cmd.args([
        "ps",
        "-a",
        "--format",
        "{{.ID}}|{{.Names}}|{{.Status}}|{{.Image}}",
    ]);

    let output = cmd
        .output()
        .map_err(|e| format!("Lỗi thực thi lệnh: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut containers = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() == 4 {
            containers.push(DockerContainer {
                id: parts[0].to_string(),
                name: parts[1].to_string(),
                status: parts[2].to_string(),
                image: parts[3].to_string(),
            });
        }
    }
    Ok(containers)
}

// 2. LẤY LOGS (Hỗ trợ Local & SSH)
#[tauri::command]
fn get_docker_logs(
    container_id: String,
    tail: String,
    grep: String,
    ssh: SshConfig,
) -> Result<String, String> {
    let mut cmd = Command::new(if ssh.enabled { "ssh" } else { "docker" });

    if ssh.enabled {
        cmd.arg("-i").arg(&ssh.key_path);
        cmd.arg("-p").arg(&ssh.port);
        cmd.arg("-o").arg("StrictHostKeyChecking=no");
        cmd.arg(format!("{}@{}", ssh.user, ssh.host));
        cmd.arg("docker");
    }

    let mut args = vec!["logs".to_string()];
    if tail != "all" {
        args.push(format!("--tail={}", tail));
    }
    args.push(container_id);

    cmd.args(&args);

    let output = cmd.output().map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}{}", stdout, stderr);

    if !grep.trim().is_empty() {
        let term = grep.to_lowercase();
        let filtered: Vec<&str> = combined
            .lines()
            .filter(|line| line.to_lowercase().contains(&term))
            .collect();
        return Ok(filtered.join("\n"));
    }

    Ok(combined)
}

// --- THÊM STRUCT CHO LAUNCHER ---
#[derive(Serialize, Deserialize, Clone)]
pub struct AppItem {
    pub id: Option<i32>,
    pub name: String,
    pub path: String,
    pub icon: String, // Dùng Emoji cho nhanh, vd: 🚀, 📁, 🦊
}

// 2. CÁC COMMANDS CHO LAUNCHER
#[tauri::command]
fn get_launcher_apps(state: tauri::State<AppState>) -> Result<Vec<AppItem>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, path, icon FROM launcher_apps")
        .unwrap();
    let iter = stmt
        .query_map([], |row| {
            Ok(AppItem {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                path: row.get(2)?,
                icon: row.get(3)?,
            })
        })
        .unwrap();
    Ok(iter.filter_map(|i| i.ok()).collect())
}

#[tauri::command]
fn add_launcher_app(state: tauri::State<AppState>, item: AppItem) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO launcher_apps (name, path, icon) VALUES (?1, ?2, ?3)",
        rusqlite::params![item.name, item.path, item.icon],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn launch_items(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        // Lệnh 'start' của Windows tự động mở file/folder/ứng dụng bằng chương trình mặc định
        Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Lỗi khi mở {}: {}", path, e))?;
    }
    Ok(())
}

// 3. COMMAND CHO ANSIBLE RUNNER
#[tauri::command]
fn execute_ansible(command: String) -> Result<String, String> {
    // Trên Windows, dev thường chạy Ansible qua WSL (Windows Subsystem for Linux)
    // Nếu bạn cài Ansible trực tiếp trên Windows (Python), bạn có thể bỏ "wsl" đi.
    let output = Command::new("wsl")
        .arg("-e")
        .arg("bash")
        .arg("-c")
        .arg(&command)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout) // Trả về Log thành công
    } else {
        Err(format!("LỖI THỰC THI:\n{}\n{}", stderr, stdout)) // Trả về Log lỗi
    }
}

// Nhớ đăng ký các hàm mới vào invoke_handler trong hàm run()
// .invoke_handler(tauri::generate_handler![..., get_launcher_apps, add_launcher_app, launch_items, execute_ansible])

struct AppState {
    db: Mutex<Connection>,
}

#[derive(Serialize, Deserialize)]
pub struct Credential {
    pub id: i32,
    pub name: String,
    pub username: String,
}

// Struct trả về cho UI sau khi nhận dạng code
#[derive(Serialize)]
pub struct FormatResult {
    format_type: String, // "json", "xml", "sql", "curl", "unknown"
    is_valid: bool,
    formatted_text: String,
    error_msg: Option<String>,
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

fn format_curl_for_windows_cmd(input: &str) -> Result<String, String> {
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

#[cfg(test)]
mod formatter_tests {
    use super::format_curl_for_windows_cmd;

    #[test]
    fn converts_bash_curl_json_to_windows_cmd() {
        let formatted = format_curl_for_windows_cmd(
            "curl -X POST -H 'Content-Type: application/json' -d '{\"name\":\"Lan\"}' https://api.example.com/users",
        )
        .expect("valid curl command");

        assert!(formatted.starts_with("curl.exe -X POST"));
        assert!(!formatted.contains('\n'));
        assert!(formatted.contains("\"Content-Type: application/json\""));
        assert!(formatted.contains("{\\\"name\\\":\\\"Lan\\\"}"));
    }

    #[test]
    fn rejects_an_unclosed_quote() {
        assert!(format_curl_for_windows_cmd("curl -H 'Authorization: Bearer token").is_err());
    }
}

// 1. CẬP NHẬT HÀM init_db (Thêm bảng launcher)
fn init_db(db_path: std::path::PathBuf) -> rusqlite::Result<rusqlite::Connection> {
    let conn = rusqlite::Connection::open(db_path)?;
    // Bảng Vault (Cũ)
    conn.execute("CREATE TABLE IF NOT EXISTS credentials (id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL)", [])?;
    // Bảng Launcher (Mới)
    conn.execute("CREATE TABLE IF NOT EXISTS launcher_apps (id INTEGER PRIMARY KEY, name TEXT, path TEXT, icon TEXT)", [])?;
    Ok(conn)
}

// --- COMMANDS CỦA PHASE 1 (Giữ nguyên) ---
#[tauri::command]
fn save_credential(
    state: tauri::State<AppState>,
    name: String,
    username: String,
    password: String,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO credentials (name, username) VALUES (?1, ?2)",
        params![&name, &username],
    )
    .map_err(|e| e.to_string())?;
    let entry_name = format!("dev-toolbox-{}", name);
    let entry = Entry::new(&entry_name, &username).map_err(|e| e.to_string())?;
    entry.set_password(&password).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_credentials(state: tauri::State<AppState>) -> Result<Vec<Credential>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, username FROM credentials")
        .map_err(|e| e.to_string())?;
    let creds_iter = stmt
        .query_map([], |row| {
            Ok(Credential {
                id: row.get(0)?,
                name: row.get(1)?,
                username: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for cred in creds_iter {
        if let Ok(c) = cred {
            result.push(c);
        }
    }
    Ok(result)
}

// --- COMMANDS MỚI CHO PHASE 2: FORMAT CODE ---
#[tauri::command]
fn detect_and_format(raw_text: String) -> FormatResult {
    let text_trim = raw_text.trim();
    if text_trim.is_empty() {
        return FormatResult {
            format_type: "unknown".into(),
            is_valid: false,
            formatted_text: "".into(),
            error_msg: None,
        };
    }

    // 0. Convert common Bash/Postman cURL exports into a command that CMD can paste and run.
    if matches!(
        text_trim
            .split_whitespace()
            .next()
            .map(|part| part.to_ascii_lowercase())
            .as_deref(),
        Some("curl") | Some("curl.exe")
    ) {
        return match format_curl_for_windows_cmd(text_trim) {
            Ok(formatted) => FormatResult {
                format_type: "curl".into(),
                is_valid: true,
                formatted_text: formatted,
                error_msg: None,
            },
            Err(error) => FormatResult {
                format_type: "curl".into(),
                is_valid: false,
                formatted_text: raw_text,
                error_msg: Some(error),
            },
        };
    }

    // 1. Thử parse JSON
    if text_trim.starts_with('{') || text_trim.starts_with('[') {
        match serde_json::from_str::<serde_json::Value>(text_trim) {
            Ok(parsed) => {
                return FormatResult {
                    format_type: "json".into(),
                    is_valid: true,
                    formatted_text: serde_json::to_string_pretty(&parsed).unwrap(),
                    error_msg: None,
                }
            }
            Err(e) => {
                return FormatResult {
                    format_type: "json".into(),
                    is_valid: false,
                    formatted_text: raw_text,
                    error_msg: Some(format!("Lỗi cú pháp JSON: {}", e)),
                }
            }
        }
    }

    // 2. Thử parse XML
    if text_trim.starts_with('<') {
        let mut reader = quick_xml::Reader::from_str(text_trim);
        if reader.read_event().is_ok() {
            return FormatResult {
                format_type: "xml".into(),
                is_valid: true,
                formatted_text: raw_text, // Rust format XML hơi phức tạp, ta nhường việc highlight cho Monaco
                error_msg: None,
            };
        }
    }

    // 3. Thử format SQL (nếu chứa các keyword SQL cơ bản)
    let upper = text_trim.to_uppercase();
    if upper.starts_with("SELECT")
        || upper.starts_with("INSERT")
        || upper.starts_with("UPDATE")
        || upper.starts_with("DELETE")
        || upper.starts_with("CREATE")
    {
        let formatted = sqlformat::format(
            text_trim,
            &sqlformat::QueryParams::None,
            &sqlformat::FormatOptions::default(),
        );
        return FormatResult {
            format_type: "sql".into(),
            is_valid: true,
            formatted_text: formatted,
            error_msg: None,
        };
    }

    // Fallback
    FormatResult {
        format_type: "unknown".into(),
        is_valid: true,
        formatted_text: raw_text,
        error_msg: Some(
            "Không nhận dạng được định dạng đặc biệt, hiển thị như văn bản thường.".into(),
        ),
    }
}

#[tauri::command]
fn check_grammar(text: String) -> Result<Vec<String>, String> {
    let mut suggestions = Vec::new();
    let text_lower = text.to_lowercase();

    // 1. Kiểm tra dấu câu & khoảng trắng
    if text.contains("  ") {
        suggestions.push("⚠️ Dấu câu: Phát hiện khoảng trắng kép.".into());
    }
    if text.contains(" ,") || text.contains(" .") {
        suggestions
            .push("⚠️ Dấu câu: Không được có khoảng trắng trước dấu phẩy hoặc dấu chấm.".into());
    }

    // 2. Kiểm tra lỗi sai kinh điển của Dev khi viết Email tiếng Anh
    if text_lower.contains("please to inform") {
        suggestions
            .push("💡 Ngữ pháp: Hãy đổi 'please to inform' thành 'pleased to inform'.".into());
    }
    if text_lower.contains("looking forward to hear") {
        suggestions
            .push("💡 Ngữ pháp: Cấu trúc đúng là 'looking forward to hearing' (V-ing).".into());
    }
    if text_lower.contains("i am agree") {
        suggestions.push("💡 Ngữ pháp: Đổi 'I am agree' thành 'I agree'.".into());
    }
    if text_lower.contains("advices") || text_lower.contains("informations") {
        suggestions.push(
            "💡 Từ vựng: 'Advice' và 'Information' là danh từ không đếm được, không có 's'.".into(),
        );
    }

    if suggestions.is_empty() {
        suggestions.push("✅ Tuyệt vời! Không phát hiện lỗi ngữ pháp cơ bản nào.".into());
    }

    Ok(suggestions)
}

// LƯU Ý: Nhớ đăng ký hàm vào invoke_handler
// .invoke_handler(tauri::generate_handler![ ..., check_grammar ])

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init()) // <--- Thêm dòng này
        // XỬ LÝ LƯU DATABASE VÀO APPDATA CỦA HỆ ĐIỀU HÀNH
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Không lấy được thư mục AppData");
            // Tự động tạo thư mục nếu chưa có (vd: C:\Users\Nam\AppData\Roaming\com.dev-toolbox.app\)
            std::fs::create_dir_all(&app_data_dir).expect("Không thể tạo thư mục AppData");

            let db_path = app_data_dir.join("toolbox.db");
            println!("Đang lưu Database tại: {:?}", db_path); // Mở console sẽ thấy đường dẫn này

            let db = init_db(db_path).expect("Khởi tạo SQLite thất bại!");
            app.manage(AppState { db: Mutex::new(db) });
            Ok(())
        })
        // .invoke_handler(tauri::generate_handler![save_credential, get_credentials, detect_and_format])
        .invoke_handler(tauri::generate_handler![
            save_credential,
            get_credentials,
            detect_and_format,
            json_to_excel,
            csv_to_excel,
            get_launcher_apps,
            add_launcher_app,
            launch_items,
            execute_ansible,
            get_docker_containers,
            get_docker_logs,
            check_grammar,
            analyze_build_log,
            trigger_jenkins_job,
            notebook::ensure_kernel_started,
            fake_data::generate_fake_data,
            fake_data::generate_fake_data_from_schema,
            database::test_database_connection,
            database::list_database_tables,
            database::describe_database_table,
            notebook::execute_cell,
            notebook::restart_kernel,
        ])
        .run(tauri::generate_context!())
        .expect("Lỗi khi chạy ứng dụng Tauri");
}

// Thêm hàm này vào trước hàm run()
#[tauri::command]
fn csv_to_excel(csv_text: String) -> Result<String, String> {
    let mut rdr = csv::ReaderBuilder::new().from_reader(csv_text.as_bytes());
    let mut workbook = rust_xlsxwriter::Workbook::new();
    let worksheet = workbook.add_worksheet();

    // Đọc và ghi Headers (Dòng 0)
    let headers = rdr.headers().map_err(|e| e.to_string())?.clone();
    for (col, header) in headers.iter().enumerate() {
        worksheet
            .write_string(0, col as u16, header)
            .map_err(|e| e.to_string())?;
    }

    // Đọc và ghi Dữ liệu (Từ dòng 1)
    for (row, result) in rdr.records().enumerate() {
        let record = result.map_err(|e| e.to_string())?;
        for (col, field) in record.iter().enumerate() {
            worksheet
                .write_string((row + 1) as u32, col as u16, field)
                .map_err(|e| e.to_string())?;
        }
    }

    // Lưu file
    let desktop_dir = dirs::desktop_dir().unwrap_or_else(|| std::env::temp_dir());
    let file_path = desktop_dir.join(format!(
        "CSV_Export_{}.xlsx",
        chrono::Local::now().format("%Y%m%d_%H%M%S")
    ));

    workbook
        .save(&file_path)
        .map_err(|e| format!("Lỗi lưu file: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn json_to_excel(json_text: String, array_path: String) -> Result<String, String> {
    // 1. Parse JSON
    let parsed: Value =
        serde_json::from_str(&json_text).map_err(|e| format!("JSON không hợp lệ: {}", e))?;

    // 2. Duyệt qua các node dựa trên array_path (vd: "data.items")
    let mut current_node = &parsed;
    if !array_path.trim().is_empty() {
        for key in array_path.split('.') {
            current_node = current_node
                .get(key)
                .ok_or_else(|| format!("Không tìm thấy trường '{}' trong JSON", key))?;
        }
    }

    // 3. Ép kiểu về Array
    let arr = current_node.as_array().ok_or_else(|| {
        "Dữ liệu tại path được chỉ định không phải là một mảng (Array) []".to_string()
    })?;

    if arr.is_empty() {
        return Err("Mảng JSON trống, không có dữ liệu để xuất".to_string());
    }

    // 4. Lấy danh sách Headers động (Quét tất cả các key xuất hiện trong các object)
    let mut headers: Vec<String> = Vec::new();
    for item in arr {
        if let Some(obj) = item.as_object() {
            for key in obj.keys() {
                if !headers.contains(key) {
                    headers.push(key.clone());
                }
            }
        }
    }

    // 5. Tạo file Excel
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();

    // Ghi Headers (Dòng 0)
    for (col, header) in headers.iter().enumerate() {
        worksheet
            .write_string(0, col as u16, header)
            .map_err(|e| e.to_string())?;
    }

    // Ghi Dữ liệu (Từ dòng 1)
    for (row, item) in arr.iter().enumerate() {
        if let Some(obj) = item.as_object() {
            for (col, header) in headers.iter().enumerate() {
                if let Some(val) = obj.get(header) {
                    // Xử lý loại dữ liệu
                    let val_str = match val {
                        Value::String(s) => s.clone(),
                        Value::Null => "".to_string(),
                        Value::Object(_) | Value::Array(_) => {
                            serde_json::to_string(val).unwrap_or_default()
                        }
                        other => other.to_string(),
                    };
                    worksheet
                        .write_string((row + 1) as u32, col as u16, &val_str)
                        .map_err(|e| e.to_string())?;
                }
            }
        }
    }

    // 6. Lưu ra Desktop của người dùng
    let desktop_dir = dirs::desktop_dir().unwrap_or_else(|| std::env::temp_dir());
    let file_path = desktop_dir.join(format!(
        "Export_{}.xlsx",
        chrono::Local::now().format("%Y%m%d_%H%M%S")
    ));

    workbook
        .save(&file_path)
        .map_err(|e| format!("Lỗi lưu file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

// Nhớ đăng ký command vào invoke_handler trong hàm run()
// .invoke_handler(tauri::generate_handler![save_credential, get_credentials, detect_and_format, json_to_excel])
