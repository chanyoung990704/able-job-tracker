# Able Job Tracker — Overview & Architecture

## What the project does

Able Job Tracker (에이블 취업 트래커) is a personal job-search dashboard for **new-grad backend developer positions** in Korea. It brings three things together on one page:

1. **Job catalog** — curated open postings (company, role, category, employment type, deadline, link), grouped into horizontal collections with D-day labels and category / fit filters.
2. **Per-job application strategy** — each posting carries a fit grade (A/B/…), stack match, a core pitch, projects to highlight, and interview prep notes, shown in a strategy drawer / accordion.
3. **Application pipeline** — a personal tracker with bookmarks, memos, status per job, a funnel summary, and a drag-and-drop kanban board:

   `관심 → 서류준비 → 서류제출 → 면접대기 → 최종합격`
   (full status set also includes `서류합격`, `코테/과제`, `불합격`)

It also includes company analysis cards (summary, SWOT, values, hiring process, eligibility, links).

The job data is refreshed periodically from job-site scans (e.g. jasoseol); scans are reviewed and upserted into Supabase (see commits like `data: upsert reviewed September 17 job postings`).

## Architecture

```
┌──────────────────────────── Vercel ────────────────────────────┐
│                                                                │
│  index.html  (static SPA, no build step)                       │
│     │  1. GET /api/config                                      │
│     ▼                                                          │
│  api/config.js  (Serverless Function)                          │
│     returns { url, anonKey, userKey } from env vars            │
│                                                                │
└─────┬──────────────────────────────────────────────────────────┘
      │ 2. supabase-js (anon key), direct from the browser
      ▼
┌──────────────────────────── Supabase ──────────────────────────┐
│  jobs ──< job_strategies      companies      applications      │
│  (read)                       (read)         (read/write,      │
│                                               per user_key)    │
└────────────────────────────────────────────────────────────────┘
      ▲
      │ offline data pipeline (outside this repo)
  job-site scans → reviewed xlsx → upsert / audit scripts
```

### Components

| File | Role |
| :--- | :--- |
| `index.html` | The entire front end: HTML, CSS (light/dark themes) and vanilla JS in one file. Loads `@supabase/supabase-js@2` from jsDelivr. Embeds a snapshot of `JOBS` / `COS` data as an offline fallback. |
| `api/config.js` | Vercel function `GET /api/config`. Exposes `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `USER_KEY` from environment variables so no config file is committed. Never returns a service-role key. |
| `vercel.json` | Rewrites (`/` → `index.html`, `/api/config`), clean URLs, and security headers (`nosniff`, `SAMEORIGIN`, XSS protection). |
| `get_open_jobs.js` | One-off Node script: fetches `jobs` + `job_strategies`, keeps postings open as of a hardcoded date (or 상시채용), sorts by deadline, writes `open_jobs.json`. |
| `open_jobs.json` | Generated snapshot of open jobs with their strategies. |
| `kanban-layout.test.cjs` | Playwright layout test: renders the kanban board offline at 375 / 768 / 1366 / 1920px and asserts equal-height, scrollable columns with no page overflow. |
| `.env.example` | Template for the three Vercel env vars. |

### Data model (Supabase)

| Table | Key fields | Used for |
| :--- | :--- | :--- |
| `jobs` | `id, issue, cat, org, company, role, type, due, due_raw, url` | Job catalog |
| `job_strategies` | `job_id, fit, stack_match, core_pitch, appeal_projects, interview_prep` | Strategy drawer (joined via `jobs.select('*, job_strategies(*)')`) |
| `companies` | `name, en, tags, facts, metrics, summary, swot, values, process, eligibility, spec, role_info, link, pitch, …` | Company analysis cards |
| `applications` | `user_key, job_id, status, is_bookmarked, memo, applied_at, updated_at` | Personal pipeline state |

### Runtime flow

1. **Boot** — the page renders immediately from the embedded `JOBS` / `COS` snapshot and application state cached in `localStorage`.
2. **Config** — `resolveSupabaseConfig()` calls `/api/config`. If that fails or returns placeholders, it falls back to a local `supabase_config.js` (git-ignored) or a config saved in `localStorage`. With no valid config the app runs in **local-only mode**.
3. **Sync down** — `fetchSupabaseData()`:
   - loads `applications` for the current `user_key` and merges with local state using **last-write-wins on `updated_at`** (a newer local record is pushed back up);
   - replaces `JOBS` with `jobs + job_strategies` and `COS` with `companies` when the DB has data;
   - re-renders stats, chips, filters and lists.
4. **Sync up** — every status change, bookmark, memo or kanban drop updates local state, saves to `localStorage`, then `syncApplicationToSupabase()` upserts the row (or deletes it when status, bookmark and memo are all empty). Failures leave the change stored locally with a "cloud pending" indicator.

## Running & deploying

```bash
npm start            # static serve (npx serve .) — /api/config is not available, app falls back
npx vercel dev       # local run including the serverless function
npm run deploy       # npx vercel --prod
```

Required Vercel env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `USER_KEY`.

## Security notes

- The anon key is designed to be public, but it is committed in `.env.example` and `get_open_jobs.js`. Data safety therefore depends entirely on **Row Level Security** in Supabase.
- `USER_KEY` is an identifier, not authentication. Without RLS policies on `applications`, any client holding the anon key could read or modify another user's rows.
