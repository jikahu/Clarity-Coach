# clarity.py  (streaming-enabled)
# FastAPI backend for Clarity Coach
# - Uses OpenAI (legacy SDK 0.28.1) via ChatCompletion (normal + streaming)
# - CORS controlled by FRONTEND_ORIGIN
# - In-memory sessions
# - Speed-ups: trim history and lower temperature
# - NEW: /chat_stream streams tokens via text/event-stream (SSE)

import os
from typing import Dict, List, Literal, Optional, Iterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import openai  # openai==0.28.1

# ---------- Configuration ----------
openai.api_key = os.getenv("OPENAI_API_KEY")
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# How many prior turns to keep (smaller = faster/cheaper)
MAX_HISTORY_MESSAGES = 6
# Lower temperature = snappier
TEMPERATURE = 0.4
# Optional timeout (seconds)
REQUEST_TIMEOUT = 20
# CORS: set to your frontend URL on Render; "*" only for testing
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")

SYSTEM_PROMPT = (
    "You are Clarity Coach, a concise, encouraging assistant. "
    "Answer clearly, step-by-step when asked, and prefer practical guidance."
)

# ---------- FastAPI app ----------
app = FastAPI(title="Clarity Coach Backend", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN] if FRONTEND_ORIGIN != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Data models ----------
Role = Literal["user", "assistant"]

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default"

class ChatResponse(BaseModel):
    reply: str

class ResetRequest(BaseModel):
    session_id: Optional[str] = "default"

# ---------- In-memory session store ----------
# session_id -> list[{"role": "user"|"assistant", "content": "..."}]
SESSIONS: Dict[str, List[Dict[str, str]]] = {}

def get_session(session_id: str) -> List[Dict[str, str]]:
    return SESSIONS.setdefault(session_id, [])

# ---------- Routes (non-streaming, unchanged) ----------
@app.get("/")
def root():
    return {"service": "clarity-backend", "ok": True, "docs": "/docs", "health": "/health"}

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}

@app.post("/reset")
def reset_session(req: ResetRequest):
    SESSIONS[req.session_id or "default"] = []
    return {"ok": True}

@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """Plain (non-streaming) chat for compatibility/testing."""
    if not openai.api_key:
        return ChatResponse(reply="⚠️ Server missing OPENAI_API_KEY.")

    session_id = req.session_id or "default"
    history = get_session(session_id)

    history.append({"role": "user", "content": req.message})
    trimmed = history[-MAX_HISTORY_MESSAGES:]

    messages = [{"role": "system", "content": SYSTEM_PROMPT}, *trimmed]

    try:
        completion = openai.ChatCompletion.create(
            model=MODEL,
            messages=messages,
            temperature=TEMPERATURE,
            max_tokens=256,
            request_timeout=REQUEST_TIMEOUT,
        )
        reply = completion["choices"][0]["message"]["content"].strip()
    except Exception as e:
        reply = f"⚠️ Upstream error: {e}"

    history.append({"role": "assistant", "content": reply})
    SESSIONS[session_id] = history[-MAX_HISTORY_MESSAGES:]
    return ChatResponse(reply=reply)

# ---------- NEW: Streaming chat ----------
@app.post("/chat_stream")
def chat_stream(req: ChatRequest):
    """
    Streams tokens as Server-Sent Events (SSE).
    - Request body: {"message": "...", "session_id": "abc"}
    - Response: text/event-stream with lines like "data: token\n\n"
      and a final "data: [DONE]\n\n"
    """
    if not openai.api_key:
        def err_gen() -> Iterator[bytes]:
            yield b"data: \xe2\x9a\xa0\xef\xb8\x8f Server missing OPENAI_API_KEY.\n\n"
            yield b"data: [DONE]\n\n"
        return StreamingResponse(err_gen(), media_type="text/event-stream")

    session_id = req.session_id or "default"
    history = get_session(session_id)

    # Append user
    history.append({"role": "user", "content": req.message})
    trimmed = history[-MAX_HISTORY_MESSAGES:]
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, *trimmed]

    def event_stream() -> Iterator[bytes]:
        reply_accum = []
        try:
            # stream=True yields incremental chunks
            stream = openai.ChatCompletion.create(
                model=MODEL,
                messages=messages,
                temperature=TEMPERATURE,
                max_tokens=256,
                request_timeout=REQUEST_TIMEOUT,
                stream=True,
            )
            for chunk in stream:
                # Each chunk carries a small delta; extract if present
                delta = chunk["choices"][0]["delta"]
                token = delta.get("content") if delta else None
                if token:
                    reply_accum.append(token)
                    # SSE frame: "data: <token>\n\n"
                    yield f"data: {token}\n\n".encode("utf-8")
        except Exception as e:
            yield f"data: ⚠️ Upstream error: {e}\n\n".encode("utf-8")
        finally:
            # Save the assistant's full reply to history
            full_reply = "".join(reply_accum).strip()
            if full_reply:
                history.append({"role": "assistant", "content": full_reply})
                SESSIONS[session_id] = history[-MAX_HISTORY_MESSAGES:]
            # End of stream marker
            yield b"data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


