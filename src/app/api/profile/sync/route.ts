/**
 * POST /api/profile/sync
 *
 * Copies the signed-in user's verified profile display name onto their
 * workspace_members rows, so member lists show the name they chose.
 * The name is read server-side from Supabase Auth, never from the request body.
 * No-op (synced: false) for the dev/demo actor, which has no real account.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../lib/persistence/server/auth";
import { PersistenceError } from "../../../lib/persistence/server/errors";
import { getServerSupabaseClient } from "../../../lib/persistence/server/db";
import { resolveProfileDisplayName } from "../../../lib/persistence/server/profile";

export async function POST(request: Request) {
  try {
    const actor = await resolveServerActor(request);

    const name = await resolveProfileDisplayName(actor.userId);
    if (!name) {
      return NextResponse.json({ synced: false });
    }

    const client = getServerSupabaseClient();
    const { error } = await client
      .from("workspace_members")
      .update({ display_name: name, updated_at: new Date().toISOString() })
      .eq("user_id", actor.userId);

    if (error) {
      return NextResponse.json(
        { error: { code: "DATABASE_ERROR", message: "Failed to sync profile" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ synced: true });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus() }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to sync profile" } },
      { status: 500 }
    );
  }
}
