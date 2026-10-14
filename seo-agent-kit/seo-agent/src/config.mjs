// All tunable settings. Override any of them with environment variables.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  // Your site exactly as it appears in Search Console, e.g. "https://example.com/"
  // or "sc-domain:example.com" for a domain property.
  gscProperty: process.env.GSC_PROPERTY,
  // Public base URL of the live site (used to read page content).
  siteUrl: (process.env.SITE_URL || '').replace(/\/$/, ''),

  model: process.env.AI_MODEL || 'gemini-2.5-flash',

  // Where the Next.js app reads its metadata overrides from (repo root /seo).
  overridesFile: path.resolve(here, '../../seo/meta-overrides.json'),
  historyFile: path.resolve(here, '../../seo/history.json'),

  // ---- Safety rules ----
  maxChangesPerRun: num(process.env.MAX_CHANGES_PER_RUN, 3),
  minImpressions: num(process.env.MIN_IMPRESSIONS, 100), // per 28 days
  cooldownDays: num(process.env.COOLDOWN_DAYS, 35),      // min days between changes to one page
  testDays: num(process.env.TEST_DAYS, 28),              // how long a change is measured
  protectTopPosition: num(process.env.PROTECT_TOP_POSITION, 3), // never touch pages ranking better than this
  maxPosition: num(process.env.MAX_POSITION, 20),        // ignore pages ranking worse than this
  titleMin: 30, titleMax: 60,
  descMin: 70, descMax: 158,

  dryRun: process.env.DRY_RUN === '1',
};

export function assertConfig() {
  const missing = [];
  if (!config.gscProperty) missing.push('GSC_PROPERTY');
  if (!config.siteUrl) missing.push('SITE_URL');
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) missing.push('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!process.env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
