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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraProject { pub key: String, pub name: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraTreeIssue { pub key: String, pub summary: String, pub issue_type: String, pub status: String, pub url: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraIssueDetail { pub key: String, pub summary: String, pub issue_type: String, pub status: String, pub description: String, pub assignee: String, pub labels: Vec<String>, pub url: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraUser { pub account_id: String, pub display_name: String, pub is_current_user: bool }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSubtaskInput { pub project_key: String, pub parent_key: String, pub summary: String, pub description: String, pub assignee_account_id: Option<String>, pub labels: Vec<String> }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddWorklogInput { pub issue_key: String, pub time_spent_seconds: i64, pub started: String, pub comment: String }

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

async fn api_get(settings: &JiraSettings, path: &str, query: &[(&str, String)]) -> Result<Value, String> {
    let (email, token) = credentials(settings)?;
    let query_string = query.iter().map(|(key, value)| format!("{key}={value}")).collect::<Vec<_>>().join("&");
    let url = if query_string.is_empty() { format!("{}{}", normal_url(&settings.base_url), path) } else { format!("{}{}?{query_string}", normal_url(&settings.base_url), path) };
    let response = Client::new().get(url)
        .basic_auth(email, Some(token)).send().await.map_err(|e| format!("Kh\u{00f4}ng th\u{1ec3} k\u{1ebf}t n\u{1ed1}i Jira: {e}"))?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() { return Err(format!("Jira tr\u{1ea3} v\u{1ec1} HTTP {status}: {text}")); }
    serde_json::from_str(&text).map_err(|e| format!("Jira tr\u{1ea3} v\u{1ec1} d\u{1eef} li\u{1ec7}u kh\u{00f4}ng h\u{1ee3}p l\u{1ec7}: {e}"))
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
pub async fn get_jira_projects(state: State<'_, AppState>) -> Result<Vec<JiraProject>, String> {
    let settings = load_settings(&state)?;
    let result = api_get(&settings, "/rest/api/3/project/search", &[("maxResults", "100".into())]).await?;
    Ok(result.get("values").and_then(Value::as_array).into_iter().flatten().map(|project| JiraProject {
        key: project.get("key").and_then(Value::as_str).unwrap_or_default().to_string(),
        name: project.get("name").and_then(Value::as_str).unwrap_or_default().to_string(),
    }).collect())
}

#[tauri::command]
pub async fn get_jira_child_issues(state: State<'_, AppState>, project_key: String, parent_key: Option<String>, search: Option<String>) -> Result<Vec<JiraTreeIssue>, String> {
    let settings = load_settings(&state)?;
    let mut jql = match parent_key {
        Some(parent) => format!("parent = {parent} ORDER BY updated DESC"),
        None => format!("project = {project_key} AND parent is EMPTY ORDER BY updated DESC"),
    };
    if let Some(term) = search.filter(|term| !term.trim().is_empty()) {
        let condition = format!("(summary ~ \"{}\" OR key = \"{}\")", term.replace('"', "\\\""), term.replace('"', "\\\""));
        jql = jql.replace(" ORDER BY", &format!(" AND {condition} ORDER BY"));
    }
    let result = api(&settings, "/rest/api/3/search/jql", json!({"jql": jql, "maxResults": 100, "fields": ["summary", "status", "issuetype"]})).await?;
    Ok(result.get("issues").and_then(Value::as_array).into_iter().flatten().map(|issue| JiraTreeIssue {
        key: issue.get("key").and_then(Value::as_str).unwrap_or_default().to_string(),
        summary: issue.pointer("/fields/summary").and_then(Value::as_str).unwrap_or_default().to_string(),
        issue_type: issue.pointer("/fields/issuetype/name").and_then(Value::as_str).unwrap_or_default().to_string(),
        status: issue.pointer("/fields/status/name").and_then(Value::as_str).unwrap_or_default().to_string(),
        url: format!("{}/browse/{}", normal_url(&settings.base_url), issue.get("key").and_then(Value::as_str).unwrap_or_default()),
    }).collect())
}

fn adf_text(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            let mut output = map.get("text").and_then(Value::as_str).unwrap_or("").to_string();
            if let Some(items) = map.get("content").and_then(Value::as_array) {
                for item in items { let text = adf_text(item); if !text.is_empty() { if !output.is_empty() { output.push('\n'); } output.push_str(&text); } }
            }
            output
        }
        Value::Array(items) => items.iter().map(adf_text).filter(|text| !text.is_empty()).collect::<Vec<_>>().join("\n"),
        _ => String::new(),
    }
}

#[tauri::command]
pub async fn get_jira_issue_detail(state: State<'_, AppState>, issue_key: String) -> Result<JiraIssueDetail, String> {
    let settings = load_settings(&state)?;
    let issue = api_get(&settings, &format!("/rest/api/3/issue/{issue_key}"), &[("fields", "summary,status,issuetype,description,assignee,labels".into())]).await?;
    Ok(JiraIssueDetail {
        key: issue.get("key").and_then(Value::as_str).unwrap_or_default().to_string(),
        summary: issue.pointer("/fields/summary").and_then(Value::as_str).unwrap_or_default().to_string(),
        issue_type: issue.pointer("/fields/issuetype/name").and_then(Value::as_str).unwrap_or_default().to_string(),
        status: issue.pointer("/fields/status/name").and_then(Value::as_str).unwrap_or_default().to_string(),
        description: adf_text(issue.pointer("/fields/description").unwrap_or(&Value::Null)),
        assignee: issue.pointer("/fields/assignee/displayName").and_then(Value::as_str).unwrap_or("Chưa gán").to_string(),
        labels: issue.pointer("/fields/labels").and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_str).map(str::to_string).collect(),
        url: format!("{}/browse/{}", normal_url(&settings.base_url), issue.get("key").and_then(Value::as_str).unwrap_or_default()),
    })
}

#[tauri::command]
pub async fn get_jira_assignable_users(state: State<'_, AppState>, project_key: String, issue_key: String) -> Result<Vec<JiraUser>, String> {
    let settings = load_settings(&state)?;
    let me = api_get(&settings, "/rest/api/3/myself", &[]).await?;
    let my_id = me.get("accountId").and_then(Value::as_str).unwrap_or("").to_string();
    let result = api_get(&settings, "/rest/api/3/user/assignable/search", &[("project", project_key), ("issueKey", issue_key), ("maxResults", "100".into())]).await?;
    let mut users: Vec<JiraUser> = result.as_array().into_iter().flatten().map(|user| JiraUser {
        account_id: user.get("accountId").and_then(Value::as_str).unwrap_or_default().to_string(),
        display_name: user.get("displayName").and_then(Value::as_str).unwrap_or_default().to_string(),
        is_current_user: user.get("accountId").and_then(Value::as_str) == Some(my_id.as_str()),
    }).collect();
    if !my_id.is_empty() && !users.iter().any(|user| user.account_id == my_id) {
        users.insert(0, JiraUser { account_id: my_id, display_name: me.get("displayName").and_then(Value::as_str).unwrap_or("T\u{00f4}i").to_string(), is_current_user: true });
    }
    Ok(users)
}

#[tauri::command]
pub async fn create_jira_subtask(state: State<'_, AppState>, input: CreateSubtaskInput) -> Result<JiraTreeIssue, String> {
    if input.summary.trim().is_empty() { return Err("T\u{00ea}n task kh\u{00f4}ng \u{0111}\u{01b0}\u{1ee3}c \u{0111}\u{1ec3} tr\u{1ed1}ng.".into()); }
    let settings = load_settings(&state)?;
    let mut fields = json!({
        "project": { "key": input.project_key }, "parent": { "key": input.parent_key },
        "summary": input.summary.trim(), "issuetype": { "name": "Sub-task" }, "labels": input.labels,
        "description": { "type": "doc", "version": 1, "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": input.description }] }] }
    });
    if input.description.trim().is_empty() { fields.as_object_mut().unwrap().remove("description"); }
    if let Some(account_id) = input.assignee_account_id.filter(|value| !value.is_empty()) { fields["assignee"] = json!({"accountId": account_id}); }
    let result = api(&settings, "/rest/api/3/issue", json!({"fields": fields})).await?;
    Ok(JiraTreeIssue { key: result.get("key").and_then(Value::as_str).unwrap_or_default().to_string(), summary: input.summary, issue_type: "Sub-task".into(), status: "".into(), url: format!("{}/browse/{}", normal_url(&settings.base_url), result.get("key").and_then(Value::as_str).unwrap_or_default()) })
}

#[tauri::command]
pub async fn add_jira_worklog(state: State<'_, AppState>, input: AddWorklogInput) -> Result<(), String> {
    if input.time_spent_seconds <= 0 { return Err("Th\u{1edd}i gian log ph\u{1ea3}i l\u{1edb}n h\u{01a1}n 0.".into()); }
    let settings = load_settings(&state)?;
    let mut body = json!({"timeSpentSeconds": input.time_spent_seconds, "started": input.started});
    if !input.comment.trim().is_empty() { body["comment"] = json!({"type":"doc","version":1,"content":[{"type":"paragraph","content":[{"type":"text","text":input.comment}]}]}); }
    api(&settings, &format!("/rest/api/3/issue/{}/worklog", input.issue_key), body).await?;
    Ok(())
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
