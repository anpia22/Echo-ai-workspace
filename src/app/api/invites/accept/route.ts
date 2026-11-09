/**
 * POST /api/invites/accept { token } — join a workspace through an invite link.
 * Requires a real signed-in account (the dev/demo fallback identity cannot join).
 */

import { NextResponse } from "next/server";
import { resolveServerIdentity } from "../../../lib/persistence/server/auth";
import { getServerSupabaseClient } from "../../../lib/persistence/server/db";
import { PersistenceError } from "../../../lib/persistence/server/errors";
import { resolveProfileDisplayName } from "../../../lib/persistence/server/profile";
import { isPlausibleInviteToken } from "../../../lib/invites/inviteLogic";
import { acceptInvite } from "../../../lib/invites/inviteStore";
import { errorResponse, readJsonBody, validationError } from "../../../lib/invites/routeHelpers";

export async function POST(request: Request) {
  try {
    const { actor, authenticated } = await resolveServerIdentity(request);
    if (!authenticated) {
      throw new PersistenceError("UNAUTHORIZED", "Sign in to accept this invite.");
    }

    const body = await readJsonBody(request);
    if (body === null) return validationError("Malformed JSON payload");
    const token = (body as Record<string, unknown>).token;
    // A malformed token is indistinguishable from an unknown one.
    if (!isPlausibleInviteToken(token)) {
      throw new PersistenceError("NOT_FOUND", "This invite link is not valid.");
    }

    const displayName = (await resolveProfileDisplayName(actor.userId)) ?? "Member";
    const result = await acceptInvite(getServerSupabaseClient(), token, actor.userId, displayName);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Failed to accept invite");
  }
}
