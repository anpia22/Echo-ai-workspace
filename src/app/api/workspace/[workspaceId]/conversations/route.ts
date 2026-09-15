/**
 * Phase 13.6 — Workspace Conversations API: /api/workspace/[workspaceId]/conversations
 *
 * Server-only route handler for creating and listing conversations within a persistent workspace.
 *
 * CRITICAL INVARIANTS:
 * - Validates workspaceId format before database querying.
 * - Enforces workspace-scoped authorization; caller must be a verified member.
 * - Authoritative server-side identity resolution via resolveServerActor.
 * - Client cannot self-assign permissions or bypass tenancy.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../lib/persistence/server/auth";
import { PersistenceError } from "../../../../lib/persistence/server/errors";
import { ConversationRepository } from "../../../../lib/persistence/repositories/conversationRepository";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/workspace/[workspaceId]/conversations
 * Creates a new conversation in the workspace.
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
      // Body can be empty for default conversation creation
      body = {};
    }

    const id = typeof body.id === "string" && UUID_REGEX.test(body.id) ? body.id : undefined;
    const title = typeof body.title === "string" ? body.title : undefined;
    const metadata = body.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, unknown>) : undefined;

    const repository = new ConversationRepository();
    const result = await repository.createConversation(actor, {
      id,
      workspaceId,
      title,
      metadata,
    });

    return NextResponse.json({ ok: true, conversation: result.conversation }, { status: 201 });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create conversation";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workspace/[workspaceId]/conversations
 * Lists all conversations in the workspace.
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

    const repository = new ConversationRepository();
    const conversations = await repository.listConversations(actor, workspaceId);

    return NextResponse.json({ ok: true, conversations }, { status: 200 });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to list conversations";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}