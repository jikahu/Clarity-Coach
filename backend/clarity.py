# clarity.py — FastAPI backend (stable on Python 3.13 with openai==0.28.1)
# Endpoints:
#   GET  /health  -> quick liveness check
#   POST /reset   -> clear server memory for a session_id
#   POST /chat    -> relay to OpenAI ChatCompletion with per-session memory

import os
import logging
from typing import Dict, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Legacy OpenAI SDK (no jiter)
import openai

logger = logging.getLogger("uvicorn")

app = FastAPI(title="Clarity Coach Lite API", version="0.2.0")

@app.get("/")
def root():
    return {"service": "clarity-backend", "ok": True, "docs": "/docs", "health": "/health"}


# Simple in-memory session store:
# { session_id: [ {"role": "user"/"assistant", "content": "..."} , ... ] }
SESSIONS: Dict[str, List[Dict[str, str]]] = {}

# --- Environment configuration ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
# Use your preferred chat-capable model here; gpt-4o-mini works behind the compatibility layer
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")

# Configure legacy SDK
openai.api_key = OPENAI_API_KEY

# --- CORS (relax for dev; lock to your frontend URL in prod) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN] if FRONTEND_ORIGIN != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Assistant behavior (centralized so you can tune it later)
SYSTEM_PROMPT = (
    "You are Clarity Coach: concise, friendly, and practical. "
    "Prefer step-by-step when teaching, avoid fluff, and give actionable next steps."
)

# --- Schemas ---
class ChatIn(BaseModel):
    message: str
    session_id: str

class ChatOut(BaseModel):
    reply: str

class ResetIn(BaseModel):
    session_id: str

# --- Routes ---
@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}

@app.post("/reset")
def reset(payload: ResetIn):
    SESSIONS.pop(payload.session_id, None)
    return {"status": "cleared"}

@app.post("/chat", response_model=ChatOut)
def chat(payload: ChatIn):
    if not openai.api_key:
        logger.error("OPENAI_API_KEY is not set")
        return {"reply": "Server is missing OPENAI_API_KEY."}

    # Retrieve prior turns for this session
    history = SESSIONS.setdefault(payload.session_id, [])

    # Construct messages for the model
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history + [
        {"role": "user", "content": payload.message}
    ]

    try:
        # Legacy ChatCompletion call (no jiter)
        completion = openai.ChatCompletion.create(
            model=MODEL,
            messages=messages,
            temperature=0.4,
        )
        reply = completion["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.exception("OpenAI error: %s", e)
        reply = f"I hit an upstream error: {e}."

    # Persist the new turn pair
    history.append({"role": "user", "content": payload.message})
    history.append({"role": "assistant", "content": reply})

    # Trim memory to last N turns to avoid unbounded growth
    if len(history) > 40:
        SESSIONS[payload.session_id] = history[-40:]

    return {"reply": reply}
