# CFO Intelligence Platform

AI-powered earnings call preparation tool — FastAPI backend + React/Vite frontend.

---

## Project Structure

```
cfo-fullstack/
├── cfo-backend/     # FastAPI + Supabase
└── cfo-frontend/    # React + Vite + Tailwind
```

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- A Supabase project with a `predicted_qa` table

---

## Backend (FastAPI)

### 1. Set up environment

Create `cfo-backend/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-or-service-role-key
```

### 2. Install dependencies

```bash
cd cfo-backend
pip install fastapi uvicorn supabase python-dotenv
```

### 3. Run

```bash
uvicorn main:app --reload --port 8000
```

- API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs

---

## Frontend (React + Vite)

### 1. Install dependencies

```bash
cd cfo-frontend
npm install
```

### 2. Run

```bash
npm run dev
```

- App: http://localhost:5173

> The frontend expects the backend running on port `8000`.

---

## Running Both Together

Open two terminals:

**Terminal 1 — Backend:**
```bash
cd cfo-backend
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd cfo-frontend
npm run dev
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/api/predicted-questions` | All predicted Q&A |
| GET | `/api/predicted-questions?company=HDFC` | Filter by company |
| GET | `/api/predicted-questions/{id}` | Single question |
| GET | `/api/companies` | Distinct company list |
