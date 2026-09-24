/**
 * Phase 13.6 — Workspace Conversation Detail API: /api/workspace/[workspaceId]/conversations/[conversationId]
 *
 * Server-only route handler for retrieving a conversation and its full message history.
 *
 * CRITICAL INVARIANTS:
 * - Validates workspaceId and conversationId UUID format before database querying.
 * - Enforces workspace-scoped authorization; caller must be a verified member.
 * - Enforces conversation tenancy within the specified workspace.
 * - Returns Phase 13.1 compliant DTOs.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../../lib/persistence/server/auth";
import { PersistenceError } from "../../../../../lib/persistence/server/errors";
import { ConversationRepository } from "../../../../../lib/persistence/repositories/conversationRepository";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; conversationId: string }> }
) {
  try {
    const { workspaceId, conversationId } = await context.params;

    if (!workspaceId || !UUID_REGEX.test(workspaceId)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: `Invalid workspace ID format: '${workspaceId}'` } },
        { status: 400 }
      );
    }

    if (!conversationId || !UUID_REGEX.test(conversationId)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: `Invalid conversation ID format: '${conversationId}'` } },
        { status: 400 }
      );
    }

    const actor = await resolveServerActor(request);

    const repository = new ConversationRepository();
    const [conversation, messages] = await Promise.all([
      repository.getConversation(actor, workspaceId, conversationId),
      repository.listMessages(actor, workspaceId, conversationId),
    ]);

    return NextResponse.json({ ok: true, conversation, messages }, { status: 200 });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to load conversation";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string; conversationId: string }> }
) {
  try {
    const { workspaceId, conversationId } = await context.params;

    if (!workspaceId || !UUID_REGEX.test(workspaceId)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: `Invalid workspace ID format: '${workspaceId}'` } },
        { status: 400 }
      );
    }

    if (!conversationId || !UUID_REGEX.test(conversationId)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: `Invalid conversation ID format: '${conversationId}'` } },
        { status: 400 }
      );
    }

    const actor = await resolveServerActor(request);
    const body = await request.json().catch(() => ({}));
    const updates: { title?: string; metadata?: Record<string, unknown> } = {};

    if (typeof body.title === "string" && body.title.trim()) {
      updates.title = body.title.trim();
    }

    if (body.metadata && typeof body.metadata === "object") {
      updates.metadata = body.metadata;
    }

    if (!updates.title && !updates.metadata) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "No valid update fields provided" } },
        { status: 400 }
      );
    }

    const repository = new ConversationRepository();
    const updated = await repository.updateConversation(actor, workspaceId, conversationId, updates);

    return NextResponse.json({ ok: true, conversation: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to update conversation";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
