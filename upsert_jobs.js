/**
 * upsert_jobs.js — push data/jobs.json into Supabase `jobs` + `job_strategies`.
 *
 * Counterpart of get_open_jobs.js, which only reads. Same conventions: CJS,
 * no npm dependency, raw fetch against PostgREST (Node >= 18 has global fetch).
 *
 * `jobs` and `job_strategies` are read-only from the browser app's point of
 * view, so the anon key is not enough — RLS is expected to reject writes. This
 * script needs the service-role key and refuses to run without it rather than
 * silently no-opping, which would leave a stale catalog looking healthy.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node upsert_jobs.js [--dry-run] [--since=399]
 *
 * --dry-run  print what would be sent and exit without writing.
 * --since=N  only push records with id >= N (default: all).
 */

const fs = require('fs');

const BASE = process.env.SUPABASE_URL || 'https://kthfmifqlcrqfwmbvldk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHUNK = 100;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sinceArg = args.find(a => a.startsWith('--since='));
const since = sinceArg ? Number(sinceArg.split('=')[1]) : -Infinity;

/** camelCase local record -> the snake_case `jobs` columns. */
function toJobRow(j) {
  return {
    id: j.id,
    issue: j.issue,
    cat: j.cat,
    org: j.org,
    company: j.company,
    role: j.role,
    type: j.type,
    due: j.due,
    due_raw: j.dueRaw,
    url: j.url
  };
}

/** camelCase local strategy -> the snake_case `job_strategies` columns. */
function toStrategyRow(j) {
  const s = j.strategy;
  if (!s) return null;
  return {
    job_id: j.id,
    fit: s.fit,
    stack_match: s.stackMatch,
    core_pitch: s.corePitch,
    appeal_projects: s.appealProjects,
    interview_prep: s.interviewPrep
  };
}

async function upsert(table, onConflict, rows) {
  const url = `${BASE}/rest/v1/${table}?on_conflict=${onConflict}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    throw new Error(`${table} upsert failed: ${res.status} ${res.statusText}\n${await res.text()}`);
  }
}

async function upsertAll(table, onConflict, rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await upsert(table, onConflict, chunk);
    console.log(`  ${table}: ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
}

async function main() {
  const jobs = JSON.parse(fs.readFileSync('data/jobs.json', 'utf8'))
    .filter(j => j.id >= since);

  const jobRows = jobs.map(toJobRow);
  const stratRows = jobs.map(toStrategyRow).filter(Boolean);

  console.log(`jobs: ${jobRows.length}, job_strategies: ${stratRows.length}`);

  if (dryRun) {
    console.log('--dry-run, nothing sent. First row of each:');
    console.log(JSON.stringify(jobRows[0], null, 2));
    console.log(JSON.stringify(stratRows[0], null, 2));
    return;
  }

  if (!KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Writing to jobs/job_strategies ' +
      'needs the service-role key; the anon key is read-only under RLS. ' +
      'Refusing to run so a failed load is not mistaken for a successful one.'
    );
  }

  // jobs first — job_strategies.job_id is a foreign key to jobs.id.
  await upsertAll('jobs', 'id', jobRows);
  await upsertAll('job_strategies', 'job_id', stratRows);
  console.log('Done.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
