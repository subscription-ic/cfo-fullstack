# CFO Intelligence Platform

AI-powered earnings call preparation tool — FastAPI backend + React/Vite frontend.

---

## Project Structure

```
cfo-fullstack/
├── cfo-backend/     # FastAPI + Supabase + OpenAI (embeddings / LLM)
└── cfo-frontend/    # React + Vite + Tailwind
```

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- Supabase project with `predicted_qa` table (existing data path)
- OpenAI API key (for `POST /upload` embeddings and `POST /question-generation`)

---

## Backend (FastAPI)

### 1. Environment

Copy [cfo-backend/.env.example](cfo-backend/.env.example) to `cfo-backend/.env` and set at least:

- `SUPABASE_URL`, `SUPABASE_KEY` (service role recommended for Storage + inserts)
- `JWT_SECRET` (any strong string in production)
- `OPENAI_API_KEY`
- Optional: `DATABASE_URL` (Postgres URI) to run SQL migrations from the CLI

### 2. Database schema and storage

Apply [cfo-backend/migrations/001_initial.sql](cfo-backend/migrations/001_initial.sql) in the Supabase SQL editor (enable the **vector** extension if prompted), **or** with `DATABASE_URL` set:

```bash
cd cfo-backend
python -m app.bootstrap.run_init
```

That command also tries to create the Storage bucket named in `STORAGE_BUCKET` (default `company-docs`).

### 3. Install and run

```bash
cd cfo-backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

`uvicorn main:app` still works: [cfo-backend/main.py](cfo-backend/main.py) re-exports the app.

- API: http://localhost:8000  
- OpenAPI: http://localhost:8000/docs  

---

## Frontend (React + Vite)

### 1. Optional API URL

Copy [cfo-frontend/.env.example](cfo-frontend/.env.example) to `cfo-frontend/.env` and set `VITE_API_BASE_URL` if the API is not on `http://localhost:8000`.

### 2. Install and run

```bash
cd cfo-frontend
npm install
npm run dev
```

- App: http://localhost:5173  

Sign in with the API’s dev credentials (default `admin` / `admin`). Admin **Upload documents** calls `POST /upload`; **Generate questions (LLM)** calls `POST /question-generation`.

---

## Running both together

**Terminal 1 — backend:** `cd cfo-backend` then `python -m uvicorn app.main:app --reload --port 8000`  

**Terminal 2 — frontend:** `cd cfo-frontend` then `npm run dev`

---

## API endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | No | Health check |
| POST | `/login` | No | Dev login; returns JWT (`admin` / `admin` by default) |
| POST | `/upload` | Bearer | Multipart: `files` + form field `metadata` (JSON array per file: `company`, `fiscal_year`, `quarter`, `document_type`, `source_category`) |
| POST | `/question-generation` | Bearer | JSON body: `company`, optional window/filters, `persist`, `num_questions` |
| GET | `/api/predicted-questions` | No | List predicted Q&A (optional `?company=`) |
| GET | `/api/predicted-questions/{id}` | No | Single row |
| GET | `/api/companies` | No | Distinct companies from `predicted_qa` |

---

## Quick validation

1. `POST /login` with `{"username":"admin","password":"admin"}` — expect `access_token`.  
2. `POST /upload` with `Authorization: Bearer <token>`, at least one PDF/TXT file, and matching `metadata` JSON array.  
3. `POST /question-generation` with Bearer token and `{"company":"YourCompany","persist":false,"num_questions":3}` (requires OpenAI and optional RAG tables).  
4. `GET /api/predicted-questions` — lists rows from Supabase.
