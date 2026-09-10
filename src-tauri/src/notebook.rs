// src-tauri/src/notebook.rs
use futures_util::{SinkExt, StreamExt};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::{Child as TokioChild, Command as TokioCommand};
use tokio::sync::Mutex as AsyncMutex;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------

struct KernelState {
    child: Option<TokioChild>,
    ws_port: u16,
    ready: bool,
}

impl Default for KernelState {
    fn default() -> Self {
        Self { child: None, ws_port: 8765, ready: false }
    }
}

static KERNEL: OnceCell<AsyncMutex<KernelState>> = OnceCell::new();

fn kernel_state() -> &'static AsyncMutex<KernelState> {
    KERNEL.get_or_init(|| AsyncMutex::new(KernelState::default()))
}

// ---------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------

#[derive(Serialize)]
struct ExecuteRequest<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    cell_id: &'a str,
    code: &'a str,
}

#[derive(Deserialize)]
struct SidecarMessage {
    #[serde(rename = "type")]
    kind: String,
    cell_id: String,
    text: String,
    done: bool,
    ok: bool,
    execution_count: Option<u32>,
}

#[derive(Serialize, Clone)]
struct CellOutputPayload {
    #[serde(rename = "cell_id")]
    cell_id: String,
    output: CellOutputItem,
    done: bool,
    #[serde(rename = "execution_count")]
    execution_count: Option<u32>,
    ok: bool,
}

#[derive(Serialize, Clone)]
struct CellOutputItem {
    #[serde(rename = "type")]
    kind: String,
    text: String,
}

/// Python embedded được bundle cùng app.
/// Không tạo venv và không cài package lúc runtime.
fn bundled_python_path(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Không lấy được resource_dir: {e}"))?;

    #[cfg(target_os = "windows")]
    let python = resource_dir
        .join("python-dist")
        .join("python.exe");

    #[cfg(not(target_os = "windows"))]
    let python = resource_dir
        .join("python-dist")
        .join("bin")
        .join("python3");

    if !python.exists() {
        return Err(format!(
            "Không tìm thấy bundled Python tại: {:?}",
            python
        ));
    }

    Ok(python)
}

// ---------------------------------------------------------------
// Commands
// ---------------------------------------------------------------

#[tauri::command]
pub async fn ensure_kernel_started(app: AppHandle) -> Result<u16, String> {
    {
        let state = kernel_state().lock().await;

        if state.ready {
            return Ok(state.ws_port);
        }
    }

    // -----------------------------------------------------------
    // Bundled Python — KHÔNG venv, KHÔNG pip install
    // -----------------------------------------------------------
    let python = bundled_python_path(&app)?;

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    let sidecar_path = resource_dir
        .join("python")
        .join("notebook_sidecar.py");

    if !sidecar_path.exists() {
        return Err(format!(
            "Không tìm thấy notebook_sidecar.py tại {:?}",
            sidecar_path
        ));
    }

    let mut state = kernel_state().lock().await;

    // Check lại vì có thể một command khác vừa start kernel
    if state.ready {
        return Ok(state.ws_port);
    }

    // --- THÊM ĐOẠN NÀY ĐỂ XÓA TIỀN TỐ \\?\ ---
    let python_clean = python.to_string_lossy().replace("\\\\?\\", "");
    let sidecar_clean = sidecar_path.to_string_lossy().replace("\\\\?\\", "");

    println!("[Kernel] Starting bundled Python: {}", python_clean);

    // --- SỬ DỤNG BIẾN CLEAN THAY VÌ BIẾN CŨ ---
    let child = TokioCommand::new(&python_clean)
        .arg(&sidecar_clean)
        .arg("--port")
        .arg(state.ws_port.to_string())
        .arg("--python")
        .arg(&python_clean)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Không spawn được Python sidecar: {e}"))?;

    state.child = Some(child);

    let url = format!("ws://127.0.0.1:{}", state.ws_port);

    let mut attempts = 0;

    loop {
        if connect_async(&url).await.is_ok() {
            break;
        }

        attempts += 1;

        if attempts > 30 {
            return Err(
                "Sidecar không phản hồi sau khi khởi động".into()
            );
        }

        tokio::time::sleep(
            std::time::Duration::from_millis(300)
        )
        .await;
    }

    state.ready = true;

    Ok(state.ws_port)
}

#[tauri::command]
pub async fn execute_cell(app: AppHandle, cellId: String, code: String) -> Result<(), String> {
    let port = {
        let state = kernel_state().lock().await;
        if !state.ready {
            return Err("Kernel chưa sẵn sàng".into());
        }
        state.ws_port
    };

    let url = format!("ws://127.0.0.1:{}", port);
    let (ws_stream, _) = connect_async(&url)
        .await
        .map_err(|e| format!("Không kết nối được sidecar: {e}"))?;
    let (mut write, mut read) = ws_stream.split();

    let req = ExecuteRequest { kind: "execute", cell_id: &cellId, code: &code };
    let payload = serde_json::to_string(&req).map_err(|e| e.to_string())?;
    write.send(Message::Text(payload.into())).await.map_err(|e| e.to_string())?;

    while let Some(msg) = read.next().await {
        let msg = msg.map_err(|e| e.to_string())?;
        if let Message::Text(text) = msg {
            let parsed: SidecarMessage = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            let event_payload = CellOutputPayload {
                cell_id: parsed.cell_id.clone(),
                output: CellOutputItem { kind: parsed.kind.clone(), text: parsed.text.clone() },
                done: parsed.done,
                execution_count: parsed.execution_count,
                ok: parsed.ok,
            };
            app.emit("cell-output", event_payload).map_err(|e| e.to_string())?;
            if parsed.done {
                break;
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn restart_kernel(app: AppHandle) -> Result<(), String> {
    let mut state = kernel_state().lock().await;
    if let Some(mut child) = state.child.take() {
        let _ = child.kill().await;
    }
    state.ready = false;
    drop(state);
    // KHÔNG gọi lại ensure_venv_ready cài đặt lại — venv đã có marker .ready nên chỉ spawn lại process
    ensure_kernel_started(app).await.map(|_| ())
}