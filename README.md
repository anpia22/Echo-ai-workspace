<p align="center">
  <img src="public/logo/logo.svg" alt="Echo" width="96" height="96" />
</p>

# Echo

**The AI workspace that thinks with you.** Describe a messy product or architecture problem and Echo drafts a map of problems, options, decisions and tasks on a shared canvas. You reshape it, and the AI works from your version.

Echo is a working prototype. It is free during beta and aimed at technical founders and engineers making decisions with incomplete information.

## What it does

- **Conversation to canvas.** Chat with the AI and it proposes nodes and connections. Move, edit, delete or regroup anything.
- **Canvas as context.** What is on the canvas is sent back to the AI, so the next answer builds on your edits.
- **Saved workspaces.** Conversations and canvases persist, so you can pick up where you left off.
- **Live collaboration.** Shared rooms with presence and live cursors, plus a follow-the-presenter view.
- **Meetings.** WebRTC audio/video and screen sharing, with transcripts that can feed the canvas.
- **Try-it demo.** The landing page has a no-sign-up demo that turns one message into a small map.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page with the live demo |
| `/app` | The workspace (add `?room=<id>` for a shared room) |
| `/about`, `/how-it-works`, `/use-cases`, `/demo`, `/blog` | Marketing pages |
| `/privacy`, `/terms` | Legal |
| `/api/analyze` | AI analysis for the workspace |
| `/api/demo` | Public, rate-limited demo endpoint |
| `/api/workspace/*` | Workspaces, canvas, conversations, meetings, rooms |

## Tech stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, `@xyflow/react` for the canvas, Supabase (Postgres, Realtime) for persistence and collaboration, native WebRTC for meetings, and NVIDIA Nemotron through the OpenAI SDK for the AI.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3003](http://localhost:3003) for the landing page and [http://localhost:3003/app](http://localhost:3003/app) for the workspace.

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

### Environment variables

Create `.env.local`:

| Variable | Used for |
| --- | --- |
| `NVIDIA_API_KEY` | AI responses in `/api/analyze` and `/api/demo` (the demo reports itself offline without it) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase client (realtime, presence) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-side persistence |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for SEO, sitemap and share links (optional) |
| `ECHO_DEMO_MODE`, `ECHO_DEV_USER_ID` | Local development helpers (optional) |

Database migrations are in [`supabase/migrations`](supabase/migrations).

## Project notes

- Architecture and phase notes live in [`docs/ai`](docs/ai).
- The demo endpoint keeps its rate limit (5 runs per 10 minutes per IP) in memory, so it resets on cold starts and is not shared across instances.
- Next.js 16 has breaking changes from older versions. See `node_modules/next/dist/docs/` before changing framework-level code.
