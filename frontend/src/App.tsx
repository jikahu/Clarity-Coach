import { useEffect, useRef, useState } from "react";
import "./App.css";

/** Exact roles allowed */
type Role = "user" | "assistant";

/** Message shape */
interface Message {
  role: Role;
  content: string;
}

/** Env (Vite) */
const API_BASE = import.meta.env.VITE_BACKEND_URL as string | undefined;

/** Helper: force-cast literals to our Message type */
const asMsg = (role: Role, content: string): Message =>
  ({ role, content } as Message);

export default function App() {
  // Chat state
  const [messages, setMessages] = useState<Message[]>([
    asMsg("assistant", "Hey! I’m Clarity Coach. How can I help today?"),
  ]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // Unique session for backend context
  const [sessionId] = useState<string>(() => crypto.randomUUID());
  const listRef = useRef<HTMLDivElement | null>(null);

  /** Auto-scroll when new messages come in */
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  /** Send a message to backend */
  async function sendMessage(): Promise<void> {
    const text = input.trim();
    if (!text || loading) return;

    if (!API_BASE) {
      setMessages((m) => [
        ...m,
        asMsg("assistant", "⚠️ VITE_BACKEND_URL is not set in .env"),
      ]);
      return;
    }

    const next: Message[] = [...messages, asMsg("user", text)];
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
      setMessages([
        ...next,
        asMsg("assistant", data.reply ?? "(No reply from backend)"),
      ]);
    } catch (err: unknown) {
      const e = err instanceof Error ? err.message : String(err);
      setMessages([...next, asMsg("assistant", `⚠️ Error: ${e}`)]);
    } finally {
      setLoading(false);
    }
  }

  /** Reset messages and backend context */
  async function clearChat(): Promise<void> {
    setMessages([asMsg("assistant", "Cleared! What should we tackle next?")]);
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

  /** Enter key sends message unless Shift+Enter */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    // Outer wrapper to center chat both vertically & horizontally
    <div
      className="flex items-center justify-center h-screen w-screen"
      style={{ background: "#f8fafc" }}
    >
      {/* Chat container */}
      <div
        className="flex flex-col w-full max-w-2xl h-[90vh] p-4"
        style={{
          gap: 12,
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        }}
      >
        {/* Header */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(6px)",
            borderBottom: "1px solid #e2e8f0",
            padding: "12px 16px",
            borderRadius: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              alt="avatar"
              src="https://i.imgur.com/8Km9tLL.png"
              style={{ width: 36, height: 36, borderRadius: 9999 }}
            />
            <div style={{ fontWeight: 600, color: "#0f172a" }}>
              Clarity Coach — Demo by James Ikahu
            </div>
            <div style={{ marginLeft: "auto" }}>
              <button
                onClick={clearChat}
                style={{
                  padding: "6px 12px",
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                }}
              >
                Clear Chat
              </button>
            </div>
          </div>
        </header>

        {/* Chat messages */}
        <div
          ref={listRef}
          className="border bg-white shadow-sm flex-1"
          style={{
            overflowY: "auto",
            borderRadius: 12,
            padding: 12,
          }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className="fade-in"
              style={{
                maxWidth: "80%",
                margin: "8px auto", // Center bubbles horizontally
                padding: "8px 12px",
                borderRadius: 16,
                color: m.role === "user" ? "#fff" : "#0f172a",
                background: m.role === "user" ? "#2563eb" : "#fff",
                border: m.role === "user" ? "none" : "1px solid #e2e8f0",
                boxShadow:
                  m.role === "user"
                    ? "none"
                    : "0 1px 2px rgba(0,0,0,0.05)",
                whiteSpace: "pre-wrap",
                textAlign: "center",
              }}
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div style={{ color: "#64748b", textAlign: "center" }}>
              Thinking…
            </div>
          )}
        </div>

        {/* Input area */}
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type your message…"
            style={{
              flex: 1,
              resize: "none",
              padding: "8px 12px",
              borderRadius: "12px 0 0 12px",
              border: "1px solid #cbd5e1",
              height: 44,
            }}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={loading}
            style={{
              padding: "0 16px",
              borderRadius: "0 12px 12px 0",
              background: "#2563eb",
              color: "#fff",
              opacity: loading ? 0.6 : 1,
              border: "1px solid #1d4ed8",
              height: 44,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

