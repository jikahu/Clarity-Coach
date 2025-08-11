# Clarity Coach

frontend/ — Vite + React + TypeScript
backend/  — FastAPI + OpenAI (legacy SDK pinned for Python 3.13)

Local dev:
Backend:
  cd backend
  .\venv\Scripts\Activate.ps1
  $env:OPENAI_API_KEY="sk-..."; uvicorn clarity:app --host 0.0.0.0 --port 8000
Frontend:
  cd frontend
  npm install
  npm run dev
