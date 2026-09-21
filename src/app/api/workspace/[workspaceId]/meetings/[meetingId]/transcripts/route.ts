/**
 * Phase 14.2 — Meeting Transcripts API: /api/workspace/[workspaceId]/meetings/[meetingId]/transcripts
 *
 * Read-only endpoint for retrieving canonical meeting transcript segments.
 *
 * CRITICAL INVARIANTS:
 * - Server-authoritative actor resolution via resolveServerActor.
 * - Workspace tenancy and membership enforced via MeetingRepository.listTranscriptSegments.
 * - Read-only: strictly NO mutation capabilities on this route.
 * - Returns canonical persisted records ordered by sequence ASC, timestamp ASC, id ASC.
 * - Meeting isolation: guarantees meeting belongs to the requested workspace.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../../../lib/persistence/server/auth";
import { PersistenceError } from "../../../../../../lib/persistence/server/errors";
import { MeetingRepository } from "../../../../../../lib/persistence/repositories/meetingRepository";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/workspace/[workspaceId]/meetings/[meetingId]/transcripts
 * Retrieves canonical finalized transcript segments for a meeting in the workspace.
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
    const transcripts = await repository.listTranscriptSegments(actor, workspaceId, meetingId.trim());

    return NextResponse.json(
      {
        ok: true,
        transcripts,
        segments: transcripts,
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

    const message = error instanceof Error ? error.message : "Failed to retrieve transcript segments";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
