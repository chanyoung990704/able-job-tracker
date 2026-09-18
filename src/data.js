/**
 * Job and company data. Previously two 280KB inline literals at
 * index.html:1730-1731; now fetched from data/*.json so the page ships
 * ~50KB of markup and the data caches separately.
 *
 * Supabase may replace both sets at runtime (the original code reassigned
 * the JOBS global wholesale after a fetch), so consumers must call
 * getJobs()/getCompanies() on every render rather than caching the array.
 */

let jobs = [];
let companies = [];
let loaded = false;

export function getJobs() { return jobs; }
export function getCompanies() { return companies; }
export function isLoaded() { return loaded; }

export function getJobById(id) {
  return jobs.find(j => String(j.id) === String(id));
}

export function setJobs(next) { jobs = Array.isArray(next) ? next : []; }
export function setCompanies(next) { companies = Array.isArray(next) ? next : []; }

/**
 * Loads both data files. Resolves even on failure — the app starts empty and
 * waits for Supabase, which is what the original code did when its fetch
 * failed. Returns {ok, error} so the caller can surface a message.
 */
export async function loadData() {
  try {
    const [j, c] = await Promise.all([
      fetch('data/jobs.json').then(r => { if (!r.ok) throw new Error('jobs.json ' + r.status); return r.json(); }),
      fetch('data/companies.json').then(r => { if (!r.ok) throw new Error('companies.json ' + r.status); return r.json(); })
    ]);
    setJobs(j);
    setCompanies(c);
    loaded = true;
    return { ok: true };
  } catch (e) {
    console.warn('data load failed:', e);
    return { ok: false, error: e };
  }
}
