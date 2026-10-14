// Google Search Console data access.
import { google } from 'googleapis';
import { config } from './config.mjs';

let client;
function sc() {
  if (client) return client;
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  client = google.searchconsole({ version: 'v1', auth });
  return client;
}

export const isoDate = (d) => d.toISOString().slice(0, 10);
export const daysAgo = (n, from = new Date()) => {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

async function query(body) {
  const rows = [];
  let startRow = 0;
  // Page through results (GSC returns max 25k rows per request).
  for (;;) {
    const res = await sc().searchanalytics.query({
      siteUrl: config.gscProperty,
      requestBody: { ...body, rowLimit: 25000, startRow, dataState: 'final' },
    });
    const batch = res.data.rows || [];
    rows.push(...batch);
    if (batch.length < 25000) break;
    startRow += batch.length;
  }
  return rows;
}

/** Page-level totals for a date range. Returns Map<url, {clicks, impressions, ctr, position}> */
export async function pageStats(startDate, endDate, pageUrl) {
  const body = { startDate, endDate, dimensions: ['page'] };
  if (pageUrl) {
    body.dimensionFilterGroups = [
      { filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }] },
    ];
  }
  const rows = await query(body);
  const map = new Map();
  for (const r of rows) {
    map.set(r.keys[0], {
      clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
    });
  }
  return map;
}

/** Top search queries a page appears for. */
export async function topQueries(pageUrl, startDate, endDate, limit = 15) {
  const rows = await query({
    startDate, endDate, dimensions: ['query'],
    dimensionFilterGroups: [
      { filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }] },
    ],
  });
  return rows
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit)
    .map((r) => ({
      query: r.keys[0], impressions: r.impressions, clicks: r.clicks,
      position: Math.round(r.position * 10) / 10,
    }));
}
