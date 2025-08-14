# clarity.py  (SSE with JSON payloads to preserve newlines)
import os, time, json
from typing import Dict, List, Literal, Optional, Iterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import openai  # openai==0.28.1

openai.api_key = os.getenv("OPENAI_API_KEY")
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

MAX_HISTORY_MESSAGES = 4
TEMPERATURE = 0.4
REQUEST_TIMEOUT = 20
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")

SYSTEM_PROMPT = (
    "You are Clarity Coach, a concise, encouraging assistant. "
    "Answer clearly, step-by-step when asked, and prefer practical guidance."
)

app = FastAPI(title="Clarity Coach Backend", version="1.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN] if FRONTEND_ORIGIN != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Role = Literal["user", "assistant"]

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default"

class ChatResponse(BaseModel):
    reply: str

class ResetRequest(BaseModel):
    session_id: Optional[str] = "default"

SESSIONS: Dict[str, List[Dict[str, str]]] = {}

def session_history(session_id: str) -> List[Dict[str, str]]:
    return SESSIONS.setdefault(session_id, [])

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
        reply = out["choices"][0]["message"]["content"]
    except Exception as e:
        reply = f"⚠️ Upstream error: {e}"
    hist.append({"role": "assistant", "content": reply})
    SESSIONS[sid] = hist[-MAX_HISTORY_MESSAGES:]
    return ChatResponse(reply=reply)

def _sse_response(gen: Iterator[bytes]) -> StreamingResponse:
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(gen, media_type="text/event-stream", headers=headers)

def _chat_stream_impl(req: ChatRequest) -> StreamingResponse:
    if not openai.api_key:
        def err_gen() -> Iterator[bytes]:
            yield b"data: \"\\u26a0\\ufe0f Server missing OPENAI_API_KEY.\"\n\n"
            yield b"data: \"[DONE]\"\n\n"
        return _sse_response(err_gen())

    sid = req.session_id or "default"
    hist = session_history(sid)
    hist.append({"role": "user", "content": req.message})
    trimmed = hist[-MAX_HISTORY_MESSAGES:]
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, *trimmed]

    def gen() -> Iterator[bytes]:
        parts: List[str] = []
        # Immediate heartbeat so browsers render right away (comment line)
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
            for chunk in stream:
                delta = chunk["choices"][0].get("delta") or {}
                token = delta.get("content")
                if token is not None:
                    parts.append(token)
                    # JSON-encode the token so \n and Unicode are preserved
                    payload = json.dumps(token, ensure_ascii=False)
                    yield f"data: {payload}\n\n".encode("utf-8")
        except Exception as e:
            payload = json.dumps(f"⚠️ Upstream error: {e}", ensure_ascii=False)
            yield f"data: {payload}\n\n".encode("utf-8")
        finally:
            full = "".join(parts)
            if full:
                hist.append({"role": "assistant", "content": full})
                SESSIONS[sid] = hist[-MAX_HISTORY_MESSAGES:]
            # End marker as JSON too (frontend still checks string equality)
            yield b"data: \"[DONE]\"\n\n"

    return _sse_response(gen())

@app.post("/chat_stream")
def chat_stream(req: ChatRequest):
    return _chat_stream_impl(req)

@app.post("/chat/stream")
def chat_stream_alias(req: ChatRequest):
    return _chat_stream_impl(req)

