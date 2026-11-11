<p align="center">
  <img src="public/logo/logo.svg" alt="Echo" width="96" height="96" />
</p>

# Echo

**The AI workspace that thinks with you.** Describe a messy product or architecture problem and Echo drafts a map of problems, options, decisions and tasks on a shared canvas. You reshape it, and the AI works from your version.

Echo is a working product in beta, aimed at technical founders and engineers making decisions with incomplete information.

## What it does

- **Conversation to canvas.** Chat with the AI and it proposes nodes and connections. Move, edit, delete or regroup anything.
- **Canvas as context.** What is on the canvas is sent back to the AI, so the next answer builds on your edits.
- **Accounts and saved workspaces.** Sign in, pick your display name, and your conversations and canvases follow your account across devices.
- **Teams.** Invite people to a workspace by link as editors or viewers; owners and admins manage roles. Viewers get a read-only canvas.
- **Live collaboration.** Private rooms for workspace members with presence, live cursors and a follow-the-presenter view.
- **Meetings.** WebRTC audio/video and screen sharing (with an optional TURN relay for strict networks), with transcripts that can feed the canvas.
- **Public read-only links.** Share one conversation and its canvas with anyone, no account needed. Links expire and can be turned off at any time.
- **Resilient AI.** Retries, an optional fallback model, clear error messages and a Retry button, with per-user rate limits and a usage log.
- **Admin panel.** A read-only `/admin` page with usage, health and growth numbers (counts and metadata only, never content).
- **Try-it demo.** The landing page has a no-sign-up demo that turns one message into a small map.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page with the live demo |
| `/app` | The workspace (add `?workspace=<id>`; `?room=<id>` for a live room) |
| `/login`, `/invite/<token>` | Sign in; join a workspace from an invite link |
| `/share/<token>` | Public read-only view of one shared conversation |
| `/admin` | Read-only admin dashboard (admins only; everyone else gets a 404) |
| `/about`, `/how-it-works`, `/use-cases`, `/demo`, `/blog` | Marketing pages |
| `/privacy`, `/terms` | Legal |
| `/api/analyze` | AI analysis for the workspace (rate-limited, usage-logged) |
| `/api/demo` | Public, rate-limited demo endpoint |
| `/api/workspace/*` | Workspaces, canvas, conversations, meetings, rooms, members, invites, public links |
| `/api/public/<token>` | Public read-only data for a shared conversation |
| `/api/webrtc/ice` | STUN/TURN servers for calls (signed-in users) |
| `/api/health`, `/api/health/ai` | Uptime check; token-protected AI health |

## Tech stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, `@xyflow/react` for the canvas, Supabase (Postgres, Auth, Realtime) for persistence, accounts and collaboration, native WebRTC for meetings, and NVIDIA Nemotron through the OpenAI SDK for the AI. Tests run on Vitest; CI runs on GitHub Actions.

## Getting started

Prerequisites: Node.js 22 and a Supabase project.

```bash
npm install
cp .env.example .env.local     # then fill in your values (see below)
npm run dev
```

Open [http://localhost:3003](http://localhost:3003) for the landing page and [http://localhost:3003/app](http://localhost:3003/app) for the workspace.

### Environment variables

[`.env.example`](.env.example) lists every variable with comments. The required ones:

| Variable | Used for |
| --- | --- |
| `NVIDIA_API_KEY` | AI responses in `/api/analyze` and `/api/demo` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase client (sign-in, live sync) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database access. **Server only: never expose it.** |
| `ECHO_DEMO_MODE` | `true` lets `/app` work without signing in (local development); use `false` in production |

Optional: admin accounts (`ADMIN_EMAILS`), AI rate limits, `HEALTH_CHECK_TOKEN`, a TURN relay for calls ([setup](docs/ai/TURN_SETUP.md)), `ANALYZE_FALLBACK_MODEL`.

### Database

Apply every file in [`supabase/migrations`](supabase/migrations) **in filename order** in the Supabase SQL editor. They create the tables and, importantly, the access rules: the browser never reads or writes the database directly except through row-level read policies and private Realtime channels; all writes go through the Next.js API with the service-role key. After applying a migration that touches permissions, run the live probe:

```bash
node --env-file=.env.local scratch/live_check_security.mjs   # expects: 0 vulnerable or broken
```

Two Supabase dashboard settings also matter: in **Realtime > Settings**, turn **off** "Allow public access" so live rooms stay private to workspace members, and use the **SQL editor** (not the client) for migrations.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop, build and serve on port 3003 |
| `npm run typecheck` | Generates Next route types, then runs `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest: configuration checks plus every self-contained test script (about 10 s) |
| `npm run test:smoke` | HTTP smoke tests against a running production build (`SMOKE_BASE_URL`) |

How the tests are organised, and how to add one: [`tests/README.md`](tests/README.md). Scripts that talk to the real Supabase project live in `scratch/live_check_*` and are run by hand.

## Project notes

- Architecture, phase history and the post-hackathon plan live in [`docs/ai`](docs/ai); start with [`ROADMAP.md`](docs/ai/ROADMAP.md) for what is built and what is next.
- Agents working in this repo should follow [`AGENTS.md`](AGENTS.md) (targeted reads, frozen subsystems, graphify for finding code).
- The demo endpoint keeps its rate limit (5 runs per 10 minutes per IP) in memory, so it resets on cold starts and is not shared across instances.
- Next.js 16 has breaking changes from older versions. See `node_modules/next/dist/docs/` before changing framework-level code.
