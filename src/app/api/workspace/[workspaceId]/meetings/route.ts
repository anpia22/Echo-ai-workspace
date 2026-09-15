/**
 * Phase 13.7 — Workspace Meetings API: /api/workspace/[workspaceId]/meetings
 *
 * Server-only route handler for creating and listing meeting sessions within a persistent workspace.
 *
 * CRITICAL INVARIANTS:
 * - Server-authoritative actor resolution via resolveServerActor(request).
 * - Client-supplied meetingId is strictly an opaque correlation/idempotency ID.
 * - Client CANNOT supply startedAt, endedAt, or creator identity.
 * - Tenancy is strictly bounded to the workspaceId in route parameters.
 * - Read-only operations allowed for viewers; writes require owner/admin/editor/member.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../lib/persistence/server/auth";
import { PersistenceError } from "../../../../lib/persistence/server/errors";
import { MeetingRepository } from "../../../../lib/persistence/repositories/meetingRepository";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/workspace/[workspaceId]/meetings
 * Records meeting session start in historical persistence.
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

    // Client-provided meetingId is strictly an opaque correlation identifier (Option B)
    const rawMeetingId = typeof body.meetingId === "string" && body.meetingId.trim().length > 0
      ? body.meetingId.trim()
      : crypto.randomUUID();

    const title = typeof body.title === "string" ? body.title.trim() : undefined;

    const repository = new MeetingRepository();
    const result = await repository.createMeeting(actor, {
      meetingId: rawMeetingId,
      workspaceId,
      title,
    });

    return NextResponse.json({ ok: true, meeting: result.meeting }, { status: 201 });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to record meeting start";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workspace/[workspaceId]/meetings
 * Lists historical meetings in the workspace.
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

    const repository = new MeetingRepository();
    const result = await repository.getMeetingHistory(actor, workspaceId);

    return NextResponse.json(
      { ok: true, meetings: result.meetings, totalCount: result.totalCount },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to list meeting history";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
