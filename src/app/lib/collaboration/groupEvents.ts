import type { CanvasGroup, CanvasState } from "../applyCanvasActions";
import { sameMemberSet } from "../groupNodesAction";

export const GROUP_UPSERT_EVENT = "GROUP_UPSERT";
export const GROUP_DELETED_EVENT = "GROUP_DELETED";

export type GroupUpsertEvent = {
  type: typeof GROUP_UPSERT_EVENT;
  roomId: string;
  senderId: string;
  group: CanvasGroup;
};

export type GroupDeletedEvent = {
  type: typeof GROUP_DELETED_EVENT;
  roomId: string;
  senderId: string;
  groupId: string;
};

export type GroupCollaborationEvent = GroupUpsertEvent | GroupDeletedEvent;

export type LocalGroupMutation =
  | { type: typeof GROUP_UPSERT_EVENT; group: CanvasGroup }
  | { type: typeof GROUP_DELETED_EVENT; groupId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function cloneCanvasGroup(group: CanvasGroup): CanvasGroup {
  return {
    id: group.id,
    title: group.title,
    memberIds: [...group.memberIds],
  };
}

export function parseCanvasGroup(value: unknown): CanvasGroup | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!isNonEmptyString(value.id) || typeof value.title !== "string") {
    return null;
  }

  if (!Array.isArray(value.memberIds)) {
    return null;
  }

  const memberIds: string[] = [];

  for (const memberId of value.memberIds) {
    if (!isNonEmptyString(memberId)) {
      return null;
    }

    memberIds.push(memberId);
  }

  return cloneCanvasGroup({
    id: value.id,
    title: value.title,
    memberIds,
  });
}

export function parseGroupCollaborationEvent(
  payload: unknown
): GroupCollaborationEvent | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (
    !isNonEmptyString(payload.roomId) ||
    !isNonEmptyString(payload.senderId)
  ) {
    return null;
  }

  if (payload.type === GROUP_UPSERT_EVENT) {
    const group = parseCanvasGroup(payload.group);

    if (!group) {
      return null;
    }

    return {
      type: GROUP_UPSERT_EVENT,
      roomId: payload.roomId,
      senderId: payload.senderId,
      group,
    };
  }

  if (payload.type === GROUP_DELETED_EVENT) {
    if (!isNonEmptyString(payload.groupId)) {
      return null;
    }

    return {
      type: GROUP_DELETED_EVENT,
      roomId: payload.roomId,
      senderId: payload.senderId,
      groupId: payload.groupId,
    };
  }

  return null;
}

export function upsertSemanticGroup(
  canvas: CanvasState,
  group: CanvasGroup
): CanvasState {
  if (!Array.isArray(group.memberIds) || group.memberIds.length === 0) {
    return canvas;
  }

  const nodeIds = new Set(canvas.nodes.map((node) => node.id));
  const allMembersExist = group.memberIds.every((memberId) =>
    nodeIds.has(memberId)
  );

  // Missing node dependency rule: ignore group if any referenced member does not exist.
  // Never create phantom nodes.
  if (!allMembersExist) {
    return canvas;
  }

  const nextGroup = cloneCanvasGroup(group);
  const groups = canvas.groups ?? [];
  const index = groups.findIndex((existing) => existing.id === nextGroup.id);

  if (index === -1) {
    return {
      ...canvas,
      groups: [...groups, nextGroup],
    };
  }

  const existing = groups[index];

  if (
    existing.title === nextGroup.title &&
    sameMemberSet(existing.memberIds, nextGroup.memberIds)
  ) {
    return canvas;
  }

  const nextGroups = groups.slice();
  nextGroups[index] = nextGroup;

  return {
    ...canvas,
    groups: nextGroups,
  };
}

export function deleteSemanticGroup(
  canvas: CanvasState,
  groupId: string
): CanvasState {
  const groups = canvas.groups ?? [];

  if (!groups.some((group) => group.id === groupId)) {
    return canvas;
  }

  return {
    ...canvas,
    groups: groups.filter((group) => group.id !== groupId),
  };
}

export function applyRemoteGroupEvent(
  canvas: CanvasState,
  event: GroupCollaborationEvent
): CanvasState {
  if (event.type === GROUP_UPSERT_EVENT) {
    return upsertSemanticGroup(canvas, event.group);
  }

  return deleteSemanticGroup(canvas, event.groupId);
}

export function diffLocalGroupMutations(
  previous: CanvasState,
  next: CanvasState
): LocalGroupMutation[] {
  const mutations: LocalGroupMutation[] = [];
  const previousGroups = previous.groups ?? [];
  const nextGroups = next.groups ?? [];

  const previousById = new Map(
    previousGroups.map((group) => [group.id, group])
  );
  const nextIds = new Set(nextGroups.map((group) => group.id));

  for (const group of nextGroups) {
    const existing = previousById.get(group.id);

    if (!existing) {
      mutations.push({
        type: GROUP_UPSERT_EVENT,
        group: cloneCanvasGroup(group),
      });
      continue;
    }

    if (
      existing.title !== group.title ||
      !sameMemberSet(existing.memberIds, group.memberIds)
    ) {
      mutations.push({
        type: GROUP_UPSERT_EVENT,
        group: cloneCanvasGroup(group),
      });
    }
  }

  for (const group of previousGroups) {
    if (!nextIds.has(group.id)) {
      mutations.push({
        type: GROUP_DELETED_EVENT,
        groupId: group.id,
      });
    }
  }

  return mutations;
}

export function publishLocalGroupMutations(
  mutations: LocalGroupMutation[],
  publish: {
    broadcastGroupUpsert: (group: CanvasGroup) => void;
    broadcastGroupDeleted: (groupId: string) => void;
  }
): void {
  for (const mutation of mutations) {
    if (mutation.type === GROUP_UPSERT_EVENT) {
      publish.broadcastGroupUpsert(mutation.group);
      continue;
    }

    publish.broadcastGroupDeleted(mutation.groupId);
  }
}
