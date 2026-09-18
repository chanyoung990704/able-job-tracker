# Able Job Tracker — Overview & Architecture

## What the project does

Able Job Tracker (에이블 취업 트래커) is a personal job-search dashboard for **new-grad backend developer positions** in Korea. It brings three things together on one page:

1. **Job catalog** — curated open postings (company, role, category, employment type, deadline, link), grouped into horizontal collections with D-day labels and category / fit filters.
2. **Per-job application strategy** — each posting carries a fit grade (A/B/…), stack match, a core pitch, projects to highlight, and interview prep notes, shown in a strategy drawer / accordion.
3. **Application pipeline** — a personal tracker with bookmarks, memos, status per job, a funnel summary, and a drag-and-drop kanban board:

   `관심 → 서류준비 → 서류제출 → 면접대기 → 최종합격`

   These five stages are the complete status set. `PIPELINE_STAGES` in
   `src/constants.js` is the single source of truth and `STATUSES` derives from
   it. Three earlier statuses (`서류합격`, `코테/과제`, `불합격`) were removed
   because they had no kanban column — a card set to one of them disappeared
   from the board. Existing records are migrated once on load: the first two
   become `면접대기`, `불합격` clears the status while keeping the memo and
   bookmark.

It also includes company analysis cards (summary, SWOT, values, hiring process, eligibility, links).

The job data is refreshed periodically from job-site scans (원티드 / 점핏 / 자소설닷컴). A reviewed spreadsheet is merged into `data/jobs.json` — new postings get a fresh contiguous id block and the collection-round `issue` label, postings already present are matched by `url` and only have their deadline refreshed so the hand-written strategy is never overwritten — and `upsert_jobs.js` pushes the result to Supabase.

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
  job-site scans → reviewed xlsx → data/jobs.json → upsert_jobs.js
```

### Components

| Path | Role |
| :--- | :--- |
| `index.html` | Markup only (291 lines). Two stylesheet links, one `<script type="module" src="src/main.js">`, and a small classic script that loads an optional local `supabase_config.js`. Also loads `@supabase/supabase-js@2` from jsDelivr. |
| `data/jobs.json`, `data/companies.json` | The job and company snapshot, fetched at boot. Previously inlined in `index.html`, where 280KB of JSON was half the file. |
| `styles/base.css`, `styles/career-design.css` | The two former inline `<style>` blocks. Load order matters — `career-design.css` overrides rules in `base.css`. |
| `src/main.js` | Boot: loads data, subscribes the render scheduler to the store, connects Supabase, and exposes one `window.App` entry point for tests. |
| `src/constants.js` | `PIPELINE_STAGES` (the source of truth), the derived `STATUSES`, storage keys. |
| `src/state.js` | Transient UI state: filters, search, sort, view mode. Not persisted. |
| `src/store.js` | Application records, `localStorage` persistence, the one-time status migration, and `subscribe()`. DOM-free. |
| `src/data.js` | Holds `JOBS` / `COS`; Supabase may replace either at runtime. |
| `src/selectors.js` | `visible()` and `getCats()` — filtering and sorting derived from data + state + store. |
| `src/util.js` | Pure formatting helpers: `esc`, `daysLeft`, `level`, `ddayLabel`, `typeClass`, `shortType`. |
| `src/actions.js` | Everything that mutates: status changes, bookmarks, memos, view switching, demo seed / reset. |
| `src/events.js` | Every listener. One delegated `click` dispatching on `data-action`, one `input`, one `change`, and kanban drag/drop delegated to the board. |
| `src/render/index.js` | Render scheduler: coalesces requests into one animation frame, renders each target at most once, and skips views the current mode hides. |
| `src/render/*.js` | `shelves` (list + stats + chips), `kanban`, `funnel`, `company`, `drawer`, `catalog`. Each renders and nothing else — no state changes, no calls into another renderer. |
| `src/supabase.js` | Config resolution, connection, sync down/up, and the pending-upload indicator in the connection ribbon. |
| `src/toast.js` | The shared `#trackerToast` helper. |
| `api/config.js` | Vercel function `GET /api/config`. Exposes `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `USER_KEY` from environment variables so no config file is committed. Never returns a service-role key. |
| `vercel.json` | Rewrites (`/` → `index.html`, `/api/config`), clean URLs, and security headers (`nosniff`, `SAMEORIGIN`, XSS protection). |
| `upsert_jobs.js` | Standalone Node script: pushes `data/jobs.json` into Supabase `jobs` + `job_strategies` (camelCase → snake_case, PostgREST `Prefer: resolution=merge-duplicates`, chunks of 100, `jobs` before `job_strategies` for the FK). Needs `SUPABASE_SERVICE_ROLE_KEY` — the anon key is read-only on these tables under RLS — and exits non-zero rather than silently skipping when it is absent. `--dry-run` and `--since=N`. |
| `get_open_jobs.js` | One-off Node script: fetches `jobs` + `job_strategies`, keeps postings open as of a hardcoded date (or 상시채용), sorts by deadline, writes `open_jobs.json`. |
| `open_jobs.json` | Generated snapshot of open jobs with their strategies. |
| `kanban-layout.test.cjs` | Playwright test (`npm test`): serves the directory offline, asserts the board renders as five equal-height scrollable columns with no page overflow at 375 / 768 / 1366 / 1920px, then exercises the drawer, stage advance, drag/drop and removal. |
| `.env.example` | Template for the three Vercel env vars. |

### No build step

The app is plain ES modules served as files. There is no bundler and no npm
runtime dependency, so `npx serve .` and Vercel static hosting both work
unchanged. The one consequence worth knowing: module scope is not global, so
markup cannot use inline `onclick`. Rendered elements carry `data-action`
instead and `src/events.js` dispatches on the innermost match.

### Data model (Supabase)

| Table | Key fields | Used for |
| :--- | :--- | :--- |
| `jobs` | `id, issue, cat, org, company, role, type, due, due_raw, url` | Job catalog |
| `job_strategies` | `job_id, fit, stack_match, core_pitch, appeal_projects, interview_prep` | Strategy drawer (joined via `jobs.select('*, job_strategies(*)')`) |
| `companies` | `name, en, tags, facts, metrics, summary, swot, values, process, eligibility, spec, role_info, link, pitch, …` | Company analysis cards |
| `applications` | `user_key, job_id, status, is_bookmarked, memo, applied_at, updated_at` | Personal pipeline state |

### Runtime flow

1. **Boot** — `main.js` wires up listeners, loads application state from
   `localStorage` (running the status migration once), then fetches
   `data/jobs.json` and `data/companies.json`. The list shows a short loading
   line until they arrive. If the fetch fails the app starts empty and waits
   for Supabase.
2. **Config** — `resolveSupabaseConfig()` calls `/api/config`. If that fails or
   returns placeholders, it falls back to a local `supabase_config.js`
   (git-ignored) or a config saved in `localStorage`. With no valid config the
   app runs in **local-only mode**.
3. **Sync down** — `fetchSupabaseData()`:
   - loads `applications` for the current `user_key` and merges with local state
     using **last-write-wins on `updated_at`** (a newer local record is pushed
     back up);
   - replaces `JOBS` with `jobs + job_strategies` and `COS` with `companies`
     when the DB has data.
   `data.js` has no subscribe mechanism, so callers re-render explicitly via
   `afterRemoteData()` in `src/events.js`.
4. **Sync up** — a mutation goes to the store, which persists to `localStorage`
   and notifies subscribers. The subscriber in `main.js` does two things: asks
   the scheduler to re-render the affected views, and pushes that one record to
   Supabase. Bulk replacements (a remote fetch, seeding, reset) do not echo back
   as per-record uploads.
5. **Rendering** — nothing renders synchronously from a mutation. Requests
   coalesce into the next animation frame, each target renders at most once, and
   a view the current mode hides is skipped entirely — so changing a card in
   kanban mode does not rebuild the 398-card shelf list behind it.
6. **Failed uploads** — a failed upsert or delete is recorded and surfaced in the
   connection ribbon as `⚠️ N건 업로드 대기 · 재시도`, with a retry button. The
   change stays saved locally. (Failures used to be written to a per-job element
   id that no markup ever created, so they were completely invisible.)

## Running & deploying

```bash
npm start            # static serve (npx serve .) — /api/config is not available, app falls back
npx vercel dev       # local run including the serverless function
npm test             # Playwright kanban layout + interaction test
npm run deploy       # npx vercel --prod
```

Required Vercel env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `USER_KEY`.

`npm test` needs Playwright's Chromium: `npx playwright install chromium`.
The app must be served over http — opening `index.html` from the filesystem
fails because ES modules and `fetch` are blocked on `file://`.

## Security notes

- The anon key is designed to be public, but it is committed in `.env.example` and `get_open_jobs.js`. Data safety therefore depends entirely on **Row Level Security** in Supabase.
- `USER_KEY` is an identifier, not authentication. Without RLS policies on `applications`, any client holding the anon key could read or modify another user's rows.
