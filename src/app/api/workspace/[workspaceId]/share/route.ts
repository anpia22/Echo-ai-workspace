/**
 * GET  /api/workspace/[workspaceId]/share — active public links (owner/admin).
 * POST /api/workspace/[workspaceId]/share — publish: create a read-only public link (owner/admin).
 * The raw token is returned once, by POST; only its hash is stored.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../lib/persistence/server/auth";
import { getServerSupabaseClient } from "../../../../lib/persistence/server/db";
import { requireWorkspaceRole } from "../../../../lib/persistence/server/authorization";
import { parseCreateShare } from "../../../../lib/share/shareLogic";
import { createShareLink, listActiveShareLinks } from "../../../../lib/share/shareStore";
import { errorResponse, isUuid, readJsonBody, validationError } from "../../../../lib/invites/routeHelpers";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    if (!isUuid(workspaceId)) return validationError("Invalid workspace ID format");
    const actor = await resolveServerActor(request);
    const client = getServerSupabaseClient();
    await requireWorkspaceRole(client, workspaceId, actor, ["owner", "admin"]);
    return NextResponse.json({ links: await listActiveShareLinks(client, workspaceId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Failed to list public links");
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
    const parsed = parseCreateShare(body);
    if (!parsed.ok) return validationError(parsed.message);

    const { link, token } = await createShareLink(client, workspaceId, actor.userId, parsed.value);
    return NextResponse.json({ link, token }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Failed to create public link");
  }
}
