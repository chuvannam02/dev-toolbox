use crate::AppState;
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use chrono::{Datelike, Local, Timelike, Weekday};
use lettre::{Message, SmtpTransport, Transport};
use lettre::transport::smtp::authentication::Credentials;

const SECRET_SERVICE: &str = "dev-toolbox-jira";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraSettings {
    pub base_url: String,
    pub email: String,
    pub workday_start: u8,
    pub workday_end: u8,
    pub monday_to_thursday_hours: f64,
    pub friday_hours: f64,
    pub check_hour: u8,
    #[serde(default)]
    pub check_minute: u8,
    #[serde(default)]
    pub schedule_enabled: bool,
    #[serde(default = "default_schedule_frequency")]
    pub schedule_frequency: String,
    #[serde(default = "default_schedule_day")]
    pub schedule_day: u8,
    #[serde(default = "default_schedule_month")]
    pub schedule_month: u8,
    pub max_missed_checks: u8,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_username: String,
    pub smtp_from: String,
    pub notification_email: String,
    pub smtp_tls: bool,
    pub has_jira_token: bool,
    pub has_smtp_password: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveJiraSettings {
    #[serde(flatten)]
    pub settings: JiraSettings,
    pub jira_token: Option<String>,
    pub smtp_password: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraIssue {
    pub key: String,
    pub summary: String,
    pub status: String,
    pub issue_type: String,
    pub updated: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraWorklog {
    pub date: String,
    pub issue_key: String,
    pub summary: String,
    pub seconds: i64,
    pub comment: String,
    pub started: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorklogCheckResult { pub date: String, pub logged_seconds: i64, pub expected_seconds: i64, pub sufficient: bool }

fn default_schedule_frequency() -> String { "daily".into() }
fn default_schedule_day() -> u8 { 1 }
fn default_schedule_month() -> u8 { 1 }

fn entry(name: &str) -> Result<Entry, String> {
    Entry::new(SECRET_SERVICE, name).map_err(|e| e.to_string())
}

fn normal_url(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}

fn public_settings(mut settings: JiraSettings) -> JiraSettings {
    settings.has_jira_token = entry("api-token").and_then(|x| x.get_password().map_err(|e| e.to_string())).is_ok();
    settings.has_smtp_password = entry("smtp-password").and_then(|x| x.get_password().map_err(|e| e.to_string())).is_ok();
    settings
}

#[tauri::command]
pub fn get_jira_settings(state: State<AppState>) -> Result<Option<JiraSettings>, String> {
    let db = state.db.lock().map_err(|_| "Không thể truy cập cấu hình Jira")?;
    let raw: Option<String> = db.query_row("SELECT config FROM jira_settings WHERE id = 1", [], |row| row.get(0)).ok();
    raw.map(|value| serde_json::from_str::<JiraSettings>(&value).map(public_settings).map_err(|e| e.to_string())).transpose()
}

#[tauri::command]
pub fn save_jira_settings(state: State<AppState>, input: SaveJiraSettings) -> Result<JiraSettings, String> {
    let mut settings = input.settings;
    settings.base_url = normal_url(&settings.base_url);
    if !settings.base_url.starts_with("https://") || settings.email.trim().is_empty() {
        return Err("Jira URL phải dùng HTTPS và email Atlassian không được để trống.".into());
    }
    if let Some(token) = input.jira_token.filter(|value| !value.trim().is_empty()) {
        entry("api-token")?.set_password(&token).map_err(|e| e.to_string())?;
    }
    if let Some(password) = input.smtp_password.filter(|value| !value.trim().is_empty()) {
        entry("smtp-password")?.set_password(&password).map_err(|e| e.to_string())?;
    }
    settings.has_jira_token = false;
    settings.has_smtp_password = false;
    let raw = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    state.db.lock().map_err(|_| "Không thể lưu cấu hình Jira")?.execute(
        "INSERT INTO jira_settings (id, config) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET config=excluded.config", [raw]
    ).map_err(|e| e.to_string())?;
    Ok(public_settings(settings))
}

fn credentials(settings: &JiraSettings) -> Result<(String, String), String> {
    Ok((settings.email.clone(), entry("api-token")?.get_password().map_err(|_| "Chưa có Jira API token. Hãy lưu token trong Cấu hình Jira.".to_string())?))
}

async fn api(settings: &JiraSettings, path: &str, body: Value) -> Result<Value, String> {
    let (email, token) = credentials(settings)?;
    let response = Client::new().post(format!("{}{}", normal_url(&settings.base_url), path))
        .basic_auth(email, Some(token)).json(&body).send().await.map_err(|e| format!("Không thể kết nối Jira: {e}"))?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() { return Err(format!("Jira trả về HTTP {status}: {text}")); }
    serde_json::from_str(&text).map_err(|e| format!("Jira trả về dữ liệu không hợp lệ: {e}"))
}

fn load_settings(state: &State<AppState>) -> Result<JiraSettings, String> {
    let db = state.db.lock().map_err(|_| "Không thể truy cập cấu hình Jira")?;
    let raw: String = db.query_row("SELECT config FROM jira_settings WHERE id = 1", [], |row| row.get(0))
        .map_err(|_| "Hãy lưu cấu hình Jira trước.".to_string())?;
    serde_json::from_str(&raw).map(public_settings).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_jira_connection(state: State<'_, AppState>) -> Result<String, String> {
    let settings = load_settings(&state)?;
    let (email, token) = credentials(&settings)?;
    let response = Client::new().get(format!("{}/rest/api/3/myself", normal_url(&settings.base_url)))
        .basic_auth(email, Some(token)).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Xác thực Jira thất bại (HTTP {}).", response.status())); }
    let user: Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(user.get("displayName").and_then(Value::as_str).unwrap_or("Jira user").to_string())
}

#[tauri::command]
pub async fn get_jira_issues(state: State<'_, AppState>, from_date: String, to_date: String, open_only: bool) -> Result<Vec<JiraIssue>, String> {
    let settings = load_settings(&state)?;
    let jql = if open_only {
        "assignee = currentUser() AND status in (\"To Do\", \"In Progress\", \"In Review\", Reopened) ORDER BY updated DESC".to_string()
    } else {
        format!("assignee = currentUser() AND updated >= \"{from_date}\" AND updated <= \"{to_date}\" ORDER BY updated DESC")
    };
    let result = api(&settings, "/rest/api/3/search/jql", json!({"jql": jql, "maxResults": 100, "fields": ["summary", "status", "issuetype", "updated"]})).await?;
    Ok(result.get("issues").and_then(Value::as_array).into_iter().flatten().map(|issue| JiraIssue {
        key: issue.get("key").and_then(Value::as_str).unwrap_or_default().to_string(),
        summary: issue.pointer("/fields/summary").and_then(Value::as_str).unwrap_or_default().to_string(),
        status: issue.pointer("/fields/status/name").and_then(Value::as_str).unwrap_or_default().to_string(),
        issue_type: issue.pointer("/fields/issuetype/name").and_then(Value::as_str).unwrap_or_default().to_string(),
        updated: issue.pointer("/fields/updated").and_then(Value::as_str).unwrap_or_default().to_string(),
        url: format!("{}/browse/{}", normal_url(&settings.base_url), issue.get("key").and_then(Value::as_str).unwrap_or_default()),
    }).collect())
}

#[tauri::command]
pub async fn get_jira_worklogs(state: State<'_, AppState>, from_date: String, to_date: String) -> Result<Vec<JiraWorklog>, String> {
    let settings = load_settings(&state)?;
    fetch_worklogs(&settings, &from_date, &to_date).await
}

async fn fetch_worklogs(settings: &JiraSettings, from_date: &str, to_date: &str) -> Result<Vec<JiraWorklog>, String> {
    let jql = format!("worklogAuthor = currentUser() AND worklogDate >= \"{from_date}\" AND worklogDate <= \"{to_date}\" ORDER BY updated DESC");
    let issues = api(&settings, "/rest/api/3/search/jql", json!({"jql": jql, "maxResults": 100, "fields": ["summary"]})).await?;
    let (_, token) = credentials(&settings)?;
    let myself = Client::new().get(format!("{}/rest/api/3/myself", normal_url(&settings.base_url))).basic_auth(&settings.email, Some(&token)).send().await.map_err(|e| e.to_string())?.json::<Value>().await.map_err(|e| e.to_string())?;
    let account_id = myself.get("accountId").and_then(Value::as_str).unwrap_or("");
    let mut output = Vec::new();
    for issue in issues.get("issues").and_then(Value::as_array).into_iter().flatten() {
        let key = issue.get("key").and_then(Value::as_str).unwrap_or("");
        let logs = Client::new().get(format!("{}/rest/api/3/issue/{key}/worklog", normal_url(&settings.base_url))).basic_auth(&settings.email, Some(&token)).send().await.map_err(|e| e.to_string())?.json::<Value>().await.map_err(|e| e.to_string())?;
        for log in logs.get("worklogs").and_then(Value::as_array).into_iter().flatten() {
            let started = log.get("started").and_then(Value::as_str).unwrap_or("");
            if log.pointer("/author/accountId").and_then(Value::as_str) == Some(account_id) && started.get(0..10).map(|d| d >= from_date && d <= to_date).unwrap_or(false) {
                output.push(JiraWorklog { date: started.get(0..10).unwrap_or("").to_string(), issue_key: key.to_string(), summary: issue.pointer("/fields/summary").and_then(Value::as_str).unwrap_or("").to_string(), seconds: log.get("timeSpentSeconds").and_then(Value::as_i64).unwrap_or(0), comment: log.pointer("/comment/content/0/content/0/text").and_then(Value::as_str).unwrap_or("").to_string(), started: started.to_string(), url: format!("{}/browse/{key}", normal_url(&settings.base_url)) });
            }
        }
    }
    output.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(output)
}

#[tauri::command]
pub async fn check_jira_worklog_today(state: State<'_, AppState>) -> Result<WorklogCheckResult, String> {
    let settings = load_settings(&state)?;
    check_today(&settings).await
}

async fn check_today(settings: &JiraSettings) -> Result<WorklogCheckResult, String> {
    let now = Local::now();
    if matches!(now.weekday(), Weekday::Sat | Weekday::Sun) { return Err("Chỉ kiểm tra worklog từ Thứ 2 đến Thứ 6.".into()); }
    let date = now.format("%Y-%m-%d").to_string();
    let logged_seconds: i64 = fetch_worklogs(settings, &date, &date).await?.iter().map(|log| log.seconds).sum();
    let required_hours = if now.weekday() == Weekday::Fri { settings.friday_hours } else { settings.monday_to_thursday_hours };
    let expected_seconds = (required_hours * 3600.0) as i64;
    Ok(WorklogCheckResult { date, logged_seconds, expected_seconds, sufficient: logged_seconds >= expected_seconds })
}

/// The desktop process must remain running for this in-process schedule to execute.
/// It deliberately records at most one failed check per date.
pub fn start_worklog_scheduler(db_path: std::path::PathBuf) {
    tauri::async_runtime::spawn(async move {
        loop {
            let now = Local::now();

            if schedule_matches(&db_path, now) {
                if let Err(e) = run_scheduled_check(&db_path).await {
                    eprintln!("Jira scheduled check failed: {e}");
                }
            }

            tokio::time::sleep(
                std::time::Duration::from_secs(30)
            ).await;
        }
    });
}

fn schedule_matches(db_path: &std::path::PathBuf, now: chrono::DateTime<Local>) -> bool {
    let Ok(conn) = rusqlite::Connection::open(db_path) else { return false; };
    let Ok(raw) = conn.query_row("SELECT config FROM jira_settings WHERE id=1", [], |row| row.get::<_, String>(0)) else { return false; };
    let Ok(settings) = serde_json::from_str::<JiraSettings>(&raw) else { return false; };
    if !settings.schedule_enabled || matches!(now.weekday(), Weekday::Sat | Weekday::Sun) || now.hour() != settings.check_hour as u32 || now.minute() != settings.check_minute as u32 { return false; }
    match settings.schedule_frequency.as_str() {
        "monthly" => now.day() == settings.schedule_day as u32,
        "yearly" => now.month() == settings.schedule_month as u32 && now.day() == settings.schedule_day as u32,
        _ => true,
    }
}

async fn run_scheduled_check(db_path: &std::path::PathBuf) -> Result<(), String> {
    let settings: JiraSettings = {
        let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
        let raw: String = conn.query_row("SELECT config FROM jira_settings WHERE id=1", [], |row| row.get(0)).map_err(|_| "Jira chưa được cấu hình".to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())?
    };
    let result = check_today(&settings).await?;
    if result.sufficient { return Ok(()); }
    let today = result.date.clone();
    let attempts = {
        let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
        conn.execute("CREATE TABLE IF NOT EXISTS jira_worklog_alerts (checked_date TEXT PRIMARY KEY, missed_count INTEGER NOT NULL)", []).map_err(|e| e.to_string())?;
        if conn.query_row::<i64, _, _>("SELECT missed_count FROM jira_worklog_alerts WHERE checked_date=?1", [today.clone()], |row| row.get(0)).is_ok() {
            return Ok(());
        }
        let previous: i64 = conn.query_row("SELECT missed_count FROM jira_worklog_alerts ORDER BY checked_date DESC LIMIT 1", [], |row| row.get(0)).unwrap_or(0);
        conn.execute("INSERT OR IGNORE INTO jira_worklog_alerts (checked_date, missed_count) VALUES (?1, ?2)", rusqlite::params![today.clone(), previous + 1]).map_err(|e| e.to_string())?;
        conn.query_row("SELECT missed_count FROM jira_worklog_alerts WHERE checked_date=?1", [today], |row| row.get::<_, i64>(0)).map_err(|e| e.to_string())?
    };
    if attempts > settings.max_missed_checks as i64 { send_alert(&settings, result.logged_seconds, result.expected_seconds as f64 / 3600.0)?; }
    Ok(())
}

fn send_alert(settings: &JiraSettings, logged_seconds: i64, expected_hours: f64) -> Result<(), String> {
    if settings.smtp_host.trim().is_empty() || settings.notification_email.trim().is_empty() { return Ok(()); }
    let email = Message::builder().from(settings.smtp_from.parse().map_err(|e| format!("SMTP From không hợp lệ: {e}"))?)
        .to(settings.notification_email.parse().map_err(|e| format!("Email nhận không hợp lệ: {e}"))?)
        .subject("Nhắc nhở: Jira worklog chưa đủ giờ")
        .body(format!("Worklog hôm nay: {:.2}h / yêu cầu: {:.2}h.", logged_seconds as f64 / 3600.0, expected_hours)).map_err(|e| e.to_string())?;
    let mut builder = SmtpTransport::relay(&settings.smtp_host).map_err(|e| e.to_string())?.port(settings.smtp_port);
    if !settings.smtp_username.trim().is_empty() {
        let password = entry("smtp-password")?.get_password().map_err(|_| "Chưa có SMTP password".to_string())?;
        builder = builder.credentials(Credentials::new(settings.smtp_username.clone(), password));
    }
    builder.build().send(&email).map_err(|e| e.to_string())?;
    Ok(())
}
