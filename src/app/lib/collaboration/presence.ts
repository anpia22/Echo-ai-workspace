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

export type FollowStateItem = {
  userId: string;
  displayName: string;
  color: string;
  isYou: boolean;
  isFollowing: boolean;
  isFollower: boolean;
  canFollow: boolean;
};

export function resolveParticipantDisplayName(
  userId: string,
  participants: Participant[],
  currentParticipant?: Participant | null
): string {
  if (currentParticipant) {
    const currentId =
      currentParticipant.userId ??
      (currentParticipant as unknown as { id?: string })?.id;
    if (currentId === userId) {
      return `${currentParticipant.displayName} (You)`;
    }
  }

  const found = participants.find(
    (p) => (p.userId ?? (p as unknown as { id?: string })?.id) === userId
  );

  if (found && found.displayName) {
    return found.displayName;
  }

  // Fallback to concise user identifier
  return userId.length > 8 ? `User ${userId.slice(0, 4)}` : userId;
}

export function formatFollowerCountLabel(count: number): string {
  if (count <= 0) {
    return "";
  }
  return count === 1 ? "1 following you" : `${count} following you`;
}

export function formatFollowingLabel(leaderName: string): string {
  return `Following ${leaderName}`;
}

export function computeFollowStateList(
  participants: Participant[],
  currentParticipant: Participant | null,
  followingUserId?: string | null,
  followerUserIds?: Set<string> | null
): FollowStateItem[] {
  const displayParticipants: Participant[] = [...participants];
  const currentUserId =
    currentParticipant?.userId ??
    (currentParticipant as unknown as { id?: string })?.id;

  if (
    currentParticipant &&
    !displayParticipants.some(
      (p) =>
        (p.userId ?? (p as unknown as { id?: string })?.id) === currentUserId
    )
  ) {
    displayParticipants.unshift(currentParticipant);
  }

  // Sort so current user is first, followed by others alphabetically
  displayParticipants.sort((a, b) => {
    const aId = a.userId ?? (a as unknown as { id?: string })?.id;
    const bId = b.userId ?? (b as unknown as { id?: string })?.id;
    if (aId === currentUserId) return -1;
    if (bId === currentUserId) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return displayParticipants.map((p) => {
    const pId = p.userId ?? (p as unknown as { id?: string })?.id ?? "";
    const isYou = Boolean(currentUserId && pId === currentUserId);
    const isFollowing = Boolean(!isYou && followingUserId && followingUserId === pId);
    const isFollower = Boolean(!isYou && followerUserIds && followerUserIds.has(pId));
    const canFollow = !isYou;

    return {
      userId: pId,
      displayName: p.displayName,
      color: p.color,
      isYou,
      isFollowing,
      isFollower,
      canFollow,
    };
  });
}
