# AUIV Tracker — Full-Stack Sprint Manager

A brutalist-themed Expo Router + FastAPI app for tracking the 6-week AUIV Simulator project.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Expo Router 3.5, React Native 0.74, TypeScript |
| Backend | FastAPI 0.111, Motor (async MongoDB), Python 3.12 |
| AI | Anthropic API — your own key, sent per-request |
| DB | MongoDB (local or Atlas) |
| State | Zustand (frontend), MongoDB (backend) |

---

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
# Edit .env: set MONGO_URL if not localhost
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend runs at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm install zustand  # state management
npx expo start
```

Scan QR with Expo Go (iOS/Android). Or press `w` for web.

### 3. First Launch

- App auto-creates your device ID and seeds all 34 tasks via `/api/project/init`
- Go to **Settings → API Key** to add your Anthropic key (from console.anthropic.com)
- Go to **Settings → Backend URL** if your backend isn't on localhost

---

## Project Structure

```
auiv-app/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + CORS
│   │   ├── db.py                # Motor MongoDB connection
│   │   ├── models/
│   │   │   ├── models.py        # Pydantic schemas
│   │   │   └── seed_data.py     # 6 weeks, 34 tasks, checklist items
│   │   └── routes/
│   │       ├── project.py       # GET/POST /api/project
│   │       ├── tasks.py         # CRUD /api/tasks
│   │       ├── daily_logs.py    # CRUD /api/daily-logs
│   │       └── ai.py            # POST /api/ai/evaluate + /suggest-subtasks
│   ├── requirements.txt
│   └── .env
└── frontend/
    ├── app/
    │   ├── _layout.tsx          # Root layout + boot sequence
    │   ├── (tabs)/
    │   │   ├── _layout.tsx      # Tab bar
    │   │   ├── index.tsx        # Overview tab
    │   │   ├── sprint.tsx       # Sprint tab (week selector + tasks)
    │   │   ├── daily.tsx        # Daily standup + AI eval
    │   │   └── settings.tsx     # API key + backend URL + install guide
    │   └── task/
    │       └── [id].tsx         # Task detail: edit, notes, subtasks, history
    ├── components/
    │   └── ui.tsx               # Brutalist design system components
    ├── constants/
    │   └── theme.ts             # Colors, fonts, spacing tokens
    └── lib/
        ├── api.ts               # All backend API calls
        └── store.ts             # Zustand state + derived helpers
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/project/init` | Seed device with 34 tasks (idempotent) |
| GET | `/api/project/charter/{device_id}` | Get project charter + week structure |
| GET | `/api/tasks/{device_id}` | All tasks for device |
| GET | `/api/tasks/{device_id}/week/{n}` | Tasks for specific week |
| POST | `/api/tasks/` | Create custom task |
| PATCH | `/api/tasks/{id}` | Update task (status, notes, title, etc.) |
| DELETE | `/api/tasks/{id}` | Delete task |
| PATCH | `/api/tasks/{id}/subtasks` | Set AI subtask list |
| GET | `/api/daily-logs/{device_id}` | All logs |
| GET | `/api/daily-logs/{device_id}/date/{date}` | Log for specific date |
| POST | `/api/daily-logs/` | Create or update today's log |
| PATCH | `/api/daily-logs/{id}` | Patch log (add ai_eval) |
| POST | `/api/ai/evaluate` | AI standup evaluation |
| POST | `/api/ai/suggest-subtasks` | AI subtask suggestions |

---

## Design System

Brutalist theme: `white / black / #FF3D00 orange`. Zero border radius. 1.5pt borders. Monospace metrics.

Key components in `frontend/components/ui.tsx`:
- `BrutalBox` — bordered surface card
- `BrutalBtn` — solid/outline button, 48px tap target
- `MetricBlock` — mono number + label grid cell
- `BrutalBar` — horizontal progress bar
- `CheckRow` — 52px tall checklist item
- `StatusCycleBtn` — tap to cycle todo → inprogress → done → blocked
- `TagPill` — bordered status badge

---

## Deploying the Backend

**Render (free tier):**
1. Push `backend/` to GitHub
2. New Web Service → Python → `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Add env vars: `MONGO_URL` (from MongoDB Atlas), `DB_NAME=auiv_tracker`
4. In Settings → Backend URL, set your Render URL

**MongoDB Atlas (free):**
1. Create free cluster at mongodb.com/atlas
2. Add connection string to `MONGO_URL` env var

---

## Installing on Your Phone (Standalone)

**Automatic (Android):** every push to `main` that touches `frontend/` kicks off
an EAS preview build via `.github/workflows/build-android.yml`. Once it
finishes, `.github/workflows/eas-build-watch.yml` publishes a GitHub Release
with the `.apk` download link — check the repo's **Releases** page. If the
build hasn't finished within 24h, a Release with the manual build-page link
is posted instead. One-time setup (see the workflow file's header comment):
link the Expo project with `npx eas-cli init` and add an `EXPO_TOKEN` repo
secret.

**Manual:**
```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# Build for Android (APK)
cd frontend
eas build --platform android --profile preview

# Build for iOS (requires Apple Dev account)
eas build --platform ios
```

Or for local development, just use **Expo Go** — scan the QR from `npx expo start`.
