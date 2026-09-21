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
├── Workspace UI (src/app/page.tsx)
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
└── /api/workspace/*: CRUD, canvas state, conversations, meetings, cutover migrations
```

## Current Working Phase
- **Active Phase**: Phase 14 — AI Context & Memory
- **Upcoming**: Phase 15 (UX & Visual Polish), Phase 16 (Reliability), Phase 17 (Hackathon Demo)

## Core Token Efficiency Rules for Agents
1. **Never perform a whole-project audit**: Do not scan unrelated directories or past phase implementations.
2. **Consult frozen boundaries**: Refer to `FROZEN_BOUNDARIES.md` before reading or modifying files.
3. **Targeted inspection only**: Inspect only the specific files required for the immediate task and their direct imports.
4. **Targeted verification**: Run TypeScript/linter or targeted sub-phase test scripts; avoid sweeping test runs unless completing a major milestone.
