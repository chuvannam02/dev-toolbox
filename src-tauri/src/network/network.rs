use serde::Serialize;
use std::{
    collections::HashSet,
    net::SocketAddr,
    process::Stdio,
    time::Instant,
};
use tokio::{
    net::{lookup_host, TcpStream},
    process::Command as TokioCommand,
    task::JoinSet,
    time::{timeout, Duration},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkCommandResult {
    pub success: bool,
    pub command: String,
    pub output: String,
    pub duration_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpCheckResult {
    pub success: bool,
    pub host: String,
    pub port: u16,
    pub address: Option<String>,
    pub status: String,
    pub duration_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsResult {
    pub success: bool,
    pub host: String,
    pub addresses: Vec<String>,
    pub duration_ms: u128,
}

// ---------------------------------------------------------
// Validation
// ---------------------------------------------------------

fn validate_host(host: &str) -> Result<String, String> {
    let host = host.trim();

    if host.is_empty() {
        return Err("Host không được để trống".into());
    }

    if host.len() > 253 {
        return Err("Host quá dài".into());
    }

    // Không cho người dùng truyền option command kiểu:
    //
    // -t
    // /something
    //
    if host.starts_with('-') || host.starts_with('/') {
        return Err("Host không hợp lệ".into());
    }

    let valid = host
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || ".-_:".contains(c));

    if !valid {
        return Err("Host chứa ký tự không hợp lệ".into());
    }

    Ok(host.to_string())
}

// ---------------------------------------------------------
// Shared helper: chạy 1 lệnh hệ thống (ping / nslookup / tracert)
//
// Dùng tokio::process thay vì std::process + spawn_blocking:
// - Không chiếm 1 thread trong blocking pool cho mỗi lệnh.
// - Có timeout "cứng": nếu tiến trình treo (ví dụ nslookup không
//   có cờ timeout) thì bị kill thay vì chờ vô hạn.
// - kill_on_drop(true): nếu future bị hủy giữa chừng (user đóng
//   app / hủy request) thì tiến trình con cũng bị dọn theo, tránh
//   process con rác chạy nền.
// ---------------------------------------------------------

async fn run_system_command(
    program: &str,
    args: &[String],
    timeout_ms: u64,
) -> Result<(bool, String), String> {
    let mut command = TokioCommand::new(program);

    command
        .args(args)
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let child = command
        .spawn()
        .map_err(|e| format!("Không thể chạy {program}: {e}"))?;

    let output = timeout(Duration::from_millis(timeout_ms), child.wait_with_output())
        .await
        .map_err(|_| format!("{program} vượt quá thời gian chờ ({timeout_ms}ms)"))?
        .map_err(|e| format!("Không thể đọc output của {program}: {e}"))?;

    let mut text = String::from_utf8_lossy(&output.stdout).to_string();

    if !output.stderr.is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }

        text.push_str(&String::from_utf8_lossy(&output.stderr));
    }

    Ok((output.status.success(), text))
}

// ---------------------------------------------------------
// PING
// ---------------------------------------------------------

#[tauri::command]
pub async fn network_ping(host: String, count: Option<u8>) -> Result<NetworkCommandResult, String> {
    let host = validate_host(&host)?;
    let count = count.unwrap_or(4).clamp(1, 10);
    let started = Instant::now();

    #[cfg(target_os = "windows")]
    let args = vec![
        "-n".to_string(),
        count.to_string(),
        "-w".to_string(),
        "2000".to_string(),
        host.clone(),
    ];

    #[cfg(not(target_os = "windows"))]
    let args = vec![
        "-c".to_string(),
        count.to_string(),
        "-W".to_string(),
        "2".to_string(),
        host.clone(),
    ];

    #[cfg(target_os = "windows")]
    let program = "ping";
    #[cfg(not(target_os = "windows"))]
    let program = "ping";

    // Timeout cứng = count * ~2.5s / lần, cộng biên an toàn.
    let hard_timeout_ms = (count as u64) * 2_500 + 3_000;

    let (success, output) = run_system_command(program, &args, hard_timeout_ms).await?;

    Ok(NetworkCommandResult {
        success,
        command: format!("ping {host}"),
        output,
        duration_ms: started.elapsed().as_millis(),
    })
}

// ---------------------------------------------------------
// TCP PORT CHECK
//
// Thay thế:
// telnet 10.0.0.1 443
//
// Không cần Telnet Client.
//
// Tối ưu: nếu host resolve ra nhiều địa chỉ (vd. có cả IPv6 lẫn
// IPv4), thử kết nối SONG SONG tới tất cả thay vì tuần tự — trả
// về ngay khi địa chỉ đầu tiên connect được, thay vì cộng dồn
// timeout qua từng địa chỉ một (kiểu Happy Eyeballs rút gọn).
// ---------------------------------------------------------

#[tauri::command]
pub async fn network_tcp_check(
    host: String,
    port: u16,
    timeout_ms: Option<u64>,
) -> Result<TcpCheckResult, String> {
    let host = validate_host(&host)?;

    if port == 0 {
        return Err("Port phải nằm trong khoảng 1-65535".into());
    }

    let timeout_ms = timeout_ms.unwrap_or(3000).clamp(200, 15_000);
    let started = Instant::now();

    let addresses: Vec<SocketAddr> = lookup_host((host.as_str(), port))
        .await
        .map_err(|e| format!("DNS resolve failed: {e}"))?
        .collect();

    if addresses.is_empty() {
        return Ok(TcpCheckResult {
            success: false,
            host,
            port,
            address: None,
            status: "DNS_RESOLVE_FAILED".into(),
            duration_ms: started.elapsed().as_millis(),
        });
    }

    let connected = connect_any(addresses, timeout_ms).await;

    let (success, address, status) = match connected {
        Some(addr) => (true, Some(addr.to_string()), "OPEN".to_string()),
        None => (false, None, "CLOSED_OR_TIMEOUT".to_string()),
    };

    Ok(TcpCheckResult {
        success,
        host,
        port,
        address,
        status,
        duration_ms: started.elapsed().as_millis(),
    })
}

/// Thử connect song song tới tất cả các địa chỉ, trả về địa chỉ
/// đầu tiên connect thành công (nếu có). Các task còn lại bị hủy
/// ngay khi có kết quả, tránh tốn tài nguyên chờ thêm.
async fn connect_any(addresses: Vec<SocketAddr>, timeout_ms: u64) -> Option<SocketAddr> {
    let mut set: JoinSet<Option<SocketAddr>> = JoinSet::new();

    for addr in addresses {
        set.spawn(async move {
            match timeout(Duration::from_millis(timeout_ms), TcpStream::connect(addr)).await {
                Ok(Ok(_stream)) => Some(addr),
                _ => None,
            }
        });
    }

    while let Some(joined) = set.join_next().await {
        if let Ok(Some(addr)) = joined {
            set.abort_all();
            return Some(addr);
        }
    }

    None
}

// ---------------------------------------------------------
// DNS RESOLVE
//
// Không cần gọi nslookup.
// ---------------------------------------------------------

#[tauri::command]
pub async fn network_dns_resolve(host: String) -> Result<DnsResult, String> {
    let host = validate_host(&host)?;
    let started = Instant::now();

    let addresses = lookup_host((host.as_str(), 0))
        .await
        .map_err(|e| format!("DNS lookup failed: {e}"))?;

    let unique: HashSet<String> = addresses.map(|a| a.ip().to_string()).collect();
    let mut addresses: Vec<String> = unique.into_iter().collect();
    addresses.sort();

    Ok(DnsResult {
        success: !addresses.is_empty(),
        host,
        addresses,
        duration_ms: started.elapsed().as_millis(),
    })
}

// ---------------------------------------------------------
// NSLOOKUP
//
// Windows có sẵn nslookup.exe. Lệnh này không có cờ timeout
// riêng nên bắt buộc phải bọc timeout cứng ở tầng ứng dụng
// (xem run_system_command) để tránh treo khi DNS server không
// phản hồi.
// ---------------------------------------------------------

#[tauri::command]
pub async fn network_nslookup(host: String) -> Result<NetworkCommandResult, String> {
    let host = validate_host(&host)?;
    let started = Instant::now();

    let args = vec![host.clone()];
    let (success, output) = run_system_command("nslookup", &args, 5_000).await?;

    Ok(NetworkCommandResult {
        success,
        command: format!("nslookup {host}"),
        output,
        duration_ms: started.elapsed().as_millis(),
    })
}

// ---------------------------------------------------------
// TRACEROUTE
//
// Windows:
// tracert google.com
// ---------------------------------------------------------

#[tauri::command]
pub async fn network_trace(host: String) -> Result<NetworkCommandResult, String> {
    let host = validate_host(&host)?;
    let started = Instant::now();

    #[cfg(target_os = "windows")]
    let (program, args) = (
        "tracert",
        vec![
            "-d".to_string(),
            "-h".to_string(),
            "20".to_string(),
            "-w".to_string(),
            "1000".to_string(),
            host.clone(),
        ],
    );

    #[cfg(not(target_os = "windows"))]
    let (program, args) = (
        "traceroute",
        vec!["-n".to_string(), "-m".to_string(), "20".to_string(), host.clone()],
    );

    // 20 hop * 1s + biên an toàn.
    let (success, output) = run_system_command(program, &args, 25_000).await?;

    Ok(NetworkCommandResult {
        success,
        command: format!("{program} {host}"),
        output,
        duration_ms: started.elapsed().as_millis(),
    })
}