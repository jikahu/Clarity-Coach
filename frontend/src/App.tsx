import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_BACKEND_URL as string | undefined;

type Role = "user" | "assistant";
interface Message { role: Role; content: string; }

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hey! I’m Clarity Coach. How can I help today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [sessionId] = useState(() => crypto.randomUUID());
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    if (!API_BASE) {
      setMessages(m => [...m, { role: "assistant", content: "⚠️ VITE_BACKEND_URL is not set in .env" }]);
      return;
    }

    const next = [...messages, { role: "user", content: text }];
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
      setMessages([...next, { role: "assistant", content: data.reply ?? "(No reply)" }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages([...next, { role: "assistant", content: `⚠️ Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function clearChat() {
    setMessages([{ role: "assistant", content: "Cleared! What should we tackle next?" }]);
    if (!API_BASE) return;
    try {
      await fetch(`${API_BASE}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch {/* non-fatal */}
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4" style={{ gap: 12, background: "#f8fafc" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(255,255,255,0.7)", backdropFilter: "blur(6px)", borderBottom: "1px solid #e2e8f0", padding: "12px 16px", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img alt="avatar" src="https://i.imgur.com/8Km9tLL.png" style={{ width: 36, height: 36, borderRadius: 9999 }} />
          <div style={{ fontWeight: 600, color: "#0f172a" }}>Clarity Coach</div>
          <div style={{ marginLeft: "auto" }}>
            <button onClick={clearChat} style={{ padding: "6px 12px", borderRadius: 10, border: "1px solid #cbd5e1" }}>Clear Chat</button>
          </div>
        </div>
      </header>

      <div ref={listRef} className="border bg-white shadow-sm" style={{ flex: 1, overflowY: "auto", borderRadius: 12, padding: 12 }}>
        {messages.map((m, i) => (
          <div key={i} className="fade-in" style={{
            maxWidth: "80%", margin: "8px 0", padding: "8px 12px", borderRadius: 16,
            color: m.role === "user" ? "#fff" : "#0f172a",
            background: m.role === "user" ? "#2563eb" : "#fff",
            border: m.role === "user" ? "none" : "1px solid #e2e8f0",
            boxShadow: m.role === "user" ? "none" : "0 1px 2px rgba(0,0,0,0.05)",
            marginLeft: m.role === "user" ? "auto" : 0, whiteSpace: "pre-wrap",
          }}>
            {m.content}
          </div>
        ))}
        {loading && <div style={{ color: "#64748b" }}>Thinking…</div>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type your message…"
          style={{ flex: 1, resize: "none", padding: "8px 12px", borderRadius: "12px 0 0 12px", border: "1px solid #cbd5e1", height: 44 }}
        />
        <button
          onClick={() => void sendMessage()}
          disabled={loading}
          style={{ padding: "0 16px", borderRadius: "0 12px 12px 0", background: "#2563eb", color: "#fff", opacity: loading ? 0.6 : 1, border: "1px solid #1d4ed8", height: 44 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

