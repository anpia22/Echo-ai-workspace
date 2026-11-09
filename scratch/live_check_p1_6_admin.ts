/** Read-only: runs the admin loader against the live project and prints counts only. */
import { getServerSupabaseClient } from "../src/app/lib/persistence/server/db";
import { loadAdminStats } from "../src/app/lib/admin/adminStats";

loadAdminStats(getServerSupabaseClient()).then(
  (s) => {
    console.log(JSON.stringify({ users: { total: s.users.total, active7d: s.users.active7d }, workspaces: { total: s.workspaces.total, members: s.workspaces.members, conversations: s.workspaces.conversations, meetings: s.workspaces.meetings, rooms: s.workspaces.rooms }, ai: { last24h: s.ai.last24h.total, avgLatencyMs: s.ai.avgLatencyMs, topActors: s.ai.topActors.length }, health: s.health }, null, 1));
  },
  (e) => { console.error("FAILED:", e.message); process.exit(1); }
);
