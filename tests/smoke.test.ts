/**
 * HTTP smoke tests against a running production build.
 *
 * Skipped unless SMOKE_BASE_URL is set. CI builds the app, starts it with
 * ECHO_DEMO_MODE=false and placeholder Supabase settings, then runs:
 *
 *   SMOKE_BASE_URL=http://localhost:3100 npx vitest run tests/smoke.test.ts
 *
 * Every case here is answered without touching a real database or AI provider, so the run
 * needs no secrets. It checks the wiring that must not regress: public pages render, the app
 * is gated behind sign-in, protected APIs reject anonymous callers, and the health endpoints
 * expose only what they should.
 */

import { describe, expect, it } from "vitest";

const BASE = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");

async function get(pathname: string, init: RequestInit = {}) {
  return fetch(`${BASE}${pathname}`, { redirect: "manual", ...init });
}

describe.skipIf(!BASE)("smoke: production build", () => {
  describe("public pages", () => {
    it.each(["/", "/login", "/pricing", "/how-it-works", "/privacy", "/terms"])("%s renders (200 HTML)", async (route) => {
      const res = await get(route);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
    });
  });

  describe("app gating (demo mode off)", () => {
    it("redirects a signed-out visitor from /app to /login and keeps the destination", async () => {
      const res = await get("/app?workspace=abc");
      expect(res.status).toBe(307);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/login");
      expect(decodeURIComponent(location)).toContain("next=/app?workspace=abc");
    });

    it("does not gate /apple-icon.png or public pages", async () => {
      expect((await get("/apple-icon.png")).status).toBe(200);
    });
  });

  describe("protected APIs reject anonymous callers", () => {
    it("POST /api/analyze -> 401", async () => {
      const res = await get("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript: "hello" }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("GET /api/workspace -> 401", async () => {
      expect((await get("/api/workspace")).status).toBe(401);
    });

    it("POST /api/workspace -> 401", async () => {
      const res = await get("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(401);
    });

    const WS = "11111111-1111-4111-8111-111111111111";
    it.each([
      ["GET", `/api/workspace/${WS}/members`],
      ["GET", `/api/workspace/${WS}/invites`],
      ["POST", `/api/workspace/${WS}/invites`],
      ["DELETE", `/api/workspace/${WS}/invites/${WS}`],
      ["PATCH", `/api/workspace/${WS}/members/some-user`],
      ["DELETE", `/api/workspace/${WS}/members/some-user`],
      ["POST", "/api/invites/accept"],
    ])("%s %s -> 401", async (method, route) => {
      const res = await get(route, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : "{}" });
      expect(res.status).toBe(401);
    });

    it("the invite landing page renders", async () => {
      const res = await get("/invite/abcdefghijklmnopqrstuvwxyz012345");
      expect(res.status).toBe(200);
    });

    it("POST /api/profile/sync -> 401", async () => {
      expect((await get("/api/profile/sync", { method: "POST" })).status).toBe(401);
    });
  });

  describe("health endpoints", () => {
    it("GET /api/health returns only status, checks and time", async () => {
      const res = await get("/api/health");
      // 200 when the database answers, 503 when it does not (CI uses a placeholder database).
      expect([200, 503]).toContain(res.status);
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(["checks", "status", "time"]);
      expect(["ok", "degraded", "down"]).toContain(body.status);
      expect(Object.keys(body.checks).sort()).toEqual(["ai", "database"]);
      expect(res.headers.get("cache-control")).toContain("no-store");
    });

    it("GET /api/health/ai is invisible without a valid token (404)", async () => {
      expect((await get("/api/health/ai")).status).toBe(404);
      expect((await get("/api/health/ai", { headers: { authorization: "Bearer not-the-token-not-the-token" } })).status).toBe(404);
    });
  });
});
