/**
 * P0.1 — "My workspaces" lookup: data follows the account, not the browser.
 *
 * Covers WorkspaceRepository.listWorkspaces (with a fake Supabase client) and
 * pickWorkspaceToOpen (which workspace to open when the URL names none).
 *
 * Run: npx tsx scratch/test_p0_1_list_workspaces.ts
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dummy-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-key";

import { WorkspaceRepository } from "../src/app/lib/persistence/repositories/workspaceRepository";
import { pickWorkspaceToOpen } from "../src/app/lib/persistence/client/workspaceHydration";
import type { SupabaseClient } from "@supabase/supabase-js";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

type Row = Record<string, unknown>;

/** Minimal in-memory stand-in for the query-builder calls the repository makes. */
function fakeClient(tables: Record<string, Row[]>, failTable?: string): SupabaseClient {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return builder;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        const dir = opts?.ascending === false ? -1 : 1;
        rows.sort((a, b) => (String(a[col]) < String(b[col]) ? -dir : String(a[col]) > String(b[col]) ? dir : 0));
        return builder;
      },
      then: (resolve: (v: unknown) => unknown) =>
        resolve(
          failTable === table
            ? { data: null, error: { message: "boom" } }
            : { data: rows, error: null }
        ),
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

const ws = (id: string, title: string, updated: string): Row => ({
  id,
  title,
  revision: "1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: updated,
});

const ME = { userId: "user-me" };
const OTHER = { userId: "user-other" };

const tables = {
  workspaces: [
    ws("w-old", "Old project", "2026-02-01T00:00:00Z"),
    ws("w-new", "New project", "2026-03-01T00:00:00Z"),
    ws("w-shared", "Shared with me", "2026-02-15T00:00:00Z"),
    ws("w-secret", "Someone else's", "2026-04-01T00:00:00Z"),
  ],
  workspace_members: [
    { workspace_id: "w-old", user_id: "user-me", role: "owner" },
    { workspace_id: "w-new", user_id: "user-me", role: "owner" },
    { workspace_id: "w-shared", user_id: "user-me", role: "editor" },
    { workspace_id: "w-secret", user_id: "user-other", role: "owner" },
  ],
};

async function main() {
  console.log("listWorkspaces");
  const repo = new WorkspaceRepository(fakeClient(tables));
  const mine = await repo.listWorkspaces(ME);
  check("returns only workspaces the user belongs to", mine.length === 3 && !mine.some((w) => w.id === "w-secret"), JSON.stringify(mine.map((w) => w.id)));
  check("newest first", mine.map((w) => w.id).join() === "w-new,w-shared,w-old", mine.map((w) => w.id).join());
  check("includes the caller's role", mine.find((w) => w.id === "w-shared")?.role === "editor" && mine.find((w) => w.id === "w-new")?.role === "owner");
  check("includes mapped fields", mine[0].title === "New project" && typeof mine[0].updatedAt === "string");

  const theirs = await repo.listWorkspaces(OTHER);
  check("another user sees only their own", theirs.length === 1 && theirs[0].id === "w-secret");

  const nobody = await repo.listWorkspaces({ userId: "user-new" });
  check("a brand-new user gets an empty list", nobody.length === 0);

  let err = "";
  try {
    await new WorkspaceRepository(fakeClient(tables, "workspace_members")).listWorkspaces(ME);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  check("membership query failure surfaces as an error", err.includes("Failed to list memberships"), err);

  err = "";
  try {
    await new WorkspaceRepository(fakeClient(tables, "workspaces")).listWorkspaces(ME);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  check("workspace query failure surfaces as an error", err.includes("Failed to list workspaces"), err);

  console.log("pickWorkspaceToOpen");
  check("no workspaces -> null (create one)", pickWorkspaceToOpen([], null) === null && pickWorkspaceToOpen([], "w-x") === null);
  check("no pointer -> most recent", pickWorkspaceToOpen(mine, null) === "w-new");
  check("pointer to a workspace the user has -> that one", pickWorkspaceToOpen(mine, "w-old") === "w-old");
  check("pointer to someone else's / stale -> most recent, not the pointer", pickWorkspaceToOpen(mine, "w-secret") === "w-new");

  console.log("sign-out / sign-in scenario");
  // Same user, new device (no pointer): their project is found.
  const found = pickWorkspaceToOpen(await repo.listWorkspaces(ME), null);
  check("signing in on a new device opens the existing project", found === "w-new");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
