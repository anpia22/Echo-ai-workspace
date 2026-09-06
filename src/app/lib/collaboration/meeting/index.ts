/**
 * Phase 12.1 - Audio/Video Meeting Architecture & Foundation
 *
 * Public Entry Point for Meeting Foundation Modules:
 * - Domain & State Types (Strictly separated from CanvasState)
 * - Signaling Contracts & Parsers (over Supabase Realtime channel)
 * - Hardware Media Lifecycle & Cleanup (getUserMedia, getDisplayMedia, track teardown)
 */

export * from "./meetingTypes";
export * from "./meetingSignals";
export * from "./mediaLifecycle";
export * from "./meetingRuntime";
export * from "./useMeeting";
