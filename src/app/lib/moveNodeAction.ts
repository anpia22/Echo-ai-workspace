export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export type ValidMoveNode = {
  type: "MOVE_NODE";
  targetTitle: string;
  position: {
    x: number;
    y: number;
  };
};

export function parseMoveNodeAction(
  action: unknown
): ValidMoveNode | null {
  if (!action || typeof action !== "object") {
    return null;
  }

  const candidate = action as {
    type?: unknown;
    targetTitle?: unknown;
    position?: {
      x?: unknown;
      y?: unknown;
    };
  };

  if (candidate.type !== "MOVE_NODE") {
    return null;
  }

  if (
    typeof candidate.targetTitle !== "string" ||
    candidate.targetTitle.length === 0
  ) {
    return null;
  }

  if (!candidate.position || typeof candidate.position !== "object") {
    return null;
  }

  if (
    !isFiniteNumber(candidate.position.x) ||
    !isFiniteNumber(candidate.position.y)
  ) {
    return null;
  }

  return {
    type: "MOVE_NODE",
    targetTitle: candidate.targetTitle,
    position: {
      x: candidate.position.x,
      y: candidate.position.y,
    },
  };
}
