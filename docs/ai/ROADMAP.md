# Echo AI Workspace — Post-Hackathon Roadmap

Phases 1–17 are complete (see `PHASE_STATUS.md`). This file tracks what to build next.
Frozen subsystems (see `FROZEN_BOUNDARIES.md`) must only be modified when a task below explicitly requires it.

**Priority legend**
- 🔴 **P0**: Foundation. Do first; later work depends on it.
- 🟠 **P1**: High value. Do right after P0.
- 🟡 **P2**: Product depth. Differentiators.
- 🟢 **P3**: Growth and polish.

**Status legend**: ⬜ Not started · 🔄 In progress · ✅ Done

---

## 🔴 P0 — Foundations

| # | Item | Status | Notes |
|---|---|---|---|
| P0.1 | Real authentication and access control | 🔄 | **Done:** server reads the Supabase session cookie (validated via `getUser()`); `/app` redirects signed-out users to `/login` unless `ECHO_DEMO_MODE=true`; 10 tests in `scratch/test_p0_1_auth_actor.ts`. **Done (slice 2):** user menu with Edit profile + Sign out in the app header; onboarding (`OnboardingGuard`) asks signed-in users to confirm a display name before the app mounts; the name drives presence/cursors/meetings via `participant.ts`; `/api/profile/sync` copies it to `workspace_members`; 29 tests in `scratch/test_p0_1_profile_name.ts`. **Done (slice 3):** `GET /api/workspace` lists the account's workspaces, so projects/history follow the user across sign-out and devices (hydration asks the server first; the browser pointer is only a hint and is no longer deleted on 403); 13 tests in `scratch/test_p0_1_list_workspaces.ts`. **Remaining:** verify a real signed-in session end to end (not yet done with a live account), invite links and role management (owner / editor / viewer), RLS policy audit, retire the hardcoded `CANONICAL_FALLBACK_WORKSPACE_ID` and the shared demo identity before a public launch. |
| P0.2 | Rate limiting and cost control on `/api/analyze` | 🔄 | **Built:** `src/app/lib/usage/` guard wraps `/api/analyze` (covers requests with no `workspaceId` too); signed-in users keyed by user id (default 30 per hour), anonymous/demo by salted IP hash (default 10 per hour); 429 + `Retry-After` + readable message the UI already displays; env config `AI_RATE_LIMIT_USER_MAX` / `AI_RATE_LIMIT_ANON_MAX` / `AI_RATE_LIMIT_WINDOW_MINUTES` / `AI_RATE_LIMIT_DISABLED`; 55 tests in `scratch/test_p0_2_rate_limit.ts`; verified through the live route. **Still to do:** apply `supabase/migrations/20261108000000_p0_2_ai_usage_events.sql` (until then limits are per server instance, in memory); a dedicated "limit reached" UI state beyond the error message; usage logging and limits for `/api/demo` (it keeps its own per-IP limiter); token counts. Original scope: per-user limits, request timeouts, usage tracking, clear "limit reached" UI state. Protects the NVIDIA quota. **Also creates the shared usage log** (`ai_usage_events`, written by `/api/analyze`: actor, route, model, status, latency; no prompt or response content; token counts not recorded yet) that P0.3 and P1.6 read. Proposed defaults: 30 AI requests per user per hour, lower for signed-out demo visitors. |
| P0.3 | Observability | ⬜ | Error monitoring (e.g. Sentry), structured logs for AI calls (latency, failures, retries), basic analytics. Reuses the P0.2 usage log for latency and error data. Also verify the live provider path (Phase 14 deferred this). |
| P0.4 | Real test suite and CI | ⬜ | Move `scratch/` scripts into Vitest (logic) and Playwright (browser flows). Run in `.github` workflow. |

## 🟠 P1 — Reliability of the hard parts

| # | Item | Status | Notes |
|---|---|---|---|
| P1.1 | TURN server for WebRTC | ⬜ | Mesh calls fail on strict NATs and mobile networks without it. (Twilio, Metered or Cloudflare.) |
| P1.2 | Collaboration conflict handling | ⬜ | Define behavior for simultaneous edits. Consider Yjs/CRDT, or versioned operations plus undo/redo history. |
| P1.3 | Offline and reconnect sync | ⬜ | Queue edits locally and replay on reconnect. |
| P1.4 | AI failure fallback | ⬜ | Clear message or retry when NVIDIA is slow, down or rate-limited. No hangs. |
| P1.5 | SFU for larger meetings | ⬜ | Mesh breaks past about 4–5 people. LiveKit is the easiest route. Only if meetings are core to the product. |
| P1.6 | Admin panel (read-only) at `/admin` | ⬜ | **Blocked by P0.1 (done), P0.2 and P0.3**: it is a read-only view over the shared usage log, so it has nothing to show until that exists. Admin identity = server-side allowlist (env var), checked in every admin API route; non-admins get a 404. Panel v1: users (total / new per day / active), workspaces and rooms (counts, recent activity), AI (requests per day, avg and slowest latency, error rate, top users), health strip (NVIDIA reachable, Supabase reachable). **Metadata and counts only; no conversation, canvas or transcript content** (see Decisions). |

## 🟡 P2 — Product depth (differentiators)

| # | Item | Status | Notes |
|---|---|---|---|
| P2.1 | Workspace-wide semantic memory | ⬜ | pgvector in Supabase, embeddings of nodes, messages and transcripts, "what did we decide about X?" with links back to source nodes. **Strongest differentiator.** |
| P2.2 | Streaming AI responses and actions | ⬜ | Nodes appear as the model produces them. Show an "AI is working" presence indicator to collaborators. |
| P2.3 | Multi-model support with fallback | ⬜ | Provider abstraction over NVIDIA, Claude and others, with automatic fallback and per-task model choice. |
| P2.4 | Agentic actions with human approval | ⬜ | AI proposes multi-step changes as a reviewable diff the user accepts or rejects. |
| P2.5 | Meeting-to-canvas pipeline | ⬜ | Transcripts become action items, decisions and linked nodes. Optional sync to Notion, Linear, Slack. |

## 🟢 P3 — Growth and polish

| # | Item | Status | Notes |
|---|---|---|---|
| P3.1 | Templates and starter workspaces | ⬜ | |
| P3.2 | Export and import | ⬜ | Export PNG, PDF, Markdown, JSON. Import from Miro or Mermaid. Shareable read-only links. |
| P3.3 | Mobile and touch support | ⬜ | |
| P3.4 | Accessibility pass | ⬜ | Keyboard navigation of the canvas, screen reader labels. |
| P3.5 | Billing and plans | ⬜ | Requires usage tracking from P0.2. |
| P3.6 | Admin controls | ⬜ | Suspend a user, raise or lower a user's limit, revoke invites. Only after P1.6 has run read-only for a while. Every action is written to an audit log. |

---

## Housekeeping (small, do anytime)

- ⬜ Add `.env.example` (no real values) and confirm `.env.local` was never committed. Rotate keys if it was.
- ⬜ Move or remove clutter: `scratch/`, `scratch_test.js`, `seo/`, `seo-agent/`, `seo-agent-kit/`.
- ⬜ Update `PROJECT_CONTEXT.md` ("Current Working Phase" still says Phase 14).
- ⬜ Refresh the README: what Echo is, screenshot or GIF, setup steps, architecture.

## Recommended order

1. P0.1 (finish: invites and roles), P0.2 (with the usage log), P0.3, P0.4 (can overlap)
2. **P1.6 Admin panel (read-only)**, right after the usage log exists
3. P1.1, P1.4, then P1.2 and P1.3
4. P2.1, then P2.2 and P2.4
5. P1.5, P2.3, P2.5 as needed
6. P3 items by user demand; P3.6 Admin controls after P1.6 has been used for a while

## Decisions

- **Admin panel privacy (open):** v1 shows counts and metadata only, never conversation, canvas or transcript content. If support ever needs to view content, that needs an explicit reason, a separate permission and an audit log entry per view.
- **Admin access (proposed):** allowlist of admin accounts in a server-side environment variable; no user-editable admin flag; non-admins receive a 404 from `/admin` and its APIs.

## Open decision

Product direction affects ordering: for a real product with users, keep P0.1 (auth) and P3.5 (billing) high. For a technical showcase, P2.1 (semantic memory) can move up ahead of auth.
