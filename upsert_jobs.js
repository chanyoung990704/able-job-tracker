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
 *   node upsert_jobs.js [--dry-run] [--since=399] [--prune [--force-prune]]
 *
 * The key is read from the environment, or from a gitignored .env file.
 *
 * --dry-run      print what would be sent and exit without writing.
 * --since=N      only push records with id >= N (default: all).
 * --prune        also delete rows whose id is no longer in data/jobs.json.
 * --force-prune  allow a --prune that would delete more than PRUNE_LIMIT.
 */

const fs = require('fs');

/**
 * Minimal .env reader so `node upsert_jobs.js` works with no wrapper. Only
 * KEY=value lines, no quoting or interpolation — that is all .env holds here.
 * A real environment variable always wins. .env is gitignored.
 */
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}
loadEnv('.env');

const BASE = process.env.SUPABASE_URL || 'https://kthfmifqlcrqfwmbvldk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHUNK = 100;
const PAGE = 1000;

// A prune this large means data/jobs.json is probably truncated, not that the
// catalog really shrank that much. Stop and make someone look.
const PRUNE_LIMIT = 50;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const prune = args.includes('--prune');
const forcePrune = args.includes('--force-prune');
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

/** Every id in `table`, paged — PostgREST caps a single response. */
async function remoteIds(table, col) {
  const ids = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${BASE}/rest/v1/${table}?select=${col}&order=${col}`, {
      headers: {
        'apikey': KEY,
        'Authorization': 'Bearer ' + KEY,
        'Range-Unit': 'items',
        'Range': `${from}-${from + PAGE - 1}`
      }
    });
    if (!res.ok) {
      throw new Error(`${table} read failed: ${res.status} ${res.statusText}\n${await res.text()}`);
    }
    const page = await res.json();
    ids.push(...page.map(r => r[col]));
    if (page.length < PAGE) return ids;
  }
}

async function deleteByIds(table, col, ids) {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const res = await fetch(`${BASE}/rest/v1/${table}?${col}=in.(${chunk.join(',')})`, {
      method: 'DELETE',
      headers: {
        'apikey': KEY,
        'Authorization': 'Bearer ' + KEY,
        'Prefer': 'return=minimal'
      }
    });
    if (!res.ok) {
      throw new Error(`${table} delete failed: ${res.status} ${res.statusText}\n${await res.text()}`);
    }
    console.log(`  ${table}: deleted ${Math.min(i + CHUNK, ids.length)}/${ids.length}`);
  }
}

/**
 * Rows the DB still has that data/jobs.json no longer does. Only meaningful
 * for a full run: with --since the local set is a slice, so everything below
 * the cutoff would look deleted.
 */
async function pruneRemoved(localIds) {
  const keep = new Set(localIds);
  const staleJobs = (await remoteIds('jobs', 'id')).filter(id => !keep.has(id));
  const staleStrats = (await remoteIds('job_strategies', 'job_id')).filter(id => !keep.has(id));
  const total = new Set([...staleJobs, ...staleStrats]).size;

  if (!total) {
    console.log('prune: nothing stale.');
    return;
  }
  console.log(`prune: ${staleJobs.length} jobs, ${staleStrats.length} job_strategies`);
  console.log(`  ids: ${[...new Set([...staleJobs, ...staleStrats])].sort((a, b) => a - b).join(', ')}`);

  if (dryRun) {
    console.log('  --dry-run, nothing deleted.');
    return;
  }
  if (total > PRUNE_LIMIT && !forcePrune) {
    throw new Error(
      `prune would delete ${total} rows, over the ${PRUNE_LIMIT} guard. That usually ` +
      'means data/jobs.json is incomplete rather than that the catalog shrank. ' +
      'Check the file, then re-run with --force-prune if it really is correct.'
    );
  }
  // job_strategies first — job_strategies.job_id is a foreign key to jobs.id.
  await deleteByIds('job_strategies', 'job_id', staleStrats);
  await deleteByIds('jobs', 'id', staleJobs);
}

async function main() {
  if (prune && sinceArg) {
    throw new Error(
      '--prune cannot be combined with --since: the local set is then only a ' +
      'slice, so every record below the cutoff would look deleted.'
    );
  }

  const all = JSON.parse(fs.readFileSync('data/jobs.json', 'utf8'));
  const jobs = all.filter(j => j.id >= since);

  const jobRows = jobs.map(toJobRow);
  const stratRows = jobs.map(toStrategyRow).filter(Boolean);

  console.log(`jobs: ${jobRows.length}, job_strategies: ${stratRows.length}`);

  if (!KEY && !dryRun) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Writing to jobs/job_strategies ' +
      'needs the service-role key; the anon key is read-only under RLS. ' +
      'Refusing to run so a failed load is not mistaken for a successful one.'
    );
  }

  if (dryRun) {
    console.log('--dry-run, nothing sent. First row of each:');
    console.log(JSON.stringify(jobRows[0], null, 2));
    console.log(JSON.stringify(stratRows[0], null, 2));
  } else {
    // jobs first — job_strategies.job_id is a foreign key to jobs.id.
    await upsertAll('jobs', 'id', jobRows);
    await upsertAll('job_strategies', 'job_id', stratRows);
  }

  // After the upsert: a pruned id must not be one we are about to re-insert.
  if (prune) {
    if (!KEY) throw new Error('--prune needs SUPABASE_SERVICE_ROLE_KEY even with --dry-run, to read the remote ids.');
    await pruneRemoved(all.map(j => j.id));
  }
  console.log('Done.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
