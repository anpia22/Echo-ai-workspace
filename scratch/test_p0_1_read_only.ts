/**
 * P0.1 — Viewer (read-only) mode on the client.
 *
 * A viewer must not even attempt writes (the server refuses them): every write API call is
 * stopped before any network request, reads still work, and the flag is wired to the role the
 * server returns.
 *
 * Run: npx tsx scratch/test_p0_1_read_only.ts
 */

import { readFileSync } from "node:fs";
import {
  ReadOnlyWorkspaceError,
  assertWritable,
  isReadOnlyError,
  isWorkspaceReadOnly,
  setWorkspaceReadOnly,
  subscribeReadOnly,
} from "../src/app/lib/persistence/client/readOnly";
import { persistCanvasMutation } from "../src/app/lib/persistence/client/canvasApi";
import {
  appendMessageApi,
  createConversationApi,
  loadConversationApi,
  updateConversationApi,
  updateConversationTitleApi,
} from "../src/app/lib/persistence/client/conversationApi";
import { createMeetingApi, endMeetingApi, getMeetingHistoryApi } from "../src/app/lib/persistence/client/meetingApi";
import { migrateWorkspaceApi } from "../src/app/lib/persistence/client/migrationApi";
import { closeRoomApi, createRoomApi, listRoomsApi } from "../src/app/lib/persistence/client/roomApi";

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

async function main() {
  let fetchCalls = 0;
  (globalThis as unknown as { fetch: unknown }).fetch = async () => {
    fetchCalls++;
    return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  console.log("flag");
  check("starts writable", !isWorkspaceReadOnly());
  check("assertWritable passes when writable", (() => { try { assertWritable(); return true; } catch { return false; } })());

  let notified = 0;
  const unsubscribe = subscribeReadOnly(() => notified++);
  setWorkspaceReadOnly(true);
  check("setting the flag notifies subscribers once", isWorkspaceReadOnly() && notified === 1);
  setWorkspaceReadOnly(true);
  check("setting the same value does not notify again", notified === 1);

  console.log("writes are blocked before any request");
  const W = "11111111-1111-4111-8111-111111111111";
  const writes: Array<[string, () => Promise<unknown>]> = [
    ["persistCanvasMutation", () => persistCanvasMutation(W, {} as never)],
    ["createConversationApi", () => createConversationApi(W, {} as never)],
    ["appendMessageApi", () => appendMessageApi(W, "c", {} as never)],
    ["updateConversationApi", () => updateConversationApi(W, "c", {} as never)],
    ["updateConversationTitleApi", () => updateConversationTitleApi(W, "c", "t")],
    ["createMeetingApi", () => createMeetingApi(W, {} as never)],
    ["endMeetingApi", () => endMeetingApi(W, "m")],
    ["createRoomApi", () => createRoomApi(W, {} as never)],
    ["closeRoomApi", () => closeRoomApi(W, "r")],
    ["migrateWorkspaceApi", () => migrateWorkspaceApi(W, {} as never)],
  ];
  for (const [name, call] of writes) {
    let err: unknown = null;
    try {
      await call();
    } catch (e) {
      err = e;
    }
    check(`${name} throws ReadOnlyWorkspaceError`, err instanceof ReadOnlyWorkspaceError && isReadOnlyError(err));
  }
  check("no network request was made by any blocked write", fetchCalls === 0, `calls=${fetchCalls}`);

  console.log("reads still work");
  await loadConversationApi(W, "c").catch(() => undefined);
  await getMeetingHistoryApi(W).catch(() => undefined);
  await listRoomsApi(W).catch(() => undefined);
  check("read calls reach the network", fetchCalls === 3, `calls=${fetchCalls}`);

  console.log("back to writable");
  setWorkspaceReadOnly(false);
  fetchCalls = 0;
  await createMeetingApi(W, {} as never).catch(() => undefined);
  check("writes go through again for editors", fetchCalls === 1 && !isWorkspaceReadOnly());
  unsubscribe();
  setWorkspaceReadOnly(true);
  check("unsubscribed listeners are not called", notified === 2);
  setWorkspaceReadOnly(false);

  console.log("wiring");
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const repo = read("src/app/lib/persistence/repositories/workspaceRepository.ts");
  check("server returns the caller's role on load", /role: auth\.role/.test(repo));
  const hydration = read("src/app/lib/persistence/client/useWorkspaceHydration.ts");
  check("hydration sets read-only from role === viewer on both load paths", (hydration.match(/setWorkspaceReadOnly\(hydrationData\.role === "viewer"\)/g) ?? []).length === 2);
  check("a brand-new workspace is never read-only", /setWorkspaceReadOnly\(false\)/.test(hydration));
  const page = read("src/app/app/page.tsx");
  check("page shows a View only badge", /View only/.test(page) && /useWorkspaceReadOnly\(\)/.test(page));
  check("viewers cannot trigger AI analysis", /if \(isWorkspaceReadOnly\(\)\) return;/.test(page));
  check("conversation-canvas saves go through the outbox, which drops read-only saves silently", /enqueueConversationCanvasSave\(/.test(page) && !/Failed to persist conversation canvas/.test(page));
  const canvasHook = read("src/app/lib/persistence/client/useCanvasPersistence.ts");
  check("canvas hook ignores read-only failures", /isReadOnlyError\(err\)\) return/.test(canvasHook));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
