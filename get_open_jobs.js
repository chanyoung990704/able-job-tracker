const fs = require('fs');

const url = 'https://kthfmifqlcrqfwmbvldk.supabase.co/rest/v1/jobs?select=*,job_strategies(*)';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0aGZtaWZxbGNycWZ3bWJ2bGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1ODk0MzYsImV4cCI6MjEwNDE2NTQzNn0.R9ELhddqqRVeiDuEOteY4-K_Bkf1xAbnz6G7OwuPvm4';

async function main() {
  const res = await fetch(url, {
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key
    }
  });
  const data = await res.json();
  const today = '2026-09-09';

  // Filter open jobs: due >= today or due is null (상시채용)
  const openJobs = data.filter(j => {
    if (!j.due) return true;
    return j.due >= today;
  });

  // Sort by deadline: non-null due first (ascending), then null/상시
  openJobs.sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due && !b.due) return -1;
    if (!a.due && b.due) return 1;
    return (a.id || 0) - (b.id || 0);
  });

  console.log('Total jobs in DB:', data.length);
  console.log('Open jobs count (from 2026-09-09):', openJobs.length);
  
  const result = openJobs.map((j, i) => {
    const strat = Array.isArray(j.job_strategies) ? (j.job_strategies[0] || null) : (j.job_strategies || null);
    return {
      rank: i + 1,
      id: j.id,
      company: j.company,
      role: j.role,
      cat: j.cat,
      type: j.type,
      due: j.due || '상시채용',
      due_raw: j.due_raw,
      url: j.url,
      fit: strat ? strat.fit : '미정',
      strategy: strat
    };
  });

  fs.writeFileSync('open_jobs.json', JSON.stringify(result, null, 2), 'utf8');
  console.log('Saved to open_jobs.json');
  console.log('Top 15 Open Jobs:');
  result.slice(0, 15).forEach(j => {
    console.log(`[#${j.rank}] ID:${j.id} | ${j.company} | ${j.role} | Cat:${j.cat} | Due:${j.due} (${j.due_raw}) | Fit:${j.fit}`);
  });
}

main().catch(console.error);
