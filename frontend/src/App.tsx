import { useEffect, useRef, useState } from "react";
import "./App.css";

/** Exact roles allowed */
type Role = "user" | "assistant";

/** One chat message */
interface Message {
  role: Role;
  content: string;
}

/** Backend base URL (from Vite env) */
const API_BASE = import.meta.env.VITE_BACKEND_URL as string | undefined;

/** Helper to create a correctly typed message */
function mk(role: Role, content: string): Message {
  return { role, content };
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    mk("assistant", "Hey! I’m Clarity Coach. How can I help today?"),
  ]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // one session id per tab
  const [sessionId] = useState<string>(() => crypto.randomUUID());

  // autoscroll ref
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  /** Send the user's message to backend */
  async function sendMessage(): Promise<void> {
    const text = input.trim();
    if (!text || loading) return;

    if (!API_BASE) {
      setMessages((m) => [...m, mk("assistant", "⚠️ VITE_BACKEND_URL is not set in .env")]);
      return;
    }

    const next: Message[] = [...messages, mk("user", text)];
    setMessages(next);
    setInput("");
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
      const e = err instanceof Error ? err.message : String(err);
      setMessages([...next, mk("assistant", `⚠️ Error: ${e}`)]);
    } finally {
      setLoading(false);
    }
  }

  /** Clear chat (and ping /reset non-fatally) */
  async function clearChat(): Promise<void> {
    setMessages([mk("assistant", "Cleared! What should we tackle next?")]);
    if (!API_BASE) return;
    try {
      await fetch(`${API_BASE}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch {
      // ignore non-fatal errors
    }
  }

  /** Enter to send (Shift+Enter for newline) */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  // ---- Inline styles kept simple & fully quoted ----
  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f8fafc",
    padding: "16px",
  };

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "720px",
    height: "80vh",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    background: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
    padding: "16px",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    borderBottom: "1px solid #e2e8f0",
    paddingBottom: "8px",
    marginBottom: "8px",
  };

  const avatarStyle: React.CSSProperties = {
    width: "36px",
    height: "36px",
    borderRadius: "9999px",
  };

  const clearBtnStyle: React.CSSProperties = {
    marginLeft: "auto",
    padding: "6px 12px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    background: "#f1f5f9",
  };

  const listStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "12px",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    background: "#f9fafb",
  };

  const inputRowStyle: React.CSSProperties = {
    display: "flex",
    gap: "8px",
    marginTop: "8px",
  };

  const textareaStyle: React.CSSProperties = {
    flex: 1,
    resize: "none",
    padding: "8px 12px",
    borderRadius: "12px 0 0 12px",
    border: "1px solid #cbd5e1",
    height: "44px",
  };

  const sendBtnStyle: React.CSSProperties = {
    padding: "0 16px",
    borderRadius: "0 12px 12px 0",
    background: "#2563eb",
    color: "#ffffff",
    opacity: loading ? 0.6 : 1,
    border: "1px solid #1d4ed8",
    height: "44px",
  };

  return (
    <div style={pageStyle}>
      {/* Chat card */}
      <div style={cardStyle}>
        {/* Header */}
        <header style={headerStyle}>
          <img
            alt="avatar"
            src="https://i.imgur.com/8Km9tLL.png"
            style={avatarStyle}
          />
          <div style={{ fontWeight: 600, color: "#0f172a" }}>Clarity Coach</div>
          <button onClick={clearChat} style={clearBtnStyle}>
            Clear Chat
          </button>
        </header>

        {/* Messages */}
        <div ref={listRef} style={listStyle}>
          {messages.map((m, i) => {
            const bubbleStyle: React.CSSProperties = {
              maxWidth: "80%",
              margin: "8px 0",
              padding: "8px 12px",
              borderRadius: "16px",
              color: m.role === "user" ? "#ffffff" : "#0f172a",
              background: m.role === "user" ? "#2563eb" : "#ffffff",
              border: m.role === "user" ? "none" : "1px solid #e2e8f0",
              marginLeft: m.role === "user" ? "auto" : "0",
              whiteSpace: "pre-wrap",
              boxShadow:
                m.role === "user" ? "none" : "0 1px 2px rgba(0,0,0,0.05)",
            };
            return (
              <div key={i} style={bubbleStyle}>
                {m.content}
              </div>
            );
          })}
          {loading && <div style={{ color: "#64748b" }}>Thinking…</div>}
        </div>

        {/* Input */}
        <div style={inputRowStyle}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type your message…"
            style={textareaStyle}
          />
          <button onClick={() => void sendMessage()} disabled={loading} style={sendBtnStyle}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
