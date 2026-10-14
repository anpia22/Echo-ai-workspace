// SEO agent main loop. Run weekly.
//  1. Judge earlier changes that have finished their test period -> keep or roll back.
//  2. Find pages with the most click upside.
//  3. Have the AI rewrite their title + meta description, validate, and save.
import fs from 'node:fs/promises';
import { config, assertConfig } from './config.mjs';
import { pageStats, topQueries, isoDate, daysAgo } from './gsc.mjs';
import { readPage } from './page.mjs';
import { writeMeta, validate } from './ai.mjs';

const GSC_LAG = 3; // Search Console "final" data lags ~3 days
const DAY = 86400000;

// Typical organic CTR by position; used to spot pages that under-perform their ranking.
const EXPECTED_CTR = [0, 0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
const expectedCtr = (pos) => EXPECTED_CTR[Math.round(pos)] ?? 0.01;

const log = (...a) => console.log(...a);
const readJson = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => fs.writeFile(f, JSON.stringify(v, null, 2) + '\n');

function toPath(url) {
  const u = new URL(url);
  if (u.origin !== new URL(config.siteUrl).origin) return null;
  if (u.search || u.hash) return null;
  const p = u.pathname.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

const sum = (m) => {
  let clicks = 0, impressions = 0, pw = 0;
  for (const s of m.values()) { clicks += s.clicks; impressions += s.impressions; pw += s.position * s.impressions; }
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? pw / impressions : 0 };
};

// ---------- 1. Evaluate finished experiments ----------
async function evaluate(history, overrides, today) {
  for (const exp of history.filter((h) => h.status === 'testing')) {
    const changed = new Date(exp.changedAt + 'T00:00:00Z');
    const afterStart = new Date(changed.getTime() + GSC_LAG * DAY);
    const afterEnd = new Date(afterStart.getTime() + (config.testDays - 1) * DAY);
    const dataAvailableUntil = daysAgo(GSC_LAG, today);
    if (afterEnd > dataAvailableUntil) continue; // still running

    const after = sum(await pageStats(isoDate(afterStart), isoDate(afterEnd), exp.url));
    const before = exp.baseline;
    const ageDays = (today - changed) / DAY;

    let verdict;
    if (after.impressions < 50 && ageDays < config.testDays * 2) {
      log(`… ${exp.path}: not enough data yet (${after.impressions} impressions), extending test`);
      continue;
    } else if (after.impressions < 50) {
      verdict = 'kept-inconclusive';
    } else {
      const ctrOk = after.ctr >= before.ctr * 0.95;
      const posOk = after.position <= before.position + 1.5;
      const clicksOk = after.clicks >= before.clicks * 0.9;
      verdict = ctrOk && posOk && clicksOk ? 'kept' : 'rolled-back';
    }

    exp.result = {
      evaluatedAt: isoDate(today),
      after: {
        clicks: after.clicks, impressions: after.impressions,
        ctr: +after.ctr.toFixed(4), position: +after.position.toFixed(2),
      },
    };
    exp.status = verdict;

    if (verdict === 'rolled-back') {
      if (exp.previousOverride) overrides[exp.path] = exp.previousOverride;
      else delete overrides[exp.path];
      log(`↩ ROLLED BACK ${exp.path}: CTR ${(before.ctr * 100).toFixed(2)}% → ${(after.ctr * 100).toFixed(2)}%, pos ${before.position.toFixed(1)} → ${after.position.toFixed(1)}`);
    } else {
      log(`✔ KEPT ${exp.path} (${verdict}): CTR ${(before.ctr * 100).toFixed(2)}% → ${(after.ctr * 100).toFixed(2)}%`);
    }
  }
}

// ---------- 2. Pick candidates ----------
async function pickCandidates(history, today) {
  const end = daysAgo(GSC_LAG, today);
  const start = daysAgo(GSC_LAG + 27, today);
  const stats = await pageStats(isoDate(start), isoDate(end));

  const lastChange = new Map();
  for (const h of history) {
    const t = new Date(h.changedAt + 'T00:00:00Z').getTime();
    if (!lastChange.has(h.path) || t > lastChange.get(h.path)) lastChange.set(h.path, t);
  }
  const testing = new Set(history.filter((h) => h.status === 'testing').map((h) => h.path));

  const candidates = [];
  for (const [url, s] of stats) {
    const p = toPath(url);
    if (!p) continue;
    if (s.impressions < config.minImpressions) continue;
    if (s.position < config.protectTopPosition) continue;      // already near the top: leave alone
    if (s.position > config.maxPosition) continue;             // too far down for metadata to matter
    if (testing.has(p)) continue;
    const last = lastChange.get(p);
    if (last && (today - last) / DAY < config.cooldownDays) continue;

    const gap = expectedCtr(s.position) - s.ctr;
    const opportunity = s.impressions * Math.max(gap, 0.005); // extra clicks we could win
    candidates.push({ url, path: p, stats: s, opportunity });
  }
  candidates.sort((a, b) => b.opportunity - a.opportunity);
  return { candidates, start, end };
}

// ---------- 3. Rewrite ----------
async function improve(c, history, overrides, today, range) {
  const page = await readPage(c.url);
  if (page.noindex) { log(`– skip ${c.path}: page is noindex`); return false; }
  if (page.text.length < 200) { log(`– skip ${c.path}: too little content to describe`); return false; }

  const queries = await topQueries(c.url, isoDate(range.start), isoDate(range.end));
  const previousAttempts = history
    .filter((h) => h.path === c.path && h.status === 'rolled-back')
    .map((h) => h.after);

  let meta, error = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    meta = await writeMeta({ url: c.url, page, queries, stats: c.stats, previousAttempts, feedback: error });
    error = validate(meta, page);
    if (!error) break;
  }
  if (error) { log(`✖ skip ${c.path}: AI output failed validation (${error})`); return false; }

  log(`✎ ${c.path}\n   old: ${page.title}\n   new: ${meta.title}\n   desc: ${meta.description}\n   why: ${meta.reason}`);

  history.push({
    path: c.path,
    url: c.url,
    changedAt: isoDate(today),
    status: 'testing',
    reason: meta.reason,
    topQueries: queries.slice(0, 5).map((q) => q.query),
    before: { title: page.title, description: page.description },
    after: { title: meta.title, description: meta.description },
    previousOverride: overrides[c.path] ?? null,
    baseline: {
      clicks: c.stats.clicks, impressions: c.stats.impressions,
      ctr: +c.stats.ctr.toFixed(4), position: +c.stats.position.toFixed(2),
    },
  });
  overrides[c.path] = { title: meta.title, description: meta.description, updatedAt: isoDate(today) };
  return true;
}

async function main() {
  assertConfig();
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const overrides = await readJson(config.overridesFile, {});
  const history = await readJson(config.historyFile, []);

  log('== Evaluating earlier changes ==');
  await evaluate(history, overrides, today);

  log('\n== Finding pages to improve ==');
  const range = await pickCandidates(history, today);
  log(`${range.candidates.length} eligible page(s)`);

  let changed = 0;
  for (const c of range.candidates) {
    if (changed >= config.maxChangesPerRun) break;
    try {
      if (await improve(c, history, overrides, today, range)) changed++;
    } catch (e) {
      log(`✖ ${c.path}: ${e.message}`);
    }
  }

  if (config.dryRun) {
    log('\nDRY RUN — nothing saved.');
    return;
  }
  await writeJson(config.overridesFile, overrides);
  await writeJson(config.historyFile, history);
  log(`\nDone. ${changed} page(s) updated.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
