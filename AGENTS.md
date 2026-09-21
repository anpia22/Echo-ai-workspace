<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Echo AI Workspace — Agent Rules & Token Efficiency Protocol

Before inspecting code or executing tasks, adhere to the following rules:

1. **Do NOT perform full-project audits**:
   - Never audit the entire codebase or scan unrelated directories.
   - Trust the documented status in `docs/ai/PHASE_STATUS.md` and `docs/ai/VERIFICATION_MATRIX.md`.

2. **Respect Frozen Boundaries**:
   - Check `docs/ai/FROZEN_BOUNDARIES.md`. Subsystems marked FROZEN (Phase 1–13: Persistence, WebRTC, Collaboration, Follow Me, Canvas Engine) must NOT be modified or re-audited unless the user prompt specifically instructs you to modify them.

3. **Targeted Inspection Only**:
   - Consult `docs/ai/PROJECT_CONTEXT.md` for overall architecture.
   - Open and read only the files directly involved in the current phase/task.
   - Use targeted grep/symbol searches rather than reading large files in bulk.

4. **Targeted Verification**:
   - Run verification only for the files or phase being touched (e.g. `npx tsc --noEmit` or task-specific test runner). Do not trigger full multi-suite regressions on routine incremental edits.
