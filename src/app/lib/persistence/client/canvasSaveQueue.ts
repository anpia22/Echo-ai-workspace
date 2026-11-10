/**
 * P1.2 — Canvas saves: one at a time, rebased when someone else saved first.
 *
 * Two problems this fixes:
 *  - Saves from one tab used to run concurrently with the same revision, so the second one
 *    always lost to the first ("stale") and was dropped.
 *  - After another person's save, every later save from this tab was rejected as stale until
 *    a page reload, because the tab never learned the new revision. Edits showed on screen
 *    but were never stored.
 *
 * Saves are entity-level upserts and deletes (not whole-canvas replacements), so retrying one
 * on the latest revision applies exactly this client's change on top of the other person's.
 * If both changed the same item, the later save wins, the same rule the live sync already
 * applies on screen.
 *
 * Pure of React and fetch: the I/O functions are injected so the logic is unit-tested.
 */

export type SaveOutcome = { newRevision: number };

export type SaveDeps<M> = {
  /** Sends the mutation with the given base revision. Must throw a StaleError on a stale revision. */
  send: (mutation: M, baseRevision: number) => Promise<SaveOutcome>;
  /** Reads the server's current revision. */
  fetchRevision: () => Promise<number>;
  /** The revision this client currently believes is current (null until hydrated). */
  getRevision: () => number | null;
  /** Called whenever the client learns a newer revision (after a save or a rebase). */
  setRevision: (revision: number) => void;
  isStale: (error: unknown) => boolean;
  /** Attempts per mutation, including the first. */
  maxAttempts?: number;
  /** Return false to abandon queued work (e.g. the workspace changed). */
  shouldContinue?: () => boolean;
};

export const DEFAULT_MAX_ATTEMPTS = 4;

export class SaveAbandoned extends Error {
  constructor() {
    super("Save abandoned: workspace changed");
    this.name = "SaveAbandoned";
  }
}

/** Sends one mutation, rebasing and retrying on stale revisions. Throws the last error. */
export async function saveWithRebase<M>(mutation: M, deps: SaveDeps<M>): Promise<SaveOutcome & { attempts: number }> {
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (deps.shouldContinue && !deps.shouldContinue()) throw new SaveAbandoned();

    const base = deps.getRevision();
    if (base === null) throw new SaveAbandoned(); // not hydrated yet: nothing safe to send

    try {
      const result = await deps.send(mutation, base);
      deps.setRevision(result.newRevision);
      return { ...result, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (!deps.isStale(error)) throw error;
      if (attempt === maxAttempts) break;
      // Someone else saved first: learn the latest revision and apply our change on top.
      const latest = await deps.fetchRevision();
      deps.setRevision(latest);
    }
  }
  throw lastError;
}

/**
 * Runs saves strictly in order. A failed save never blocks the ones after it.
 * Returns the promise for this task, so callers can observe it if they want.
 */
export function createSaveQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;
  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      pending++;
      const run = tail.then(task, task);
      tail = run.then(
        () => undefined,
        () => undefined
      ).finally(() => {
        pending--;
      });
      return run;
    },
    get pending() {
      return pending;
    },
  };
}
