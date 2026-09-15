/**
 * Phase 13.5 — Canvas Persistence API Route
 * POST /api/workspace/[workspaceId]/canvas
 *
 * Accepts a batch canvas mutation (nodes, edges, groups) with an OCC revision check.
 * Delegates to CanvasRepository.mutateCanvas() which calls apply_canvas_mutation_tx.
 *
 * CRITICAL INVARIANTS:
 * - Actor is NEVER derived from request body; resolved server-side only.
 * - expectedBaseRevision is required and must be >= 1.
 * - Empty mutation batches are rejected (no revision bump on zero operations).
 * - STALE_REVISION → 409 with deterministic body; caller must NOT auto-retry blindly.
 * - Service role key is never exposed in responses.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../lib/persistence/server/auth";
import { PersistenceError } from "../../../../lib/persistence/server/errors";
import { CanvasRepository } from "../../../../lib/persistence/repositories/canvasRepository";
import type { CanvasMutationRequest } from "../../../../lib/persistence/canvasTypes";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> }
) {
  try {
    // 1. Validate workspaceId route parameter
    const { workspaceId } = await context.params;
    if (!workspaceId || !UUID_REGEX.test(workspaceId)) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: `Invalid workspace ID: '${workspaceId}'` },
        { status: 400 }
      );
    }

    // 2. Authoritative server-side identity resolution (never trust client body)
    const actor = await resolveServerActor(request);

    // 3. Parse request body
    let body: Record<string, unknown> = {};
    try {
      const text = await request.text();
      if (text && text.trim() !== "") {
        body = JSON.parse(text) as Record<string, unknown>;
      }
    } catch {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Malformed JSON payload" },
        { status: 400 }
      );
    }

    // 4. Validate expectedBaseRevision (required, must be a safe integer >= 1)
    const expectedBaseRevision = body.expectedBaseRevision;
    if (
      typeof expectedBaseRevision !== "number" ||
      !Number.isSafeInteger(expectedBaseRevision) ||
      expectedBaseRevision < 1
    ) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "expectedBaseRevision must be a safe integer >= 1" },
        { status: 400 }
      );
    }

    // 5. Extract and validate mutation arrays
    const upsertNodes = Array.isArray(body.upsertNodes) ? body.upsertNodes : [];
    const deleteNodeIds = Array.isArray(body.deleteNodeIds) ? body.deleteNodeIds : [];
    const upsertEdges = Array.isArray(body.upsertEdges) ? body.upsertEdges : [];
    const deleteEdgeIds = Array.isArray(body.deleteEdgeIds) ? body.deleteEdgeIds : [];
    const upsertGroups = Array.isArray(body.upsertGroups) ? body.upsertGroups : [];
    const deleteGroupIds = Array.isArray(body.deleteGroupIds) ? body.deleteGroupIds : [];

    // 6. Guard: reject empty mutation batches — no DB call, no revision bump
    const totalOperations =
      upsertNodes.length +
      deleteNodeIds.length +
      upsertEdges.length +
      deleteEdgeIds.length +
      upsertGroups.length +
      deleteGroupIds.length;

    if (totalOperations === 0) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Mutation batch is empty; at least one operation is required" },
        { status: 400 }
      );
    }

    // 7. Build canonical CanvasMutationRequest (server-side; actor from Step 2)
    const mutationReq: CanvasMutationRequest = {
      workspaceId,
      expectedBaseRevision,
      upsertNodes: upsertNodes as CanvasMutationRequest["upsertNodes"],
      deleteNodeIds: deleteNodeIds as string[],
      upsertEdges: upsertEdges as CanvasMutationRequest["upsertEdges"],
      deleteEdgeIds: deleteEdgeIds as string[],
      upsertGroups: upsertGroups as CanvasMutationRequest["upsertGroups"],
      deleteGroupIds: deleteGroupIds as string[],
    };

    // 8. Execute via CanvasRepository (delegates to apply_canvas_mutation_tx RPC)
    const repository = new CanvasRepository();
    const result = await repository.mutateCanvas(actor, mutationReq);

    // 9. Return authoritative revision to client for next-call OCC
    return NextResponse.json(
      {
        ok: true,
        workspaceId: result.workspaceId,
        previousRevision: expectedBaseRevision,
        newRevision: result.newRevision,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof PersistenceError) {
      // Deterministic conflict response for stale revision — caller must NOT auto-retry
      if (error.code === "STALE_REVISION") {
        return NextResponse.json(
          {
            ok: false,
            code: "STALE_REVISION",
            message: error.message,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.toHttpStatus() }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to persist canvas mutation";
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
