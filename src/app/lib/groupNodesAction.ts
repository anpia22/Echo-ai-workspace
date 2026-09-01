export type ValidGroupNodes = {
  type: "GROUP_NODES";
  nodeTitles: string[];
  groupTitle: string;
};

export type GroupMemberNode = {
  id: string;
  title: string;
};

function uniqueTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const title of titles) {
    if (seen.has(title)) {
      continue;
    }

    seen.add(title);
    unique.push(title);
  }

  return unique;
}

export function parseGroupNodesAction(
  action: unknown
): ValidGroupNodes | null {
  if (!action || typeof action !== "object") {
    return null;
  }

  const candidate = action as {
    type?: unknown;
    nodeTitles?: unknown;
    groupTitle?: unknown;
  };

  if (candidate.type !== "GROUP_NODES") {
    return null;
  }

  if (typeof candidate.groupTitle !== "string") {
    return null;
  }

  const groupTitle = candidate.groupTitle.trim();

  if (groupTitle.length === 0) {
    return null;
  }

  if (!Array.isArray(candidate.nodeTitles) || candidate.nodeTitles.length === 0) {
    return null;
  }

  const nodeTitles: string[] = [];

  for (const title of candidate.nodeTitles) {
    if (typeof title !== "string") {
      return null;
    }

    const trimmed = title.trim();

    if (trimmed.length === 0) {
      return null;
    }

    nodeTitles.push(trimmed);
  }

  const unique = uniqueTitles(nodeTitles);

  if (unique.length === 0) {
    return null;
  }

  return {
    type: "GROUP_NODES",
    nodeTitles: unique,
    groupTitle,
  };
}

export function resolveGroupMemberIds(
  nodes: ReadonlyArray<GroupMemberNode>,
  nodeTitles: readonly string[]
): string[] | null {
  const memberIds: string[] = [];

  for (const title of nodeTitles) {
    const matches = nodes.filter((node) => node.title === title);

    if (matches.length !== 1) {
      return null;
    }

    memberIds.push(matches[0].id);
  }

  return uniqueTitles(memberIds);
}

export function sameMemberSet(
  left: readonly string[],
  right: readonly string[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);

  return left.every((id) => rightSet.has(id));
}
