# Echo AI Workspace — Project Context

## Overview
Echo is a real-time collaborative AI workspace ("AI Workspace That Thinks With You") combining visual graph thinking (Miro/React Flow), live meetings & WebRTC (Google Meet), and intelligent conversational memory powered by NVIDIA Nemotron.

## Technology Stack
- **Framework**: Next.js 16 (App Router)
- **Runtime & Language**: React 19, TypeScript 5
- **Styling**: Tailwind CSS v4, Modern Glassmorphism/Dark UI
- **Canvas / Graph Engine**: `@xyflow/react` (React Flow 12)
- **AI Engine**: NVIDIA Nemotron via OpenAI SDK (`/api/analyze`)
- **Realtime & Database**: Supabase (`@supabase/supabase-js`) PostgreSQL with RLS & Realtime Broadcast/Presence
- **Media / Meetings**: Native WebRTC mesh, track lifecycle, provider-agnostic STT & Insight Pipeline

## Architecture Overview

```text
Frontend (Client Layer)
├── Workspace UI (src/app/app/page.tsx; landing and marketing pages under src/app/(marketing))
├── Canvas (src/app/components/EchoCanvas.tsx, xyflow)
├── Collaboration (PresenceIndicator, RemoteCursors, RoomControls)
├── Meeting Suite (src/app/components/meeting/*)
└── Client Persistence Hook (useClientMigration)

Application Logic & Engines (src/app/lib/*)
├── Action Engine: applyCanvasActions, deduplicateActions, canvasLayout
├── Graph Context: graphContext.ts
├── Commands: moveNodeAction, groupNodesAction
├── Collaboration: Realtime broadcast, follow-me presenter sync
└── Persistence: Repositories (Workspace, Canvas, Conversation, Meeting, Room, Migration)

Backend APIs (src/app/api/*)
├── /api/analyze: AI prompt, transcript ingestion, structured JSON action generation
├── /api/workspace/*: CRUD, canvas state, conversations, meetings, members, invites, public links
├── /api/public/[token]: read-only public view of one shared conversation (no sign-in)
├── /api/webrtc/ice, /api/health, /api/health/ai
└── /admin (server-rendered, admins only)
```

## Current Working Phase
- **Phases 1–17 are complete** (see `PHASE_STATUS.md`). The hackathon is over.
- **Active work is the post-hackathon plan in `ROADMAP.md`** (priorities P0–P3, with status and notes per item). Read it for what is built (auth and teams, rate limiting, observability, tests and CI, security hardening, private live rooms, public share links, admin panel, TURN, conflict handling) and what is next (offline sync, undo/redo, semantic memory).
- Frozen subsystems (see `FROZEN_BOUNDARIES.md`) are only changed when a roadmap task explicitly needs it.

## Core Token Efficiency Rules for Agents
1. **Never perform a whole-project audit**: Do not scan unrelated directories or past phase implementations.
2. **Consult frozen boundaries**: Refer to `FROZEN_BOUNDARIES.md` before reading or modifying files.
3. **Targeted inspection only**: Inspect only the specific files required for the immediate task and their direct imports.
4. **Targeted verification**: Run TypeScript/linter or targeted sub-phase test scripts; avoid sweeping test runs unless completing a major milestone.

## Security model (since the 2026-11 audit)
- **Browser never writes the database.** All reads and writes go through the Next.js API using the service-role key; roles are enforced in code (`requireWorkspaceRole`) and the database refuses direct client writes (see `supabase/migrations/20261110000000_p0_1_security_hardening.sql`).
- **Live rooms are private channels** named `echo-room:<workspace id>:<room id>`, restricted to signed-in workspace members by policies on `realtime.messages`.
- **Public sharing** goes through `/api/public/[token]`, a fixed allow-list view of one conversation and its own canvas; the token is stored only as a hash.
- Re-run `scratch/live_check_security.mjs` after any migration that touches permissions; `scratch/test_p0_1_security_model.mjs` (in `npm test`) replays the migrations in an in-memory Postgres and fails if a hole reopens.

## Finding code
Use the graphify knowledge graph: `python -m graphify query "<question>"` (see `AGENTS.md`).
