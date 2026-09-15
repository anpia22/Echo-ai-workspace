/**
 * Phase 12.6.3 - Meeting Analysis Utilities & Deterministic Identification
 *
 * Implements deterministic insight ID generation, provenance helpers,
 * and pure data transformers.
 *
 * STRICT INVARIANTS:
 * - Deterministic IDs: NO crypto.randomUUID(), NO Date.now(), NO Math.random().
 * - Browser-safe & SSR-safe: Pure TypeScript hashing with zero external dependencies.
 * - Pure data: NO CanvasState or ReactFlow integration.
 */

import type { InsightType, MeetingInsight } from "./meetingAnalysisTypes";

/**
 * Deterministic numeric hash (53-bit safe integer range, Murmur/FNV variant).
 * Works identically in Node.js and modern browser runtimes without polyfills.
 */
function deterministicHash(str: string): string {
  let h1 = 0xdeadbeef ^ 0x12345678;
  let h2 = 0x41c6ce57 ^ 0x87654321;

  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return combined.toString(36);
}

/**
 * Generates a deterministic, reproducible ID for a meeting insight.
 *
 * Guaranteed properties:
 * 1. Output is strictly identical given the same meetingId, type, title, and sourceSegmentIds.
 * 2. NO Math.random(), NO Date.now(), NO crypto.randomUUID().
 * 3. Human-readable prefix and semantic slug for clean debugging.
 */
export function generateDeterministicInsightId(
  meetingId: string,
  type: InsightType,
  title: string,
  sourceSegmentIds: string[]
): string {
  const normalizedMeeting = meetingId.trim().toLowerCase();
  const normalizedType = type.trim().toLowerCase();
  const normalizedTitle = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const sortedSegments = [...sourceSegmentIds].sort().join(",");

  const compositeKey = `${normalizedMeeting}::${normalizedType}::${normalizedTitle}::${sortedSegments}`;
  const hash = deterministicHash(compositeKey);

  const slug = normalizedTitle.slice(0, 24) || "insight";
  return `ins-${normalizedType}-${slug}-${hash}`;
}

/**
 * Filters a collection of insights by semantic category.
 */
export function filterInsightsByType(
  insights: MeetingInsight[],
  type: InsightType
): MeetingInsight[] {
  if (!Array.isArray(insights)) return [];
  return insights.filter((insight) => insight.type === type);
}
