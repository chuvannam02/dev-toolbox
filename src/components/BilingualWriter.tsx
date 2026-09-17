import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

// --- TEMPLATES DÀNH CHO DEV ---
const EMAIL_TEMPLATES = [
  {
    name: "🚀 Báo cáo tiến độ (Daily Update)",
    content:
      "<p>Hi Team,</p><p><br></p><p>Here is my update for today:</p><p><strong>Done:</strong></p><ul><li>[Task 1]</li></ul><p><strong>In Progress:</strong></p><ul><li>[Task 2]</li></ul><p><strong>Blockers:</strong></p><ul><li>None</li></ul><p><br></p><p>Best regards,</p>",
  },
  {
    name: "🔍 Code Review Comment",
    content:
      "<p>Hi,</p><p>Thanks for the PR. Overall, the logic looks solid. However, I have a few suggestions:</p><ol><li><strong>Performance:</strong> Could we optimize the loop at line X?</li><li><strong>Naming:</strong> Variable `y` could be renamed to be more descriptive.</li></ol><p>Please let me know if you need any clarification!</p>",
  },
  {
    name: "🔥 Thông báo Lỗi / Bug Report",
    content:
      "<p>Hi Team,</p><p><br></p><p>I've encountered an issue in the <strong>[Environment]</strong> environment.</p><p><strong>Steps to reproduce:</strong></p><ol><li>...</li></ol><p><strong>Expected behavior:</strong> ...</p><p><strong>Actual behavior:</strong> ...</p><p><strong>Logs attached:</strong> ...</p><p><br></p><p>Thanks,</p>",
  },
];

// This modules object configures editor features like toolbar
const modules = {
  // toolbar what tools appear in the UI
  toolbar: [
    [{ header: [1, 2, 3, 4, 5, false] }],
    ["bold", "italic", "underline"],
    [{ color: [] }, { background: [] }],
    ["blockquote", "code-block"],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ align: [] }],
    [{ size: ["small", false, "large", "huge"] }],
    ["link", "image"],
  ],
};

// Defines what is preserved in the content when editing
// (The functionality of the toolbar tools)
const formats = [
  "header",
  "bold",
  "color",
  "background",
  "italic",
  "underline",
  "blockquote",
  "code-block",
  "list",
  "bullet",
  "align",
  "size",
  "link",
  "image",
];

export default function BilingualWriter() {
  const [editorContent, setEditorContent] = useState("");
  const [grammarFeedback, setGrammarFeedback] = useState<string[]>([]);

  // Hàm chèn Template
  const handleInsertTemplate = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tpl = EMAIL_TEMPLATES.find((t) => t.name === e.target.value);
    if (tpl) {
      setEditorContent(tpl.content);
      setGrammarFeedback([]); // Reset feedback
    }
  };

  // Hàm Check Grammar gọi Rust
  const handleCheckGrammar = async () => {
    try {
      // Xóa tag HTML để Rust chỉ check raw text
      const plainText = editorContent.replace(/<[^>]+>/g, " ");
      const feedback: string[] = await invoke("check_grammar", {
        text: plainText,
      });
      setGrammarFeedback(feedback);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div
      className="view-container"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <h2>✍️ Professional Writer & Grammar</h2>
      <p style={{ color: "#a9a9a9", marginBottom: "15px" }}>
        Soạn thảo Email công việc, Review Code, và kiểm tra tiếng Anh cơ bản.
      </p>

      {/* Thanh công cụ */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
        <select
          onChange={handleInsertTemplate}
          className="input-dark"
          style={{ flex: 1 }}
        >
          <option value="">-- 📄 Chèn Template (Mẫu câu) --</option>
          {EMAIL_TEMPLATES.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleCheckGrammar}
          className="btn-primary"
          style={{ background: "#007acc" }}
        >
          ✅ Check Grammar
        </button>
      </div>

      {/* Hiển thị lỗi ngữ pháp */}
      {grammarFeedback.length > 0 && (
        <div
          style={{
            background: "#252526",
            padding: "15px",
            borderRadius: "6px",
            border: "1px solid #444",
            marginBottom: "15px",
          }}
        >
          <h4 style={{ color: "#d4d4d4", marginBottom: "10px" }}>
            Kết quả kiểm tra:
          </h4>
          <ul
            style={{
              listStylePosition: "inside",
              color: "#f48771",
              fontSize: "14px",
            }}
          >
            {grammarFeedback.map((fb, idx) => (
              <li
                key={idx}
                style={{
                  color: fb.includes("✅") ? "#4caf50" : "#f48771",
                  marginBottom: "5px",
                }}
              >
                {fb}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* React Quill Editor */}
      <div
        className="quill-container"
        style={{
          flex: 1,
          background: "#fff",
          color: "#000",
          borderRadius: "4px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <ReactQuill
          theme="snow"
          modules={modules}
          formats={formats}
          value={editorContent}
          onChange={setEditorContent}
          style={{ height: "100%", display: "flex", flexDirection: "column" }}
        />
      </div>
    </div>
  );
}
