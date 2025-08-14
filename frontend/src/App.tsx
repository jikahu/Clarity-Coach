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
  const [messages, setMessages] = useState<Message[]>([
    asMsg("assistant", "Hey! I’m Clarity Coach. How can I help today?"),
  ]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const [sessionId] = useState<string>(() => crypto.randomUUID());
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to bottom when messages change
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

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

    // Add user message
    const next: Message[] = [...messages, asMsg("user", text)];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      // Add placeholder assistant message for streaming updates
      setMessages((m) => [...m, asMsg("assistant", "")]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          const prefix = "data: ";
          if (!line.startsWith(prefix)) continue;

          const payload = line.slice(prefix.length);

          // Only trim for checking [DONE]
          if (payload.trim() === "[DONE]") {
            setLoading(false);
            break;
          }

          // Preserve spaces — no .trim() here
          assistantText += payload;

          // Update the last assistant message as new text arrives
          setMessages((m) => {
            const copy = [...m];
            const lastIdx = copy.length - 1;
            if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
              copy[lastIdx] = { role: "assistant", content: assistantText };
            }
            return copy;
          });
        }
      }
    } catch (err: unknown) {
      const e = err instanceof Error ? err.message : String(err);
      setMessages([...next, asMsg("assistant", `⚠️ Error: ${e}`)]);
    } finally {
      setLoading(false);
    }
  }

  async function clearChat(): Promise<void> {
    setMessages([asMsg("assistant", "Cleared! What should we tackle next?")]);
    if (!API_BASE) return;
    try {
      await fetch(`${API_BASE}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch {/* ignore */}
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div
      className="flex flex-col h-screen items-center justify-center p-4"
      style={{ gap: 12, background: "#f8fafc" }}
    >
      <div className="w-full max-w-2xl flex flex-col h-full">
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
              Clarity Coach
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

        {/* Messages */}
        <div
          ref={listRef}
          className="border bg-white shadow-sm"
          style={{
            flex: 1,
            overflowY: "auto",
            borderRadius: 12,
            padding: 12,
            marginTop: 12,
          }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className="fade-in"
              style={{
                display: "flex",
                justifyContent:
                  m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "80%",
                  margin: "4px 0",
                  padding: "8px 12px",
                  borderRadius: 16,
                  color: m.role === "user" ? "#fff" : "#0f172a",
                  background: m.role === "user" ? "#2563eb" : "#f1f5f9",
                  border:
                    m.role === "user" ? "none" : "1px solid #e2e8f0",
                  boxShadow:
                    m.role === "user"
                      ? "none"
                      : "0 1px 2px rgba(0,0,0,0.05)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ color: "#64748b", marginTop: 4 }}>⏳ Thinking...</div>
          )}
        </div>

        {/* Input */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
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




