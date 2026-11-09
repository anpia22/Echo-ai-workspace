/**
 * Read-only workspace mode (viewer role).
 *
 * The server is the real gate: viewers are refused every write. This flag only keeps the
 * client from attempting writes it knows will be refused, so a viewer sees no errors.
 * It is set from the role the server returns when a workspace loads.
 */

import { useSyncExternalStore } from "react";

export class ReadOnlyWorkspaceError extends Error {
  constructor() {
    super("This workspace is view-only for your role.");
    this.name = "ReadOnlyWorkspaceError";
  }
}

let readOnly = false;
const listeners = new Set<() => void>();

export function setWorkspaceReadOnly(value: boolean): void {
  if (readOnly === value) return;
  readOnly = value;
  listeners.forEach((l) => l());
}

export function isWorkspaceReadOnly(): boolean {
  return readOnly;
}

export function subscribeReadOnly(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Call first in every function that writes to the server. */
export function assertWritable(): void {
  if (readOnly) throw new ReadOnlyWorkspaceError();
}

export function isReadOnlyError(err: unknown): boolean {
  return err instanceof ReadOnlyWorkspaceError;
}

/** React hook: true while the open workspace is view-only for this user. */
export function useWorkspaceReadOnly(): boolean {
  return useSyncExternalStore(subscribeReadOnly, isWorkspaceReadOnly, () => false);
}
