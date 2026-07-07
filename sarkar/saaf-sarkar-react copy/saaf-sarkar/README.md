# Saaf Sarkar — React Frontend 🧹

A React + TypeScript + Vite rewrite of the Saaf Sarkar civic pollution
reporting app, wired to talk to your existing FastAPI backend.

## What's here

- **Citizen flow**: phone OTP login → live map with bottom-sheet report
  form (category, photo, note) → track your reports
- **Municipal flow**: employee login → triage dashboard with map +
  severity-sorted queue → detail sheet (status updates, evidence photos,
  before/after verification upload)
- Every API call matches your FastAPI routes field-for-field — see
  `src/api/client.ts`

## Requirements

- Node.js 18+ and npm
- Your FastAPI backend running and reachable (see below)

## Setup

```bash
npm install
npm run dev
```

Open **http://localhost:5173**.

## ⚠️ Before this will actually work: start your backend

This frontend does not include your FastAPI backend — it's a client for
it. You need your backend running separately:

```bash
# in your backend project directory
uvicorn app.main:app --reload
```

By default this frontend expects your backend at `http://localhost:8000`
(matching what your backend's `main.py` runs on by default). If your
backend runs elsewhere — a different port, Docker, a deployed URL — copy
`.env.example` to `.env` and set `VITE_API_BASE` accordingly:

```bash
cp .env.example .env
# then edit .env:
# VITE_API_BASE=http://localhost:8000
```

**CORS**: your `main.py` already has `allow_origins=["*"]`, so no changes
needed there.

## Backend config you may still need

Looking at your `config.py`, these environment variables affect behavior
but aren't required for the app to *run* — they control whether features
use real services or safe fallbacks:

| Variable | If unset |
|---|---|
| `GEMINI_API_KEY` | Classification/verification falls back to mock mode (random category assignment, auto-"verified" on cleanup photos) — the app still works end-to-end, just not with real AI classification |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SERVICE_SID` | OTP login accepts code `123456` as a simulated pass-through instead of sending real SMS |
| `TWILIO_PHONE_NUMBER` | Resolution SMS notifications to citizens are skipped (logged, not sent) |

None of these block you from running and demoing the app — they just
determine whether you're seeing real AI/SMS or the built-in hackathon
fallback your backend already handles gracefully.

## Project structure

```
src/
  api/client.ts          — every backend call, typed
  types/                 — TS types mirroring your Pydantic schemas
  context/                — session (role/phone) + toast providers
  hooks/useGeo.ts         — geolocation + live position watching
  components/             — Button, Card, tags, Leaflet map helpers
  pages/
    Landing.tsx            — role picker
    CitizenLogin.tsx        — phone + OTP
    CitizenReport.tsx       — map + report bottom sheet
    CitizenTrack.tsx        — report list
    MunicipalLogin.tsx      — employee ID + department
    MunicipalDashboard.tsx  — triage queue + detail sheet
```

## Build for production

```bash
npm run build
```

Output goes to `dist/` — deploy this as a static site (Vercel, Netlify,
`nginx`, etc), pointed at your deployed backend via `VITE_API_BASE`.

## Notes on what's genuinely wired vs. still a placeholder

Matching what your backend actually implements right now:

- ✅ Report submission, listing, cluster detail, status updates, deletion
- ✅ Before/after verification upload → Gemini comparison → resolved status
- ✅ Live AQI/PM2.5 readout, reverse geocoding for place names
- ✅ OTP send/verify against your Twilio router (with the `123456`
  simulated fallback if Twilio isn't configured)
- ⚠️ "Your reports" (citizen track page) shows the **global** queue, not
  reports filtered to your phone number — your backend doesn't expose a
  `?phone=` filter on `/api/reports/clusters` yet. This is called out
  in-code (`CitizenTrack.tsx`) where you'd wire it in once that filter
  exists server-side.
- ⚠️ Municipal login doesn't validate the employee ID against anything —
  this matches your backend, which has no employee-auth endpoint at all.
