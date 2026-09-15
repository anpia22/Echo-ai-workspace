/**
 * Phase 13.9 — Workspace Migration API: /api/workspace/[workspaceId]/migrate
 *
 * Server-only route handler for migrating legacy client localStorage data
 * ("echo-conversations") into a persistent PostgreSQL workspace.
 *
 * CRITICAL INVARIANTS:
 * - Authoritative server-side identity resolution via resolveServerActor.
 * - Client cannot supply userId or role; server enforces workspace write role (viewers get 403).
 * - Tenancy strictly bound to the workspaceId route parameter.
 * - Entire migration executes inside an atomic all-or-nothing database transaction.
 * - Cross-workspace ID collision triggers 409 Conflict and full rollback.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../lib/persistence/server/auth";
import { PersistenceError } from "../../../../lib/persistence/server/errors";
import { MigrationRepository } from "../../../../lib/persistence/repositories/migrationRepository";
import type { MigrateWorkspaceRequest } from "../../../../lib/persistence/migrationTypes";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await context.params;
    if (!workspaceId || !UUID_REGEX.test(workspaceId)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: `Invalid workspace ID format: '${workspaceId}'` } },
        { status: 400 }
      );
    }

    const actor = await resolveServerActor(request);

    let body: Partial<MigrateWorkspaceRequest> = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Malformed JSON request body" } },
        { status: 400 }
      );
    }

    if (!body.payload || body.payload.sourceStorageKey !== "echo-conversations") {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing or invalid payload.sourceStorageKey; must be 'echo-conversations'",
          },
        },
        { status: 400 }
      );
    }

    const migrationReq: MigrateWorkspaceRequest = {
      targetWorkspaceId: workspaceId,
      defaultWorkspaceTitle: body.defaultWorkspaceTitle,
      payload: {
        sourceStorageKey: "echo-conversations",
        exportedAt: body.payload.exportedAt || new Date().toISOString(),
        conversations: body.payload.conversations || [],
      },
    };

    const repository = new MigrationRepository();
    const result = await repository.migrateWorkspace(actor, migrationReq);

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Internal server error during migration";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
