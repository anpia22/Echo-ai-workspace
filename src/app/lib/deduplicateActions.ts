function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function logicalActionKey(action: unknown): string | null {
  if (!action || typeof action !== "object") {
    return null;
  }

  const candidate = action as {
    type?: unknown;
    title?: unknown;
    sourceTitle?: unknown;
    targetTitle?: unknown;
    relationship?: unknown;
    updates?: unknown;
    position?: { x?: unknown; y?: unknown };
    nodeTitles?: unknown;
    groupTitle?: unknown;
  };

  if (typeof candidate.type !== "string" || candidate.type.length === 0) {
    return null;
  }

  if (candidate.type === "CREATE_NODE") {
    if (typeof candidate.title !== "string" || candidate.title.length === 0) {
      return null;
    }

    return `CREATE_NODE:${candidate.title}`;
  }

  if (candidate.type === "CREATE_EDGE") {
    if (
      typeof candidate.sourceTitle !== "string" ||
      typeof candidate.targetTitle !== "string"
    ) {
      return null;
    }

    return `CREATE_EDGE:${candidate.sourceTitle}|${candidate.targetTitle}|${String(candidate.relationship ?? "")}`;
  }

  if (candidate.type === "UPDATE_NODE") {
    if (
      typeof candidate.targetTitle !== "string" ||
      !candidate.updates ||
      typeof candidate.updates !== "object"
    ) {
      return null;
    }

    return `UPDATE_NODE:${candidate.targetTitle}|${stableJson(candidate.updates)}`;
  }

  if (candidate.type === "DELETE_NODE") {
    if (typeof candidate.targetTitle !== "string") {
      return null;
    }

    return `DELETE_NODE:${candidate.targetTitle}`;
  }

  if (candidate.type === "DELETE_EDGE") {
    if (
      typeof candidate.sourceTitle !== "string" ||
      typeof candidate.targetTitle !== "string"
    ) {
      return null;
    }

    return `DELETE_EDGE:${candidate.sourceTitle}|${candidate.targetTitle}|${String(candidate.relationship ?? "")}`;
  }

  if (candidate.type === "MOVE_NODE") {
    if (
      typeof candidate.targetTitle !== "string" ||
      !candidate.position ||
      typeof candidate.position !== "object"
    ) {
      return null;
    }

    return `MOVE_NODE:${candidate.targetTitle}|${String(candidate.position.x)}|${String(candidate.position.y)}`;
  }

  if (candidate.type === "GROUP_NODES") {
    if (
      typeof candidate.groupTitle !== "string" ||
      !Array.isArray(candidate.nodeTitles)
    ) {
      return null;
    }

    const titles = candidate.nodeTitles
      .filter((title): title is string => typeof title === "string")
      .map((title) => title.trim())
      .filter((title) => title.length > 0)
      .sort();

    return `GROUP_NODES:${candidate.groupTitle.trim()}|${titles.join(",")}`;
  }

  return null;
}

export function deduplicateActions<T>(actions: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const action of actions) {
    const key = logicalActionKey(action);

    if (key === null) {
      unique.push(action);
      continue;
    }

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(action);
  }

  return unique;
}
