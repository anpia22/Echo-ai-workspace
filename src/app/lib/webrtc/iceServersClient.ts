/**
 * P1.1 — Browser side: load STUN/TURN servers once and keep them fresh.
 *
 * Failure is silent by design: calls then use public STUN only, exactly as before.
 */

import { setRuntimeIceServers } from "../collaboration/meeting/mediaLifecycle";

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export type IceFetchResult = { iceServers: RTCIceServer[]; ttlSeconds: number; relay: boolean };

async function load(): Promise<IceFetchResult | null | "denied"> {
  try {
    const res = await fetch("/api/webrtc/ice", { cache: "no-store" });
    // Signed out: nothing to retry until the page reloads after sign-in.
    if (res.status === 401 || res.status === 403) return "denied";
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<IceFetchResult>;
    if (!Array.isArray(body.iceServers) || body.iceServers.length === 0) return null;
    return { iceServers: body.iceServers, ttlSeconds: Number(body.ttlSeconds) || 3600, relay: Boolean(body.relay) };
  } catch {
    return null;
  }
}

async function cycle(): Promise<void> {
  const result = await load();
  if (result === "denied") return;
  if (result) setRuntimeIceServers(result.iceServers);
  // Refresh at 80% of the lifetime; retry in a minute after a failure.
  const nextMs = result ? Math.max(60, result.ttlSeconds * 0.8) * 1000 : 60_000;
  timer = setTimeout(() => void cycle(), nextMs);
}

/** Idempotent: call from any component that may start a call. */
export function startIceServerRefresh(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  void cycle();
}

export function stopIceServerRefresh(): void {
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
