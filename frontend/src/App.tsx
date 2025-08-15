import { useEffect, useRef, useState } from "react";
import "./App.css";

/* ---------- Types ---------- */
type Role = "user" | "assistant";
interface Message { role: Role; content: string; }

/* ---------- Config ---------- */
/** Backend base URL comes from Render/Vite env */
const API_BASE = import.meta.env.VITE_BACKEND_URL as string | undefined;
/** Helper to create a message */
const mk = (role: Role, content: string): Message => ({ role, content });

/** Recruiter-friendly greeting (no “prototype by …” inside the message) */
const GREETING = [
  "Hi! I’m Clarity Coach — a real-time AI assistant.",
  "",
  "Quick Tips:",
  "• Ask anything practical (e.g., “Give me a 3-step plan to…”, “Summarize…”).",
  "• Press Enter to send; Shift+Enter for a new line.",
  "• Click ‘Clear Chat’ to reset this session.",
].join("\n");

/* ---------- Safe bold rendering ---------- */
/**
 * Safely render **bold** as <strong>…</strong>.
 * - Escapes HTML first (prevents XSS)
 * - Converts only **...** to <strong>...</strong>
 * - Line breaks are handled by CSS whiteSpace:"pre-wrap"
 */
function safeBoldHTML(text: string): string {
  // Escape HTML
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Convert **bold** to <strong>bold</strong>
  return escaped.replace(/\*\*(.+?)\*\*/g, (_m, p1) => `<strong>${p1}</strong>`);
}

/* ---------- Component ---------- */
export default function App() {
  const [messages, setMessages] = useState<Message[]>([ mk("assistant", GREETING) ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());

  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to bottom on updates
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  /* ---------- Send (streaming via JSON-SSE) ---------- */
  async function sendMessage(): Promise<void> {
    const text = input.trim();
    if (!text || loading) return;

    if (!API_BASE) {
      setMessages((m) => [...m, mk("assistant", "⚠️ VITE_BACKEND_URL is not set in .env")]);
      return;
    }

    // Add user message immediately (snappy UI)
    const base = [...messages, mk("user", text)];
    setMessages(base);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",   // hint for SSE
        },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      // Placeholder assistant bubble to stream into
      let assistantText = "";
      setMessages((m) => [...m, mk("assistant", "")]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      readLoop: while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Each chunk may contain multiple lines
        for (const raw of chunk.split("\n")) {
          const line = raw.trimEnd();
          if (!line.startsWith("data: ")) continue;

          const payload = line.slice("data: ".length);
          let token: string;
          try {
            token = JSON.parse(payload);         // JSON tokens preserve spaces/newlines
          } catch {
            continue;                            // ignore malformed frames safely
          }

          if (token === "[DONE]") {
            setLoading(false);
            break readLoop;
          }

          // Append streamed token exactly as sent (server already sanitized)
          assistantText += token;

          // Update last assistant message live
          setMessages((m) => {
            const copy = m.slice();
            const last = copy.length - 1;
            if (last >= 0 && copy[last].role === "assistant") {
              copy[last] = mk("assistant", assistantText);
            }
            return copy;
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((m) => [...m, mk("assistant", `⚠️ Error: ${msg}`)]);
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Clear session ---------- */
  async function clearChat(): Promise<void> {
    setMessages([mk("assistant", "Chat cleared. What should we tackle next?")]);
    if (!API_BASE) return;
    try {
      await fetch(`${API_BASE}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch { /* non-fatal */ }
  }

  /* ---------- Enter submits; Shift+Enter = newline ---------- */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  /* ---------- Simple, centered layout ---------- */
  const page: React.CSSProperties   = { minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc", padding: "16px" };
  const card: React.CSSProperties   = { width: "100%", maxWidth: "760px", height: "86vh", display: "flex", flexDirection: "column", gap: "12px", background: "#ffffff", borderRadius: "16px", boxShadow: "0 8px 28px rgba(2, 8, 20, 0.06)", padding: "16px" };
  const header: React.CSSProperties = { display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" };
  const subHeader: React.CSSProperties = { fontSize: "12px", color: "#475569" };
  const avatar: React.CSSProperties  = { width: "36px", height: "36px", borderRadius: "9999px" };
  const list: React.CSSProperties    = { flex: 1, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px", background: "#f8fafb", display: "flex", flexDirection: "column", gap: "8px", whiteSpace: "pre-wrap" };
  const inputRow: React.CSSProperties= { display: "flex", gap: "8px" };
  const inputBox: React.CSSProperties= { flex: 1, resize: "none", padding: "10px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", height: "46px", lineHeight: "24px" };
  const sendBtn: React.CSSProperties = { padding: "0 16px", borderRadius: "12px", background: "#2563eb", color: "#ffffff", border: "1px solid #1d4ed8", opacity: loading ? 0.7 : 1, height: "46px" };
  const footer: React.CSSProperties  = { marginTop: "8px", fontSize: "12px", color: "#64748b", display: "flex", justifyContent: "space-between", alignItems: "center" };

  return (
    <div style={page}>
      <div style={card}>
        {/* Header */}
        <div style={header}>
          <img alt="avatar" src="https://i.imgur.com/8Km9tLL.png" style={avatar} />
          <div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              Clarity Coach — Prototype by James Ikahu
            </div>
            <div style={subHeader}>Real-time AI assistant (demo)</div>
          </div>
          <button
            onClick={clearChat}
            style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#f1f5f9" }}
          >
            Clear Chat
          </button>
        </div>

        {/* Messages: assistant LEFT, user RIGHT */}
        <div ref={listRef} style={list}>
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            const row: React.CSSProperties = {
              display: "flex",
              justifyContent: isUser ? "flex-end" : "flex-start",
            };
            const bubble: React.CSSProperties = {
              maxWidth: "78%",
              padding: "10px 14px",
              borderRadius: "16px",
              color: isUser ? "#ffffff" : "#0f172a",
              background: isUser ? "#2563eb" : "#ffffff",
              border: isUser ? "none" : "1px solid #e2e8f0",
              boxShadow: isUser ? "none" : "0 2px 6px rgba(0,0,0,0.05)",
              animation: "msgIn 160ms ease-out",
              whiteSpace: "pre-wrap",
            };

            return (
              <div key={i} style={row}>
                <div className="msg" style={bubble}>
                  {isUser ? (
                    // User text: render as plain text
                    m.content
                  ) : (
                    // Assistant text: render **bold** as <strong>
                    <span dangerouslySetInnerHTML={{ __html: safeBoldHTML(m.content) }} />
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing dots bubble (assistant, left) */}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                className="msg"
                style={{
                  maxWidth: "58%",
                  padding: "10px 14px",
                  borderRadius: "16px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                  animation: "msgIn 160ms ease-out",
                }}
              >
                <span className="typing">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={inputRow}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type your message…"
            style={inputBox}
          />
          <button onClick={() => void sendMessage()} disabled={loading} style={sendBtn}>
            Send
          </button>
        </div>

        {/* Footer */}
        <div style={footer}>
          <span>Early prototype — responses may vary.</span>
          <a href="mailto:jikahu@gmail.com" style={{ textDecoration: "none", color: "#2563eb" }}>
            Contact
          </a>
        </div>
      </div>
    </div>
  );
}


