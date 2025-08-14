import { useEffect, useRef, useState } from "react";
import "./App.css";

/** Exact roles allowed */
type Role = "user" | "assistant";

/** Message shape */
interface Message {
  role: Role;
  content: string;
}

/** Backend URL (from Vite env) */
const API_BASE = import.meta.env.VITE_BACKEND_URL as string | undefined;

/** Strongly-typed helper to create messages */
const mk = (role: Role, content: string): Message => ({ role, content });

export default function App() {
  // Initial greeting for recruiters
  const [messages, setMessages] = useState<Message[]>([
    mk(
      "assistant",
      "Welcome to the Clarity Coach demo. Ask anything and I’ll respond clearly and quickly."
    ),
  ]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // One session id per tab to preserve context
  const [sessionId] = useState<string>(() => crypto.randomUUID());

  // Auto-scroll to the latest message / indicator
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  /** Send message to backend with instant typing indicator (faster perceived speed) */
  async function sendMessage(): Promise<void> {
    const text = input.trim();
    if (!text || loading) return;

    if (!API_BASE) {
      setMessages((m) => [...m, mk("assistant", "⚠️ VITE_BACKEND_URL is not set in .env")]);
      return;
    }

    // Show user's message immediately
    const next = [...messages, mk("user", text)];
    setMessages(next);
    setInput("");

    // Show typing indicator immediately for snappier UX
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: { reply?: string } = await res.json();
      setMessages([...next, mk("assistant", data.reply ?? "(No reply)")]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages([...next, mk("assistant", `⚠️ Error: ${msg}`)]);
    } finally {
      setLoading(false);
    }
  }

  /** Clear chat UI and (optionally) reset server session */
  async function clearChat(): Promise<void> {
    setMessages([mk("assistant", "Chat cleared. What should we tackle next?")]);
    if (!API_BASE) return;
    try {
      await fetch(`${API_BASE}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch {
      /* non-fatal */
    }
  }

  /** Enter sends, Shift+Enter makes new line */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  // ---- Inline styles (all strings to keep TS/esbuild happy) ----
  const page: React.CSSProperties = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f8fafc",
    padding: "16px",
  };

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: "760px",
    height: "86vh",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    background: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 8px 28px rgba(2, 8, 20, 0.06)",
    padding: "16px",
  };

  const header: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    borderBottom: "1px solid #e2e8f0",
    paddingBottom: "8px",
  };

  const avatar: React.CSSProperties = {
    width: "36px",
    height: "36px",
    borderRadius: "9999px",
  };

  const list: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "12px",
    background: "#f8fafb",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  };

  const inputRow: React.CSSProperties = { display: "flex", gap: "8px" };

  const inputBox: React.CSSProperties = {
    flex: 1,
    resize: "none",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    height: "46px",
    lineHeight: "24px",
  };

  const sendBtn: React.CSSProperties = {
    padding: "0 16px",
    borderRadius: "12px",
    background: "#2563eb",
    color: "#ffffff",
    border: "1px solid #1d4ed8",
    opacity: loading ? 0.7 : 1,
    height: "46px",
  };

  return (
    <div style={page}>
      <div style={card}>
        {/* Top bar */}
        <div style={header}>
          <img alt="avatar" src="https://i.imgur.com/8Km9tLL.png" style={avatar} />
          <div style={{ fontWeight: 700, color: "#0f172a" }}>Clarity Coach — Demo by James Ikahu</div>
          <button
            onClick={clearChat}
            style={{
              marginLeft: "auto",
              padding: "6px 12px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              background: "#f1f5f9",
            }}
          >
            Clear Chat
          </button>
        </div>

        {/* Messages */}
        <div ref={listRef} style={list}>
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            const bubble: React.CSSProperties = {
              maxWidth: "78%",
              padding: "10px 14px",
              borderRadius: "16px",
              color: isUser ? "#ffffff" : "#0f172a",
              background: isUser ? "#2563eb" : "#ffffff",
              border: isUser ? "none" : "1px solid #e2e8f0",
              boxShadow: isUser ? "none" : "0 2px 6px rgba(0,0,0,0.05)",
              whiteSpace: "pre-wrap",
              alignSelf: isUser ? "flex-end" : "flex-start",
              animation: "msgIn 160ms ease-out",
            };
            return (
              <div key={i} className="msg" style={bubble}>
                {m.content}
              </div>
            );
          })}

          {/* Typing indicator bubble (assistant, left) */}
          {loading && (
            <div
              className="msg"
              style={{
                maxWidth: "58%",
                padding: "10px 14px",
                borderRadius: "16px",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                alignSelf: "flex-start",
                animation: "msgIn 160ms ease-out",
              }}
            >
              <span className="typing">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </span>
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
      </div>
    </div>
  );
}


