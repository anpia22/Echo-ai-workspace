"use client";

export type Participant = {
  userId: string;
  displayName: string;
  color: string;
};

const PARTICIPANT_STORAGE_KEY = "echo.collaboration.participant";

export const PARTICIPANT_PALETTE = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#14b8a6", // Teal
  "#6366f1", // Indigo
  "#84cc16", // Lime
];

export function getParticipantColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PARTICIPANT_PALETTE.length;
  return PARTICIPANT_PALETTE[index];
}

export function generateDisplayName(userId: string): string {
  const digits = userId.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `User ${digits.slice(-4)}`;
  }
  const hex = userId.replace(/[^0-9a-fA-F]/g, "").slice(0, 4);
  const num = (parseInt(hex, 16) || 1234) % 9000 + 1000;
  return `User ${num}`;
}

function isParticipant(value: unknown): value is Participant {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.userId === "string" &&
    record.userId.length > 0 &&
    typeof record.displayName === "string" &&
    record.displayName.length > 0 &&
    typeof record.color === "string" &&
    record.color.length > 0
  );
}

function createParticipant(): Participant {
  const userId = crypto.randomUUID();
  return {
    userId,
    displayName: generateDisplayName(userId),
    color: getParticipantColor(userId),
  };
}

export function getOrCreateParticipant(): Participant {
  if (typeof window === "undefined") {
    return {
      userId: "server-user",
      displayName: "User 1000",
      color: PARTICIPANT_PALETTE[0],
    };
  }

  const stored = sessionStorage.getItem(PARTICIPANT_STORAGE_KEY);

  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);

      if (isParticipant(parsed)) {
        return parsed;
      }

      // Upgrade legacy participant entry (missing color or placeholder "You")
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof (parsed as { userId?: unknown }).userId === "string"
      ) {
        const userId = (parsed as { userId: string }).userId;
        const legacyName = (parsed as { displayName?: unknown }).displayName;
        const displayName =
          typeof legacyName === "string" &&
          legacyName.length > 0 &&
          legacyName !== "You"
            ? legacyName
            : generateDisplayName(userId);
        const color =
          typeof (parsed as { color?: unknown }).color === "string" &&
          (parsed as { color: string }).color.length > 0
            ? (parsed as { color: string }).color
            : getParticipantColor(userId);

        const upgraded: Participant = { userId, displayName, color };
        sessionStorage.setItem(
          PARTICIPANT_STORAGE_KEY,
          JSON.stringify(upgraded)
        );
        return upgraded;
      }
    } catch {
      sessionStorage.removeItem(PARTICIPANT_STORAGE_KEY);
    }
  }

  const participant = createParticipant();
  sessionStorage.setItem(
    PARTICIPANT_STORAGE_KEY,
    JSON.stringify(participant)
  );
  return participant;
}
