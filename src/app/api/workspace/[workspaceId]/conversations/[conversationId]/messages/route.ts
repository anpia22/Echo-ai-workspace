/**
 * Phase 13.6 — Workspace Messages API: /api/workspace/[workspaceId]/conversations/[conversationId]/messages
 *
 * Server-only route handler for persisting and listing messages within a conversation.
 *
 * CRITICAL INVARIANTS:
 * - Validates workspaceId and conversationId UUID format before database operations.
 * - Authoritative server-side identity resolution via resolveServerActor.
 * - Validates role ("user" | "assistant" | "system") and non-empty content.
 * - Idempotency: duplicate message ID with identical payload returns existing message.
 * - Conflict: duplicate message ID with conflicting payload returns 409 CONFLICT.
 * - Monotonic atomic sequence assigned on server via PostgreSQL append_message_tx.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../../../lib/persistence/server/auth";
import { PersistenceError } from "../../../../../../lib/persistence/server/errors";
import { ConversationRepository } from "../../../../../../lib/persistence/repositories/conversationRepository";
import type { MessageRole } from "../../../../../../lib/persistence/conversationTypes";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ROLES = new Set(["user", "assistant", "system"]);

/**
 * POST /api/workspace/[workspaceId]/conversations/[conversationId]/messages
 * Appends a user or assistant message to the conversation.
 */
export async function POST(
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

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid JSON request body" } },
        { status: 400 }
      );
    }

    const id = typeof body.id === "string" && UUID_REGEX.test(body.id) ? body.id : undefined;
    const role = typeof body.role === "string" ? body.role : undefined;
    const content = typeof body.content === "string" ? body.content : undefined;
    const metadata = body.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, unknown>) : undefined;

    if (!role || !VALID_ROLES.has(role)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: `Invalid or missing message role: '${role}'. Must be 'user', 'assistant', or 'system'` } },
        { status: 400 }
      );
    }

    if (!content || content.trim() === "") {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Message content cannot be empty" } },
        { status: 400 }
      );
    }

    const repository = new ConversationRepository();
    const result = await repository.appendMessage(actor, {
      id,
      workspaceId,
      conversationId,
      role: role as MessageRole,
      content,
      metadata,
    });

    return NextResponse.json({ ok: true, message: result.message }, { status: 201 });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to append message";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workspace/[workspaceId]/conversations/[conversationId]/messages
 * Lists all messages in the conversation chronologically.
 */
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
    const messages = await repository.listMessages(actor, workspaceId, conversationId);

    return NextResponse.json({ ok: true, messages }, { status: 200 });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to list messages";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
