# Zeno CRM

An AI-native, premium B2B Campaign CRM platform featuring an interactive AI Copilot, parameterized SQL compilation, live WebSockets-based delivery telemetry, and fault-tolerant bulk data ingestion.

---

## 🚀 Key Features

* **Interactive AI Copilot**: Speak in plain English (e.g., *"Find VIP customers who spent over 10,000 rupees and send them a WhatsApp message"*) to automatically generate structured segment rules, compile optimized database queries, and draft custom messaging templates.
* **Live Telemetry & Funnel Analytics**: Follow campaign delivery status updates (Sent ➜ Delivered ➜ Read ➜ Clicked ➜ Converted) real-time in the dashboard, powered by local WebSocket streams.
* **Fault-Tolerant CSV Import**:
  * **Customers**: Robust duplication checks on email fields.
  * **Orders**: Integrity checks that automatically filter out invalid customer IDs prior to bulk insert, preventing PostgreSQL foreign key violations.
* **Monorepo Architecture**: Segregated folders for Frontend, Backend API, and a simulated Channel Service dispatch helper.

---

## 🛠 Tech Stack

* **Frontend**: React (Vite), TailwindCSS, Recharts (delivery funnels & channel mix), Lucide React, WebSockets.
* **Backend**: FastAPI, SQLAlchemy (Async), PostgreSQL (asyncpg), Pydantic v2 validation.
* **AI Engine**: Google Gemini API via structured JSON schema parsing.
* **Channel Service**: FastAPI background worker simulating messaging pipelines (WhatsApp, SMS, Email, RCS).

---

## 📂 Project Structure

```
├── backend/           # FastAPI application & DB models
├── frontend/          # React (Vite) user interface
├── channel-service/   # Messaging simulator stub service
├── database/          # SQL database schemas
├── render.yaml        # Render backend deployment config
├── requirements.txt   # Combined Python requirements
└── .gitignore         # Clean repository exclusions
```

---

## ⚙️ Local Setup & Configuration

### 1. Database Setup
Create a PostgreSQL instance (e.g., Neon DB or Supabase) and initialize the tables using:
```bash
psql -h <host> -U <user> -d <database> -f database/schema.sql
```

### 2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Copy `.env.example` to `.env` and configure your credentials:
   ```env
   DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:5432/<database>
   GEMINI_API_KEY=your-gemini-api-key
   CHANNEL_SERVICE_URL=http://localhost:8001
   CRM_CALLBACK_URL=http://localhost:8000
   FRONTEND_URL=http://localhost:5173
   ```
3. Create a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate  # venv\Scripts\activate on Windows
   pip install -r requirements.txt
   ```
4. Seed mock customer data:
   ```bash
   python scripts/seed.py
   ```
5. Start the API server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### 3. Channel Service Setup
1. Navigate to the channel-service directory:
   ```bash
   cd channel-service
   ```
2. Start the simulator:
   ```bash
   uvicorn main:app --port 8001
   ```

### 4. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure frontend environment in `.env`:
   ```env
   VITE_API_BASE=http://localhost:8000
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## ☁️ Deployment Configurations

This repository is ready for instant cloud deployment:

* **Backend & Channel Service (Railway/Render)**: Configured in `render.yaml` or directly deployed on Railway.
* **Frontend (Vercel)**: Configured in `frontend/vercel.json`. Utilizes rewrite proxies to bypass CORS when routing `/api/*` requests to the Railway backend.
