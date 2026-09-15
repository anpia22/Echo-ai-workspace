/**
 * Phase 13.8 — Workspace Collaboration Rooms API: /api/workspace/[workspaceId]/rooms
 *
 * Server-only route handler for creating and listing collaboration room sessions.
 *
 * CRITICAL INVARIANTS:
 * - Authoritative server-side identity resolution via resolveServerActor.
 * - Client cannot supply timestamps or user credentials.
 * - Client roomId is strictly an opaque correlation token matching Phase 10 realtime channel identity.
 * - Tenancy is strictly bounded to the workspaceId route parameter.
 * - Read-only operations allowed for viewers; writes require owner/admin/editor/member.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../lib/persistence/server/auth";
import { PersistenceError } from "../../../../lib/persistence/server/errors";
import { RoomRepository } from "../../../../lib/persistence/repositories/roomRepository";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/workspace/[workspaceId]/rooms
 * Records room session start in historical persistence.
 */
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

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    // Client-provided roomId is strictly an opaque correlation identifier
    const rawRoomId = typeof body.roomId === "string" && body.roomId.trim().length > 0
      ? body.roomId.trim()
      : crypto.randomUUID();

    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    const metadata = body.metadata && typeof body.metadata === "object"
      ? (body.metadata as Record<string, unknown>)
      : undefined;

    const repository = new RoomRepository();
    const result = await repository.createRoom(actor, {
      roomId: rawRoomId,
      workspaceId,
      title,
      metadata,
    });

    return NextResponse.json({ ok: true, room: result.room }, { status: 201 });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to record room start";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workspace/[workspaceId]/rooms
 * Lists historical room sessions in the workspace.
 */
export async function GET(
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

    const repository = new RoomRepository();
    const result = await repository.listRooms(actor, workspaceId);

    return NextResponse.json(
      { ok: true, rooms: result.rooms, totalCount: result.totalCount },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to list room history";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
