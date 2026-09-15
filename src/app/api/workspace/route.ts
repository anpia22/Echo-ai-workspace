/**
 * Phase 13.4 — Workspace API Route: POST /api/workspace
 *
 * Server-only route handler for creating persistent workspaces.
 * Atomically initializes workspace record and owner membership.
 *
 * CRITICAL INVARIANTS:
 * - Client NEVER provides userId or role; authoritative actor is derived on the server.
 * - Responses use serializable Phase 13.1 DTOs only; no raw DB rows.
 * - Server credentials never leak to the client.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../lib/persistence/server/auth";
import { PersistenceError } from "../../lib/persistence/server/errors";
import { WorkspaceRepository } from "../../lib/persistence/repositories/workspaceRepository";
import type { CreateWorkspaceRequest } from "../../lib/persistence/workspaceTypes";

export async function POST(request: Request) {
  try {
    // 1. Authoritative server-side identity resolution
    const actor = await resolveServerActor(request);

    // 2. Parse and validate request body
    let body: Record<string, unknown> = {};
    try {
      const text = await request.text();
      if (text && text.trim() !== "") {
        body = JSON.parse(text);
      }
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Malformed JSON payload" } },
        { status: 400 }
      );
    }

    const title = typeof body.title === "string" && body.title.trim() !== ""
      ? body.title.trim()
      : "Untitled Workspace";

    const description = typeof body.description === "string" ? body.description.trim() : undefined;
    const settings = typeof body.settings === "object" && body.settings !== null
      ? (body.settings as Record<string, unknown>)
      : undefined;

    const displayName = typeof body.displayName === "string" && body.displayName.trim() !== ""
      ? body.displayName.trim()
      : "Owner";

    const color = typeof body.color === "string" && /^#[0-9a-f]{6}$/i.test(body.color)
      ? body.color
      : "#3b82f6";

    const createReq: CreateWorkspaceRequest = {
      title,
      description,
      settings,
    };

    // 3. Execute atomic creation via repository
    const repository = new WorkspaceRepository();
    const result = await repository.createWorkspace(actor, createReq, displayName, color);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create workspace";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
