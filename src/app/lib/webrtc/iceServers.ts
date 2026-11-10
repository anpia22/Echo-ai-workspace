/**
 * P1.1 — ICE server (STUN + TURN) configuration for WebRTC calls. Server side.
 *
 * Without a TURN relay, calls fail for people behind strict firewalls or on mobile networks.
 * Two ways to configure one (environment variables, never in client code):
 *
 *  1. Cloudflare Realtime TURN (short-lived credentials generated per request):
 *       CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN
 *  2. Any provider or your own coturn, with fixed credentials (e.g. Metered, Twilio):
 *       TURN_URLS (comma-separated turn:/turns: urls), TURN_USERNAME, TURN_CREDENTIAL
 *
 * With neither set, the result is public STUN only: exactly how calls worked before.
 * A failure to reach the TURN provider never breaks a call; it degrades to STUN only.
 */

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

export type IceServersResult = {
  iceServers: IceServer[];
  source: "cloudflare" | "static" | "stun-only";
  /** How long the client may keep these before asking again. */
  ttlSeconds: number;
};

export type IceEnv = {
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_API_TOKEN?: string;
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
};

export const PUBLIC_STUN: IceServer = {
  urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
};

/** Credentials are requested valid for a day; clients refresh well before that. */
export const CLOUDFLARE_CREDENTIAL_TTL_S = 24 * 60 * 60;
const CLIENT_REFRESH_S = 60 * 60;
const PROVIDER_TIMEOUT_MS = 4_000;

const ICE_URL = /^(stun|stuns|turn|turns):[^\s,]+$/i;
const RELAY_URL = /^(turn|turns):/i;

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Parses TURN_URLS; drops anything that is not a valid ice url. */
export function parseTurnUrls(value: string | undefined): string[] {
  return clean(value)
    .split(",")
    .map((u) => u.trim())
    .filter((u) => ICE_URL.test(u));
}

/** Keeps only well-formed servers from a provider response; never trusts the shape. */
export function sanitizeIceServers(input: unknown): IceServer[] {
  if (!Array.isArray(input)) return [];
  const out: IceServer[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const urlsIn = Array.isArray(r.urls) ? r.urls : typeof r.urls === "string" ? [r.urls] : [];
    const urls = urlsIn.filter((u): u is string => typeof u === "string" && ICE_URL.test(u));
    if (urls.length === 0) continue;
    const needsAuth = urls.some((u) => RELAY_URL.test(u));
    const username = typeof r.username === "string" ? r.username : undefined;
    const credential = typeof r.credential === "string" ? r.credential : undefined;
    if (needsAuth && (!username || !credential)) continue; // a relay without credentials cannot work
    out.push({ urls, ...(username && credential ? { username, credential } : {}) });
  }
  return out;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export async function loadIceServers(
  env: IceEnv,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  onWarn: (event: string, fields: Record<string, unknown>) => void = () => undefined
): Promise<IceServersResult> {
  const stunOnly: IceServersResult = { iceServers: [PUBLIC_STUN], source: "stun-only", ttlSeconds: CLIENT_REFRESH_S };

  const keyId = clean(env.CLOUDFLARE_TURN_KEY_ID);
  const token = clean(env.CLOUDFLARE_TURN_API_TOKEN);
  if (keyId && token) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const res = await fetchFn(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: CLOUDFLARE_CREDENTIAL_TTL_S }),
          signal: controller.signal,
        }
      );
      if (!res.ok) {
        onWarn("webrtc.turn.provider_error", { provider: "cloudflare", status: res.status });
        return stunOnly;
      }
      const body = (await res.json()) as { iceServers?: unknown };
      const servers = sanitizeIceServers(body?.iceServers);
      if (!servers.some((s) => [s.urls].flat().some((u) => RELAY_URL.test(u)))) {
        onWarn("webrtc.turn.no_relay_in_response", { provider: "cloudflare" });
        return stunOnly;
      }
      return { iceServers: [PUBLIC_STUN, ...servers], source: "cloudflare", ttlSeconds: CLIENT_REFRESH_S };
    } catch (error) {
      onWarn("webrtc.turn.provider_unreachable", {
        provider: "cloudflare",
        reason: (error as { name?: string })?.name ?? "error",
      });
      return stunOnly;
    } finally {
      clearTimeout(timer);
    }
  }

  const urls = parseTurnUrls(env.TURN_URLS);
  const username = clean(env.TURN_USERNAME);
  const credential = clean(env.TURN_CREDENTIAL);
  const relayUrls = urls.filter((u) => RELAY_URL.test(u));
  if (relayUrls.length > 0 && username && credential) {
    return {
      iceServers: [PUBLIC_STUN, { urls: relayUrls, username, credential }],
      source: "static",
      ttlSeconds: CLIENT_REFRESH_S,
    };
  }

  return stunOnly;
}
