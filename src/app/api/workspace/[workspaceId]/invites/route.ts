/**
 * GET  /api/workspace/[workspaceId]/invites — active invites (owner/admin).
 * POST /api/workspace/[workspaceId]/invites — create an invite link (owner/admin).
 * The raw token is returned once, by POST; only its hash is stored.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../lib/persistence/server/auth";
import { getServerSupabaseClient } from "../../../../lib/persistence/server/db";
import { requireWorkspaceRole } from "../../../../lib/persistence/server/authorization";
import { parseCreateInvite } from "../../../../lib/invites/inviteLogic";
import { createInvite, listActiveInvites } from "../../../../lib/invites/inviteStore";
import { errorResponse, isUuid, readJsonBody, validationError } from "../../../../lib/invites/routeHelpers";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    if (!isUuid(workspaceId)) return validationError("Invalid workspace ID format");
    const actor = await resolveServerActor(request);
    const client = getServerSupabaseClient();
    await requireWorkspaceRole(client, workspaceId, actor, ["owner", "admin"]);
    const invites = await listActiveInvites(client, workspaceId);
    return NextResponse.json({ invites }, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Failed to list invites");
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    if (!isUuid(workspaceId)) return validationError("Invalid workspace ID format");
    const actor = await resolveServerActor(request);
    const client = getServerSupabaseClient();
    await requireWorkspaceRole(client, workspaceId, actor, ["owner", "admin"]);

    const body = await readJsonBody(request);
    if (body === null) return validationError("Malformed JSON payload");
    const parsed = parseCreateInvite(body);
    if (!parsed.ok) return validationError(parsed.message);

    const { invite, token } = await createInvite(client, workspaceId, actor.userId, parsed.value);
    return NextResponse.json({ invite, token }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Failed to create invite");
  }
}
