/**
 * GET /api/public/[token]?v=<etag> — the read-only public view of a shared workspace.
 *
 * No sign-in: the secret token IS the credential. Unknown, revoked and expired tokens all get the
 * same 404. Visitors are rate-limited per address. If `v` matches the current content tag the
 * response is a tiny { unchanged: true }, so polling is cheap.
 */

import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "../../../lib/persistence/server/db";
import { isPlausibleInviteToken } from "../../../lib/invites/inviteLogic";
import { loadPublicView } from "../../../lib/share/shareStore";
import { MemoryWindowCounter, getClientIpHash } from "../../../lib/usage/rateLimit";
import { logger } from "../../../lib/observability/logger";

export const dynamic = "force-dynamic";

// Polling every 5 s is 12 requests a minute; allow a few tabs.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const counter = new MemoryWindowCounter();

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: HEADERS });

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  const ipKey = getClientIpHash(request, process.env.USAGE_HASH_SALT ?? "echo-public-view");
  const now = Date.now();
  if (counter.snapshot(ipKey, now, WINDOW_MS).count >= MAX_PER_WINDOW) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { ...HEADERS, "Retry-After": "30" } }
    );
  }
  counter.record(ipKey, now);

  // A malformed token is indistinguishable from an unknown one, and never reaches the database.
  if (!isPlausibleInviteToken(token)) return notFound();

  try {
    const view = await loadPublicView(getServerSupabaseClient(), token);
    if (!view) return notFound();

    const known = new URL(request.url).searchParams.get("v");
    if (known && known === view.etag) {
      return NextResponse.json({ unchanged: true, etag: view.etag }, { headers: HEADERS });
    }
    return NextResponse.json(view, { headers: HEADERS });
  } catch (error) {
    logger.error("share.public_view_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Temporarily unavailable" }, { status: 503, headers: { ...HEADERS, "Retry-After": "10" } });
  }
}
