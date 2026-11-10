/**
 * GET /api/webrtc/ice — STUN/TURN servers for the caller's WebRTC connections.
 *
 * Signed-in (or demo-mode) callers only: TURN relay traffic costs money, so credentials are
 * not handed to anonymous visitors. Responses are never cached by the browser or CDN. The
 * provider call is cached per server instance for a few minutes so a burst of page loads
 * does not hammer the provider's API.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../lib/persistence/server/auth";
import { PersistenceError } from "../../../lib/persistence/server/errors";
import { logger } from "../../../lib/observability/logger";
import { loadIceServers, type IceServersResult } from "../../../lib/webrtc/iceServers";

export const dynamic = "force-dynamic";

const SERVER_CACHE_MS = 5 * 60_000;
let cached: { at: number; value: IceServersResult } | null = null;

export async function GET(request: Request) {
  try {
    await resolveServerActor(request);
  } catch (error) {
    if (error instanceof PersistenceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.toHttpStatus(), headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Unavailable" } }, { status: 500 });
  }

  const now = Date.now();
  if (!cached || now - cached.at > SERVER_CACHE_MS) {
    const value = await loadIceServers(
      {
        CLOUDFLARE_TURN_KEY_ID: process.env.CLOUDFLARE_TURN_KEY_ID,
        CLOUDFLARE_TURN_API_TOKEN: process.env.CLOUDFLARE_TURN_API_TOKEN,
        TURN_URLS: process.env.TURN_URLS,
        TURN_USERNAME: process.env.TURN_USERNAME,
        TURN_CREDENTIAL: process.env.TURN_CREDENTIAL,
      },
      undefined,
      (event, fields) => logger.warn(event, fields)
    );
    // Do not pin a degraded (STUN-only) answer when a relay is configured: retry soon.
    const configured = Boolean(
      (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) || process.env.TURN_URLS
    );
    cached = value.source === "stun-only" && configured ? null : { at: now, value };
    return respond(value);
  }
  return respond(cached.value);
}

function respond(value: IceServersResult) {
  return NextResponse.json(
    { iceServers: value.iceServers, ttlSeconds: value.ttlSeconds, relay: value.source !== "stun-only" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
