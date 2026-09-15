/**
 * Phase 13.4 — Workspace API Route: GET /api/workspace/[workspaceId]
 *
 * Server-only route handler for loading and hydrating a persistent workspace.
 * Resolves workspace metadata, members, canvas snapshot, and active conversations.
 *
 * CRITICAL INVARIANTS:
 * - Validates workspaceId format before database querying.
 * - Enforces workspace-scoped authorization; caller must be a verified member.
 * - Returns Phase 13.1 LoadWorkspaceResponse DTO.
 * - Never returns raw database rows or credentials.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../lib/persistence/server/auth";
import { PersistenceError } from "../../../lib/persistence/server/errors";
import { WorkspaceRepository } from "../../../lib/persistence/repositories/workspaceRepository";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> }
) {
  try {
    // 1. Resolve and validate route parameter
    const { workspaceId } = await context.params;
    if (!workspaceId || !UUID_REGEX.test(workspaceId)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: `Invalid workspace ID format: '${workspaceId}'` } },
        { status: 400 }
      );
    }

    // 2. Authoritative server-side identity resolution
    const actor = await resolveServerActor(request);

    // 3. Load unified workspace hydration bundle
    const repository = new WorkspaceRepository();
    const hydration = await repository.loadWorkspace(actor, workspaceId);

    return NextResponse.json(hydration, { status: 200 });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to load workspace";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
