# clarity.py
# Fast, simple FastAPI backend for Clarity Coach
# - Uses OpenAI (legacy SDK 0.28.1) via ChatCompletion
# - CORS controlled by FRONTEND_ORIGIN
# - In-memory sessions
# - Speed-ups: trim history and lower temperature

import os
from typing import Dict, List, Literal, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import openai  # openai==0.28.1

# ---------- Configuration ----------
openai.api_key = os.getenv("OPENAI_API_KEY")
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# How many prior turns to keep (smaller = faster/cheaper)
MAX_HISTORY_MESSAGES = 6

# Lower temperature = snappier, more deterministic
TEMPERATURE = 0.4

# Optional request timeout to avoid long waits (seconds)
REQUEST_TIMEOUT = 20

# Allow only your frontend origin (set in Render)
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")

# System prompt to set behavior/tone
SYSTEM_PROMPT = (
    "You are Clarity Coach, a concise, encouraging assistant. "
    "Answer clearly, step-by-step when asked, and prefer practical guidance."
)

# ---------- FastAPI app ----------
app = FastAPI(title="Clarity Coach Backend", version="1.0.0")

# CORS
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
    """Return the history list for a session, creating it if missing."""
    return SESSIONS.setdefault(session_id, [])


# ---------- Routes ----------
@app.get("/")
def root():
    """Friendly root so you don’t see 404 at /"""
    return {"service": "clarity-backend", "ok": True, "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    """Simple liveness + model check"""
    return {"status": "ok", "model": MODEL}


@app.post("/reset")
def reset_session(req: ResetRequest):
    """Clear a session's history."""
    SESSIONS[req.session_id or "default"] = []
    return {"ok": True}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """
    Main chat endpoint.
    - Appends the user's message
    - Trims history to speed up responses
    - Calls OpenAI and returns assistant reply
    """
    if not openai.api_key:
        return ChatResponse(reply="⚠️ Server missing OPENAI_API_KEY.")

    session_id = req.session_id or "default"
    history = get_session(session_id)

    # Append user message
    history.append({"role": "user", "content": req.message})

    # Trim to the last N messages for speed
    trimmed_history = history[-MAX_HISTORY_MESSAGES :]

    # Build messages array with a system prompt up front
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, *trimmed_history]

    # Call OpenAI (legacy SDK 0.28.1)
    try:
        completion = openai.ChatCompletion.create(
            model=MODEL,
            messages=messages,
            temperature=TEMPERATURE,
            max_tokens=256,          # cap output length a bit
            request_timeout=REQUEST_TIMEOUT,
        )
        reply = completion["choices"][0]["message"]["content"].strip()
    except Exception as e:
        # Return error as assistant text so UI shows it gracefully
        reply = f"⚠️ Upstream error: {e}"

    # Append assistant response to session history (trim again for safety)
    history.append({"role": "assistant", "content": reply})
    SESSIONS[session_id] = history[-MAX_HISTORY_MESSAGES:]

    return ChatResponse(reply=reply)

