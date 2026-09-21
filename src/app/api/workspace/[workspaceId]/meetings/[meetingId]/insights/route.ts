/**
 * Phase 14.2 — Meeting Insights API: /api/workspace/[workspaceId]/meetings/[meetingId]/insights
 *
 * Read-only endpoint for retrieving synthesized meeting insights.
 *
 * CRITICAL INVARIANTS:
 * - Server-authoritative actor resolution via resolveServerActor.
 * - Workspace tenancy and membership enforced via MeetingRepository.listMeetingInsights.
 * - Read-only: strictly NO mutation capabilities on this route.
 * - Returns canonical persisted records ordered by timestamp ASC.
 * - Meeting isolation: guarantees meeting belongs to the requested workspace.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../../../lib/persistence/server/auth";
import { PersistenceError } from "../../../../../../lib/persistence/server/errors";
import { MeetingRepository } from "../../../../../../lib/persistence/repositories/meetingRepository";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/workspace/[workspaceId]/meetings/[meetingId]/insights
 * Retrieves canonical synthesized insights for a meeting in the workspace.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; meetingId: string }> }
) {
  try {
    const { workspaceId, meetingId } = await context.params;
    if (!workspaceId || !UUID_REGEX.test(workspaceId)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: `Invalid workspace ID format: '${workspaceId}'` } },
        { status: 400 }
      );
    }
    if (!meetingId || meetingId.trim().length === 0) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "meetingId cannot be empty" } },
        { status: 400 }
      );
    }

    const actor = await resolveServerActor(request);

    const repository = new MeetingRepository();
    const insights = await repository.listMeetingInsights(actor, workspaceId, meetingId.trim());

    return NextResponse.json(
      {
        ok: true,
        insights,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to retrieve meeting insights";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
