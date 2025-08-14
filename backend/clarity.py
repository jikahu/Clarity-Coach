# clarity.py  (SSE optimized)
# FastAPI backend for Clarity Coach
# - Non-streaming: POST /chat
# - Streaming: POST /chat_stream and POST /chat/stream (aliases)
# - Faster perceived speed: no-buffer headers + immediate SSE heartbeat
# - In-memory sessions; trimmed history for speed; moderate temperature

import os
import time
from typing import Dict, List, Literal, Optional, Iterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import openai  # openai==0.28.1

# ---------- Config ----------
openai.api_key = os.getenv("OPENAI_API_KEY")
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Keep fewer past turns -> smaller prompt -> faster responses
MAX_HISTORY_MESSAGES = 4

# Lower temperature -> snappier, more deterministic
TEMPERATURE = 0.4

# Stop waiting forever on upstream
REQUEST_TIMEOUT = 20

# CORS: lock to your frontend URL in Render (set FRONTEND_ORIGIN there)
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")

SYSTEM_PROMPT = (
    "You are Clarity Coach, a concise, encouraging assistant. "
    "Answer clearly, step-by-step when asked, and prefer practical guidance."
)

# ---------- App ----------
app = FastAPI(title="Clarity Coach Backend", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN] if FRONTEND_ORIGIN != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Models ----------
Role = Literal["user", "assistant"]

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default"

class ChatResponse(BaseModel):
    reply: str

class ResetRequest(BaseModel):
    session_id: Optional[str] = "default"

# ---------- In-memory store ----------
# session_id -> list[{"role": "user"|"assistant", "content": "..."}]
SESSIONS: Dict[str, List[Dict[str, str]]] = {}

def session_history(session_id: str) -> List[Dict[str, str]]:
    return SESSIONS.setdefault(session_id, [])

# ---------- Routes ----------
@app.get("/")
def root():
    return {"service": "clarity-backend", "ok": True, "docs": "/docs", "health": "/health"}

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}

@app.post("/reset")
def reset(req: ResetRequest):
    SESSIONS[req.session_id or "default"] = []
    return {"ok": True}

@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """Plain (non-streaming) chat for compatibility/testing."""
    if not openai.api_key:
        return ChatResponse(reply="⚠️ Server missing OPENAI_API_KEY.")

    sid = req.session_id or "default"
    hist = session_history(sid)

    hist.append({"role": "user", "content": req.message})
    trimmed = hist[-MAX_HISTORY_MESSAGES:]
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, *trimmed]

    try:
        out = openai.ChatCompletion.create(
            model=MODEL,
            messages=messages,
            temperature=TEMPERATURE,
            max_tokens=256,
            request_timeout=REQUEST_TIMEOUT,
        )
        reply = out["choices"][0]["message"]["content"].strip()
    except Exception as e:
        reply = f"⚠️ Upstream error: {e}"

    hist.append({"role": "assistant", "content": reply})
    SESSIONS[sid] = hist[-MAX_HISTORY_MESSAGES:]
    return ChatResponse(reply=reply)

def _sse_response(gen: Iterator[bytes]) -> StreamingResponse:
    # Headers that discourage buffering anywhere in the path
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # Nginx reverse proxies
    }
    return StreamingResponse(gen, media_type="text/event-stream", headers=headers)

def _chat_stream_impl(req: ChatRequest) -> StreamingResponse:
    if not openai.api_key:
        def err_gen() -> Iterator[bytes]:
            yield b"data: \xE2\x9A\xA0\xEF\xB8\x8F Server missing OPENAI_API_KEY.\n\n"
            yield b"data: [DONE]\n\n"
        return _sse_response(err_gen())

    sid = req.session_id or "default"
    hist = session_history(sid)

    # Append user turn
    hist.append({"role": "user", "content": req.message})
    trimmed = hist[-MAX_HISTORY_MESSAGES:]
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, *trimmed]

    def gen() -> Iterator[bytes]:
        reply_parts: List[str] = []

        # 1) Immediately send an SSE comment heartbeat so the browser starts rendering right away.
        # Lines that start with ":" are SSE comments; your frontend ignores them.
        yield b": heartbeat\n\n"

        try:
            stream = openai.ChatCompletion.create(
                model=MODEL,
                messages=messages,
                temperature=TEMPERATURE,
                max_tokens=256,
                request_timeout=REQUEST_TIMEOUT,
                stream=True,
            )
            last_flush = time.time()

            for chunk in stream:
                delta = chunk["choices"][0]["delta"]
                token = delta.get("content") if delta else None
                if token:
                    reply_parts.append(token)
                    # Send token frame
                    yield f"data: {token}\n\n".encode("utf-8")

                    # Optional: micro-throttle flush to keep small chunks flowing smoothly
                    # (no sleep needed; just ensure we yield frequently)
                    now = time.time()
                    if now - last_flush > 0.1:
                        last_flush = now
                        # yielding already flushes

        except Exception as e:
            yield f"data: ⚠️ Upstream error: {e}\n\n".encode("utf-8")
        finally:
            full = "".join(reply_parts).strip()
            if full:
                hist.append({"role": "assistant", "content": full})
                SESSIONS[sid] = hist[-MAX_HISTORY_MESSAGES:]
            yield b"data: [DONE]\n\n"

    return _sse_response(gen())

# Streaming endpoints (both paths supported)
@app.post("/chat_stream")
def chat_stream(req: ChatRequest):
    return _chat_stream_impl(req)

@app.post("/chat/stream")
def chat_stream_alias(req: ChatRequest):
    return _chat_stream_impl(req)
