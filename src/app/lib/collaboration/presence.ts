import {
  getParticipantColor,
  type Participant,
} from "./participant";

export type ParticipantPresenceMeta = {
  userId: string;
  displayName: string;
  color: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function parsePresenceState(
  state: Record<string, unknown>
): Participant[] {
  if (!isRecord(state)) {
    return [];
  }

  const participantsMap = new Map<string, Participant>();

  for (const [key, metas] of Object.entries(state)) {
    if (!Array.isArray(metas)) {
      continue;
    }

    for (const meta of metas) {
      if (!isRecord(meta)) {
        continue;
      }

      const userId = isNonEmptyString(meta.userId)
        ? meta.userId
        : isNonEmptyString(key)
        ? key
        : null;

      if (!userId) {
        continue;
      }

      const displayName = isNonEmptyString(meta.displayName)
        ? meta.displayName
        : `User ${userId.slice(0, 4)}`;

      const color = isNonEmptyString(meta.color)
        ? meta.color
        : getParticipantColor(userId);

      // Deduplicate by userId
      if (!participantsMap.has(userId)) {
        participantsMap.set(userId, {
          userId,
          displayName,
          color,
        });
      }
    }
  }

  return Array.from(participantsMap.values());
}
