import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Editor from "@monaco-editor/react";

// Khai báo kiểu dữ liệu trả về từ Rust
type LogAnalysis = {
  status: string;
  error_lines: string[];
  failed_tests: string[];
  suggestion: string;
};

export default function JenkinsController() {
  // --- TỰ ĐỘNG LƯU & LOAD CẤU HÌNH TỪ LOCALSTORAGE ---
  const [url, setUrl] = useState(() => localStorage.getItem("jk_url") || "http://192.168.1.100:8080");
  const [user, setUser] = useState(() => localStorage.getItem("jk_user") || "admin");
  const [token, setToken] = useState(() => localStorage.getItem("jk_token") || "");
  const [jobName, setJobName] = useState(() => localStorage.getItem("jk_job") || "jhipster-blue-green-deploy");
  
  const [params, setParams] = useState<{key: string, value: string}[]>([
    { key: "TARGET_ENV", value: "blue" },
    { key: "APP_VERSION", value: "latest" }
  ]);
  
  const [logs, setLogs] = useState<string>("Nhập thông tin và bấm Trigger để chạy CI/CD Pipeline...");
  const [isRunning, setIsRunning] = useState(false);
  
  // State lưu kết quả phân tích
  const [analysis, setAnalysis] = useState<LogAnalysis | null>(null);

  // Lưu cấu hình vào LocalStorage mỗi khi input thay đổi
  useEffect(() => {
    localStorage.setItem("jk_url", url);
    localStorage.setItem("jk_user", user);
    localStorage.setItem("jk_token", token);
    localStorage.setItem("jk_job", jobName);
  }, [url, user, token, jobName]);

  // Lắng nghe Log Realtime
  useEffect(() => {
    const unlisten = listen<string>("jenkins-log", (event) => {
      setLogs((prev) => prev + event.payload);
      if (event.payload.includes("Pipeline hoàn tất")) {
        setIsRunning(false);
      }
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  const handleTrigger = async () => {
    setIsRunning(true);
    setLogs(""); 
    setAnalysis(null); // Xóa kết quả phân tích cũ
    
    const paramsMap = params.reduce((acc, curr) => {
      if (curr.key) acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    try {
      await invoke("trigger_jenkins_job", { url, user, token, jobName, params: paramsMap });
    } catch (err) {
      setLogs(`❌ ${err}`);
      setIsRunning(false);
    }
  };

  // Hàm gọi Rust để phân tích Log
  const handleAnalyzeLog = async () => {
    if (!logs || logs.length < 10) return;
    try {
      const result: LogAnalysis = await invoke("analyze_build_log", { logText: logs });
      setAnalysis(result);
    } catch (err) {
      alert("Lỗi khi phân tích: " + err);
    }
  };

  const updateParam = (index: number, field: 'key'|'value', val: string) => {
    const newParams = [...params];
    newParams[index][field] = val;
    setParams(newParams);
  };

  return (
    <div className="view-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h2>⚙️ Jenkins Pipeline Control & Auto-Analyzer</h2>
      
      {/* Khung cấu hình */}
      <div style={{ background: '#252526', padding: '15px', borderRadius: '6px', border: '1px solid #333', marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <input placeholder="Jenkins URL (vd: http://10.0.0.5:8080)" value={url} onChange={e => setUrl(e.target.value)} className="input-dark" style={{ flex: 2 }} />
          <input placeholder="Username" value={user} onChange={e => setUser(e.target.value)} className="input-dark" style={{ flex: 1 }} />
          <input type="password" placeholder="API Token (Tạo trong Jenkins Profile)" value={token} onChange={e => setToken(e.target.value)} className="input-dark" style={{ flex: 2 }} />
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input placeholder="Tên Job (vd: backend-deploy)" value={jobName} onChange={e => setJobName(e.target.value)} className="input-dark" style={{ flex: 2, fontWeight: 'bold' }} />
          
          <div style={{ display: 'flex', flex: 3, flexDirection: 'column', gap: '5px' }}>
            {params.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: '5px' }}>
                <input placeholder="Key" value={p.key} onChange={e => updateParam(i, 'key', e.target.value)} className="input-dark" style={{ flex: 1 }} />
                <input placeholder="Value" value={p.value} onChange={e => updateParam(i, 'value', e.target.value)} className="input-dark" style={{ flex: 1 }} />
              </div>
            ))}
          </div>
          
          <button onClick={() => setParams([...params, {key:'', value:''}])} className="btn-primary" style={{ background: '#555', padding: '10px' }}>+ Param</button>
          <button onClick={handleTrigger} disabled={isRunning || !token} className="btn-primary" style={{ background: isRunning ? '#555' : '#4caf50', padding: '10px 20px', fontSize: '15px' }}>
            {isRunning ? "🔄 Đang chạy..." : "▶ Trigger Job"}
          </button>
        </div>
      </div>

      {/* Nút Phân tích Lỗi */}
      <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleAnalyzeLog} className="btn-primary" style={{ background: '#007acc' }} disabled={logs.length < 50}>
          🔍 Tự động phân tích lỗi Log
        </button>
      </div>

      {/* Hiển thị Kết quả phân tích (Chỉ hiện khi có kết quả) */}
      {analysis && (
        <div style={{ background: '#3c3c3c', padding: '15px', borderRadius: '6px', borderLeft: analysis.status === 'SUCCESS' ? '4px solid #4caf50' : '4px solid #f48771', marginBottom: '10px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '5px', color: analysis.status === 'SUCCESS' ? '#4caf50' : '#f48771' }}>
            TRẠNG THÁI: {analysis.status}
          </div>
          <div style={{ color: '#d4d4d4', marginBottom: '10px' }}>{analysis.suggestion}</div>
          
          {analysis.failed_tests.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <strong style={{ color: '#f48771' }}>Unit Tests Thất bại:</strong>
              <ul style={{ paddingLeft: '20px', margin: '5px 0', fontSize: '13px', color: '#ffbaba' }}>
                {analysis.failed_tests.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}

          {analysis.error_lines.length > 0 && (
            <div>
              <strong style={{ color: '#f48771' }}>Lỗi Biên dịch/Hệ thống:</strong>
              <ul style={{ paddingLeft: '20px', margin: '5px 0', fontSize: '13px', color: '#ffbaba', fontFamily: 'monospace' }}>
                {analysis.error_lines.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Console Output Viewer */}
      <div style={{ flex: 1, border: '1px solid #333', borderRadius: '4px', overflow: 'hidden' }}>
        <Editor
          height="100%"
          theme="vs-dark"
          language="shell"
          value={logs}
          options={{ readOnly: true, wordWrap: "on", minimap: { enabled: false }, scrollBeyondLastLine: false }}
        />
      </div>
    </div>
  );
}