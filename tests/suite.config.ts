/**
 * Which legacy `scratch/test_*` scripts run in `npm test`, and which are excluded (and why).
 *
 * This is an explicit list on purpose. A glob would silently pick up any new script, including
 * one that writes to the live database or spends AI credits. `legacy-scripts.test.ts` fails if a
 * `scratch/test_*` file is in neither list, so every new script needs a conscious decision.
 *
 * Every script in RUN must be self-contained: no network, no real secrets, no running server,
 * no browser. They run as child processes with real keys stripped from the environment.
 */

export const RUN: string[] = [
  "test_group_nodes.ts",
  "test_p0_1_auth_actor.ts",
  "test_p0_1_invites.ts",
  "test_p0_1_list_workspaces.ts",
  "test_p0_1_profile_name.ts",
  "test_p0_1_read_only.ts",
  "test_p0_1_realtime_wiring.ts",
  "test_p0_1_security_model.mjs",
  "test_p0_2_rate_limit.ts",
  "test_p0_3_observability.ts",
  "test_p1_1_turn.ts",
  "test_p1_2_canvas_rebase.ts",
  "test_p1_4_ai_resilience.ts",
  "test_p1_4_retry_ui.ts",
  "test_p1_6_admin.ts",
  "test_p1_share_links.ts",
  "test_phase10_regression.mjs",
  "test_phase11_2_viewport.mjs",
  "test_phase11_3_follow_protocol.mjs",
  "test_phase11_4_leader_viewport_broadcast.mjs",
  "test_phase11_5_follower_viewport_sync.mjs",
  "test_phase11_6_follow_ui.mjs",
  "test_phase11_7_follow_indicators.mjs",
  "test_phase11_8_interruption_rules.mjs",
  "test_phase11_9_reconnect_isolation.mjs",
  "test_phase11_r1_full_regression.mjs",
  "test_phase12_1_architecture.ts",
  "test_phase12_5_device_fallback.mjs",
  "test_phase12_6_1_conversation_contracts.ts",
  "test_phase12_6_2_stt_contracts.ts",
  "test_phase12_6_3_meeting_analysis.ts",
  "test_phase12_6_4_insight_action_bridge.ts",
  "test_phase13_1_contracts.ts",
  "test_phase13_2_database.mjs",
  "test_phase13_3_repository.ts",
  "test_phase13_4_workspace_hydration.ts",
  "test_phase13_5_unit.ts",
  "test_phase13_6_unit.ts",
  "test_phase13_7_unit.ts",
  "test_phase13_8_unit.ts",
  "test_phase13_9_unit.ts",
  "test_phase14_2_bridge.ts",
  "test_phase14_3_context_engine.ts",
  "test_phase14_4_intent.ts",
  "test_phase14_5_prompt_budget.ts",
  "test_phase14_6_e2e.ts",
  "test_phase15_1_layout.ts",
  "test_phase15_2_ux.ts",
  "test_phase16_reliability.ts",
  "test_phase17_demo.ts",
  "test_rapid_switch_regression.ts",
];

const LIVE_DB = "Writes to / reads from the live Supabase project; run manually against a safe project.";
const BROWSER =
  "Drives real browsers against a running dev server and live services; run manually (automated browser flows are the Playwright follow-up under P0.4).";

export const EXCLUDED: Record<string, string> = {
  "test_live_db_verification.ts": LIVE_DB,
  "test_phase13_5_live_db.ts": LIVE_DB,
  "test_phase13_6_live_db.ts": LIVE_DB,
  "test_phase13_7_live_db.ts": LIVE_DB,
  "test_phase13_8_live_db.ts": LIVE_DB,
  "test_phase13_9_live_db.ts": LIVE_DB,
  "test94.mjs": "Reads the real NVIDIA key from .env.local and calls the live NVIDIA API (costs credits).",
  "test_phase12_2_two_browser_webrtc.mjs": BROWSER,
  "test_phase12_3_meeting_ui.mjs": BROWSER,
  "test_phase12_4_screen_sharing.mjs": BROWSER,
  "test_phase12_5_genuine_transport_attempt.mjs": BROWSER,
  "test_phase12_5_resilience.mjs": BROWSER,
  "test_phase12_5_resilience_gaps.mjs": BROWSER,
};
