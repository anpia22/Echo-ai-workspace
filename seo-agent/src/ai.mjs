// Asks Gemini for a new title + meta description.
import { config } from './config.mjs';

const SYSTEM = `You are an expert SEO copywriter. You write the <title> and meta description for ONE web page so that searchers who see it in Google results want to click it.

Hard rules:
- Accurately describe what is actually on the page. Never promise anything the page does not deliver.
- Naturally include the main search intent from the queries provided. No keyword stuffing, no repeating the same keyword.
- Title: ${config.titleMin}-${config.titleMax} characters. Put the most important words first. Keep the brand suffix if the current title has one and it fits.
- Description: ${config.descMin}-${config.descMax} characters. One or two plain sentences with a clear benefit or answer; may end with a soft call to action.
- No ALL CAPS words, no clickbait, no emojis, no fake numbers, prices, dates or claims.
- Write in the same language as the page.
- Reply with ONLY a JSON object: {"title": "...", "description": "...", "reason": "one short sentence"}`;

export async function writeMeta({ url, page, queries, stats, previousAttempts = [], feedback = '' }) {
  const user = [
    `URL: ${url}`,
    `Current title: ${page.title || '(none)'}`,
    `Current description: ${page.description || '(none)'}`,
    `H1: ${page.h1 || '(none)'}`,
    `Last 28 days in Google: ${stats.impressions} impressions, ${stats.clicks} clicks, CTR ${(stats.ctr * 100).toFixed(2)}%, avg position ${stats.position.toFixed(1)}`,
    '',
    'Search queries this page appears for (most impressions first):',
    ...queries.map((q) => `- "${q.query}" (${q.impressions} impr, ${q.clicks} clicks, pos ${q.position})`),
    '',
    previousAttempts.length
      ? 'Earlier versions that were tested and did NOT beat the current one (do not repeat them):\n' +
        previousAttempts.map((a) => `- ${a.title} | ${a.description}`).join('\n')
      : '',
    '',
    'Page content (truncated):',
    page.text,
    feedback ? `\nYour previous answer was rejected: ${feedback}. Fix it.` : '',
  ].join('\n');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: 600,
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${err.slice(0, 400)}`);
  }

  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || '').join('');
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error(`AI did not return JSON: ${text.slice(0, 200)}`);
  const out = JSON.parse(json[0]);
  return {
    title: String(out.title || '').trim(),
    description: String(out.description || '').trim(),
    reason: String(out.reason || '').trim(),
  };
}

/** Returns an error string, or '' if the suggestion is acceptable. */
export function validate(meta, current) {
  const { title, description } = meta;
  if (title.length < config.titleMin || title.length > config.titleMax)
    return `title is ${title.length} chars, must be ${config.titleMin}-${config.titleMax}`;
  if (description.length < config.descMin || description.length > config.descMax)
    return `description is ${description.length} chars, must be ${config.descMin}-${config.descMax}`;
  if (/\b[A-Z]{5,}\b/.test(title + ' ' + description)) return 'contains ALL CAPS words';
  if (/[\u{1F300}-\u{1FAFF}]/u.test(title + description)) return 'contains emojis';
  if (title.toLowerCase() === (current.title || '').toLowerCase()) return 'title is identical to the current one';
  // crude keyword-stuffing check: any word (4+ letters) used 3+ times in the title
  const counts = {};
  for (const w of title.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []) counts[w] = (counts[w] || 0) + 1;
  if (Object.values(counts).some((c) => c >= 3)) return 'title repeats the same word 3+ times';
  return '';
}
