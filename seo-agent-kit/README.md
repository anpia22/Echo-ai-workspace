# AI SEO Agent for Next.js

Every Monday this agent runs by itself and:

1. **Reads your Google Search Console data** to see which searches each page shows up for, its position and its clicks.
2. **Judges last month's changes**. If a new title got more clicks it is **kept**; if it did worse it is **rolled back** automatically.
3. **Finds the pages with the most upside**: pages ranking #3–20 with many impressions but few clicks.
4. **Reads each page** and has the AI write a better title and meta description from the real search queries.
5. **Checks the AI's work** (length, no keyword stuffing, no caps or emojis) and saves it.
6. **Commits the change to GitHub**, which redeploys your site on Vercel (or wherever it deploys from Git).

Everyone, people and Google alike, sees the same page. This is normal, Google-approved optimisation, not cloaking.

---

## What's in the kit

```
seo/meta-overrides.json        ← AI-written titles/descriptions (your site reads this)
seo/history.json               ← every change, its before/after numbers, kept or rolled back
lib/seo.ts                     ← withSeo() helper for your pages
seo-agent/                     ← the agent (Node.js)
.github/workflows/seo-agent.yml← runs it every Monday
```

Copy all of these into the **root of your Next.js repo**.

> If your project uses a `src/` folder, put `seo.ts` in `src/lib/` and change its import to
> `../../seo/meta-overrides.json`.

---

## Setup (about 20 minutes, one time)

### 1. Use the helper in your pages (App Router)

Static page, e.g. `app/about/page.tsx`:

```tsx
import { withSeo } from '@/lib/seo';

export const metadata = withSeo('/about', {
  title: 'About us',
  description: 'Who we are and what we do.',
});
```

Dynamic page, e.g. `app/blog/[slug]/page.tsx`:

```tsx
import { withSeo } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getPost(slug);
  return withSeo(`/blog/${slug}`, { title: post.title, description: post.excerpt });
}
```

Your own title stays as the default. The AI's version replaces it only for pages it has optimised.

> Using the **Pages Router** (`pages/` folder)? Tell me and I'll give you the `<Head>` version.

### 2. Google Search Console access

1. Make sure your site is verified in [Google Search Console](https://search.google.com/search-console).
2. In [Google Cloud Console](https://console.cloud.google.com/), create a project and **enable the "Google Search Console API"**.
3. Go to **IAM & Admin → Service Accounts → Create service account** (no roles needed).
   Open it → **Keys → Add key → JSON**. A `.json` file downloads.
4. Copy the service account's email (looks like `seo-agent@your-project.iam.gserviceaccount.com`).
5. In Search Console: **Settings → Users and permissions → Add user**, paste that email, permission **Restricted** (read-only is enough).

### 3. Gemini API key

Create an API key at [Google AI Studio](https://aistudio.google.com/apikey). Each run costs a few cents. The default model is `gemini-2.5-flash`. Set the `AI_MODEL` variable if you want a different Gemini model.

### 4. Add settings to GitHub

In your repo: **Settings → Secrets and variables → Actions**

| Type | Name | Value |
|---|---|---|
| Secret | `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste the **whole contents** of the downloaded `.json` file |
| Secret | `GEMINI_API_KEY` | Your Gemini API key |
| Variable | `GSC_PROPERTY` | Exactly as in Search Console: `https://www.yoursite.com/` or `sc-domain:yoursite.com` |
| Variable | `SITE_URL` | Your live site, e.g. `https://www.yoursite.com` |

### 5. Test it safely

GitHub → **Actions → SEO agent → Run workflow** (leave "Dry run" ticked).
Open the log: you'll see which pages it chose and the titles it would write. Nothing changes.

When you're happy, it runs **for real every Monday** on its own. You can also run it manually with "Dry run" unticked.

---

## Safety rules (change them in `seo-agent/src/config.mjs`)

| Setting | Default | Meaning |
|---|---|---|
| `MAX_CHANGES_PER_RUN` | 3 | Max pages changed per week |
| `MIN_IMPRESSIONS` | 100 | Page needs this many impressions in 28 days to be touched |
| `PROTECT_TOP_POSITION` | 3 | Pages already ranking in the top 3 are never touched |
| `MAX_POSITION` | 20 | Pages beyond position 20 are skipped (they need content work, not new titles) |
| `COOLDOWN_DAYS` | 35 | Minimum gap between changes to the same page |
| `TEST_DAYS` | 28 | How long a change is measured before keep / roll back |

A change is **kept** only if CTR didn't drop more than 5%, clicks didn't drop more than 10%,
and average position didn't fall by more than 1.5. Otherwise the old title comes back automatically,
and the AI is told not to try that version again.

To undo anything by hand, delete that page's entry from `seo/meta-overrides.json`.

---

## What to expect

- Results show up in **4–8 weeks**, not days: Google needs to recrawl and the agent needs data to judge.
- This raises **clicks and rankings for pages already on page 1–2**. Pages that don't rank at all yet need better
  content and links from other sites; titles alone won't fix that.
- Check `seo/history.json` any time to see every change and whether it worked.
