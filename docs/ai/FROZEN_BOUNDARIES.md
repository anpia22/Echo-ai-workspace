# Echo AI Workspace — Frozen Boundaries

> **CRITICAL RULE FOR ALL AI ASSISTANTS**:
> The subsystems listed below are **COMPLETED, TESTED, AND FROZEN**.
> Do **NOT** modify, refactor, reorganize, or re-audit these files unless the prompt explicitly instructs you to modify that exact subsystem.

---

## 1. Phase 13 — Persistence & Backend Repositories
- **Status**: 🟢 FROZEN
- **Protected Paths**:
  - `src/app/lib/persistence/**/*`
  - `src/app/api/workspace/**/*`
  - `supabase/**/*`
- **Protected Systems**:
  - `WorkspaceRepository`, `CanvasRepository`, `ConversationRepository`, `MeetingRepository`, `RoomRepository`, `MigrationRepository`
  - REST endpoints: `/api/workspace`, `/api/workspace/[workspaceId]/*`
  - Client migration hooks (`useClientMigration`) and cutover hash guards
  - PostgreSQL schema, DDL, triggers, and RLS policies
- **Verification Guarantee**: Phase 13.1 through 13.9 passed 100% of unit tests.

---

## 2. Phase 12 — WebRTC & Meeting System
- **Status**: 🟢 FROZEN
- **Protected Paths**:
  - `src/app/components/meeting/**/*`
  - WebRTC signaling handlers, ICE candidate exchange, track replacement
  - STT adapters, normalized transcript events
  - `MeetingInsight` data pipeline and deterministic 53-bit insight IDs
- **Protected Systems**:
  - P2P mesh WebRTC state machine
  - Screen share negotiation and presenter track replacement
  - Meeting dock UI lifecycle and floating panel behavior
- **Verification Guarantee**: Phase 12.1 through 12.7 passed and verified with multi-browser testing.

---

## 3. Phase 10 & 11 — Real-Time Collaboration & Follow Me Mode
- **Status**: 🟢 FROZEN
- **Protected Paths**:
  - `src/app/lib/collaboration/**/*`
  - `src/app/components/PresenceIndicator.tsx`
  - `src/app/components/RemoteCursors.tsx`
  - `src/app/components/RoomControls.tsx`
- **Protected Systems**:
  - Supabase Realtime broadcast channels & presence state
  - Cursor coordinates synchronization & throttle loop
  - Presenter follow-me camera synchronization & user-interrupt handlers
- **Verification Guarantee**: Verified in dual-peer room testing.

---

## 4. Phase 8 — Canvas Action Engine
- **Status**: 🟢 FROZEN
- **Protected Paths**:
  - `src/app/lib/applyCanvasActions.ts`
  - `src/app/lib/deduplicateActions.ts`
  - `src/app/lib/canvasLayout.ts`
  - `src/app/lib/moveNodeAction.ts`
  - `src/app/lib/groupNodesAction.ts`
- **Protected Systems**:
  - `CREATE_NODE`, `CREATE_EDGE`, `MOVE_NODE`, `DELETE_NODE`, `UPDATE_NODE`, `GROUP_NODES`
  - Collision-free node layout calculation and action deduplication
- **Verification Guarantee**: Canvas command action pipeline verified.

---

## 5. Phase 14 — AI Context & Memory
- **Status**: 🟢 FROZEN
- **Protected Paths**:
  - `src/app/lib/ai/**/*`
  - `src/app/api/analyze/route.ts` (context assembly & prompt budgeting portions)
  - `src/app/api/workspace/[workspaceId]/meetings/[meetingId]/transcripts/**/*`
  - `src/app/api/workspace/[workspaceId]/meetings/[meetingId]/insights/**/*`
- **Protected Systems**:
  - `AIContextEngine`: authorization checks, tenant scoping, and bounded historical data retrieval
  - `classifyAIIntent`: deterministic temporal and historical intent classification
  - `aiPromptBuilder`: bounded markdown prompt assembly, Unicode-safe truncation, token estimation, and internal DB ID scrubbing
  - Meeting transcript and insight persistence bridge
- **Verification Guarantee**: PASS (14.2: 11/11, 14.3: 11/11, 14.4: 13/13, 14.5: 14/14, 14.6: 8/8) with live provider execution deferred.

