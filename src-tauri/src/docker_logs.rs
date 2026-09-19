use serde::{Deserialize, Serialize};
use ssh2::Session;
use std::{
    fs,
    io::{Read, Write},
    net::TcpStream,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    pub enabled: bool,

    pub host: String,
    pub user: String,
    pub port: u16,

    /// "key" | "password"
    pub auth_type: String,

    /// Chỉ dùng khi auth_type = key
    pub key_path: Option<String>,

    /// Chỉ tồn tại trong request.
    /// KHÔNG lưu xuống file.
    pub password: Option<String>,

    /// Docker có cần sudo hay không
    pub use_sudo: bool,

    /// Chỉ truyền khi command hiện tại cần sudo.
    /// KHÔNG persist.
    pub sudo_password: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub status: String,
    pub image: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallKeyResult {
    pub key_path: String,
    pub message: String,
}

fn connect_ssh(config: &SshConfig) -> Result<Session, String> {
    let address = format!("{}:{}", config.host, config.port);

    let tcp = TcpStream::connect(&address)
        .map_err(|e| format!("Không thể kết nối tới {}: {}", address, e))?;

    let mut session =
        Session::new().map_err(|e| format!("Không thể tạo SSH session: {}", e))?;

    session.set_tcp_stream(tcp);

    session
        .handshake()
        .map_err(|e| format!("SSH handshake failed: {}", e))?;

    match config.auth_type.as_str() {
        "password" => {
            let password = config
                .password
                .as_deref()
                .ok_or("Thiếu SSH password")?;

            session
                .userauth_password(&config.user, password)
                .map_err(|e| format!("SSH password authentication failed: {}", e))?;
        }

        "key" => {
            let key_path = config
                .key_path
                .as_deref()
                .ok_or("Thiếu đường dẫn SSH private key")?;

            session
                .userauth_pubkey_file(
                    &config.user,
                    None,
                    Path::new(key_path),
                    None,
                )
                .map_err(|e| format!("SSH key authentication failed: {}", e))?;
        }

        _ => {
            return Err(format!(
                "SSH auth type không hợp lệ: {}",
                config.auth_type
            ));
        }
    }

    if !session.authenticated() {
        return Err("SSH authentication failed".into());
    }

    Ok(session)
}

fn run_remote_command(
    session: &Session,
    command: &str,
    sudo_password: Option<&str>,
) -> Result<String, String> {
    let mut channel = session
        .channel_session()
        .map_err(|e| format!("Không thể tạo SSH channel: {}", e))?;

    channel
        .exec(command)
        .map_err(|e| format!("Không thể chạy remote command: {}", e))?;

    /*
     * Quan trọng:
     *
     * Không làm:
     *
     * echo password | sudo ...
     *
     * vì password có thể xuất hiện trong shell command / log / process info.
     *
     * Thay vào đó ghi password trực tiếp vào stdin của SSH channel.
     */
    if let Some(password) = sudo_password {
        channel
            .write_all(format!("{}\n", password).as_bytes())
            .map_err(|e| format!("Không thể gửi sudo password: {}", e))?;

        channel.flush().ok();
    }

    let mut stdout = String::new();

    channel
        .read_to_string(&mut stdout)
        .map_err(|e| format!("Không đọc được stdout: {}", e))?;

    let mut stderr = String::new();

    channel
        .stderr()
        .read_to_string(&mut stderr)
        .map_err(|e| format!("Không đọc được stderr: {}", e))?;

    channel.wait_close().ok();

    let exit_code = channel.exit_status().unwrap_or(-1);

    let output = format!("{}{}", stdout, stderr);

    if exit_code != 0 {
        return Err(output);
    }

    Ok(output)
}

fn docker_command(config: &SshConfig, docker_args: &str) -> String {
    if config.use_sudo {
        format!("sudo -S -p '' docker {}", docker_args)
    } else {
        format!("docker {}", docker_args)
    }
}

#[tauri::command]
pub async fn get_docker_containers(
    ssh: SshConfig,
) -> Result<Vec<DockerContainer>, String> {
    tokio::task::spawn_blocking(move || {
        let output = if ssh.enabled {
            let session = connect_ssh(&ssh)?;

            let command = docker_command(
                &ssh,
                r#"ps -a --format "{{.ID}}|{{.Names}}|{{.Status}}|{{.Image}}""#,
            );

            run_remote_command(
                &session,
                &command,
                ssh.sudo_password.as_deref(),
            )?
        } else {
            let output = Command::new("docker")
                .args([
                    "ps",
                    "-a",
                    "--format",
                    "{{.ID}}|{{.Names}}|{{.Status}}|{{.Image}}",
                ])
                .output()
                .map_err(|e| format!("Không chạy được Docker CLI: {}", e))?;

            if !output.status.success() {
                return Err(
                    String::from_utf8_lossy(&output.stderr).to_string()
                );
            }

            String::from_utf8_lossy(&output.stdout).to_string()
        };

        let containers = output
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split('|').collect();

                if parts.len() != 4 {
                    return None;
                }

                Some(DockerContainer {
                    id: parts[0].to_string(),
                    name: parts[1].to_string(),
                    status: parts[2].to_string(),
                    image: parts[3].to_string(),
                })
            })
            .collect();

        Ok(containers)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_docker_logs(
    container_id: String,
    tail: String,
    grep: String,
    ssh: SshConfig,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let mut docker_args = String::from("logs");

        if tail != "all" {
            docker_args.push_str(&format!(" --tail={}", tail));
        }

        /*
         * container_id được lấy từ docker ps nên khá an toàn,
         * nhưng vẫn reject ký tự bất thường.
         */
        if !container_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err("Container ID không hợp lệ".into());
        }

        docker_args.push(' ');
        docker_args.push_str(&container_id);

        let output = if ssh.enabled {
            let session = connect_ssh(&ssh)?;

            let command = docker_command(&ssh, &docker_args);

            run_remote_command(
                &session,
                &command,
                ssh.sudo_password.as_deref(),
            )?
        } else {
            let mut command = Command::new("docker");

            command.arg("logs");

            if tail != "all" {
                command.arg(format!("--tail={}", tail));
            }

            command.arg(&container_id);

            let result = command
                .output()
                .map_err(|e| format!("Không chạy được docker logs: {}", e))?;

            /*
             * docker logs thường ghi log ra STDERR.
             */
            format!(
                "{}{}",
                String::from_utf8_lossy(&result.stdout),
                String::from_utf8_lossy(&result.stderr),
            )
        };

        if grep.trim().is_empty() {
            return Ok(output);
        }

        let term = grep.to_lowercase();

        let filtered = output
            .lines()
            .filter(|line| line.to_lowercase().contains(&term))
            .collect::<Vec<_>>()
            .join("\n");

        Ok(filtered)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn sanitize_name(input: &str) -> String {
    input
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn get_server_key_path(
    app: &AppHandle,
    host: &str,
    user: &str,
    port: u16,
) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("ssh");

    fs::create_dir_all(&base)
        .map_err(|e| format!("Không tạo được thư mục SSH: {}", e))?;

    let server_name = sanitize_name(
        &format!("{}_{}_{}", user, host, port)
    );

    let server_dir = base.join(server_name);

    fs::create_dir_all(&server_dir)
        .map_err(|e| format!("Không tạo được server key dir: {}", e))?;

    Ok(server_dir.join("id_ed25519"))
}

fn ensure_local_key(key_path: &Path) -> Result<(), String> {
    if key_path.exists() {
        return Ok(());
    }

    let status = Command::new("ssh-keygen")
        .args([
            "-t",
            "ed25519",
            "-N",
            "",
            "-C",
            "tauri-docker-console",
            "-f",
        ])
        .arg(key_path)
        .status()
        .map_err(|e| {
            format!(
                "Không chạy được ssh-keygen. Hãy kiểm tra OpenSSH Client: {}",
                e
            )
        })?;

    if !status.success() {
        return Err("ssh-keygen thất bại".into());
    }

    Ok(())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

#[tauri::command]
pub async fn install_ssh_key(
    app: AppHandle,
    host: String,
    user: String,
    port: u16,
    password: String,
) -> Result<InstallKeyResult, String> {
    tokio::task::spawn_blocking(move || {
        let key_path =
            get_server_key_path(&app, &host, &user, port)?;

        ensure_local_key(&key_path)?;

        let public_key_path =
            PathBuf::from(format!("{}.pub", key_path.display()));

        let public_key = fs::read_to_string(&public_key_path)
            .map_err(|e| {
                format!("Không đọc được public key: {}", e)
            })?
            .trim()
            .to_string();

        /*
         * Login lần đầu bằng password.
         */
        let ssh = SshConfig {
            enabled: true,
            host: host.clone(),
            user: user.clone(),
            port,

            auth_type: "password".into(),

            key_path: None,
            password: Some(password),

            use_sudo: false,
            sudo_password: None,
        };

        let session = connect_ssh(&ssh)?;

        /*
         * authorized_keys thuộc user đang login,
         * vì vậy KHÔNG cần sudo.
         */
        let quoted_key = shell_quote(&public_key);

        let command = format!(
            r#"
            mkdir -p ~/.ssh &&
            chmod 700 ~/.ssh &&
            touch ~/.ssh/authorized_keys &&
            chmod 600 ~/.ssh/authorized_keys &&
            grep -qxF {key} ~/.ssh/authorized_keys ||
            printf '%s\n' {key} >> ~/.ssh/authorized_keys
            "#,
            key = quoted_key
        );

        run_remote_command(
            &session,
            &command,
            None,
        )?;

        /*
         * Verify ngay bằng key.
         */
        let verify_config = SshConfig {
            enabled: true,
            host,
            user,
            port,

            auth_type: "key".into(),

            key_path: Some(
                key_path.to_string_lossy().to_string()
            ),

            password: None,

            use_sudo: false,
            sudo_password: None,
        };

        let verify_session = connect_ssh(&verify_config)?;

        run_remote_command(
            &verify_session,
            "echo SSH_KEY_OK",
            None,
        )?;

        Ok(InstallKeyResult {
            key_path: key_path
                .to_string_lossy()
                .to_string(),

            message:
                "SSH key đã được tạo, cài lên server và kiểm tra thành công."
                    .into(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}