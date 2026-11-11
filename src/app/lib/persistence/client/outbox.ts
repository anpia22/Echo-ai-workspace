/**
 * P1.3 — Outbox: writes that must survive a flaky or dropped connection.
 *
 * Every save goes through here. Items run strictly one at a time, in the order they were made.
 * A failure that looks temporary (offline, timeout, server error) keeps the item at the front of
 * the line and retries with backoff; the browser's "online" event retries at once. A failure that
 * will never succeed (forbidden, invalid) drops the item and reports it, so one bad item cannot
 * block everything behind it.
 *
 * Pure of React and fetch: time, timers, online state and the actual save are injected, so the
 * behaviour is unit-tested with a fake clock.
 *
 * Not (yet) durable across a page reload: the queue lives in memory, and the app asks the browser
 * to warn before the tab closes while items are waiting.
 */

export type OutboxItem<P = unknown> = {
  id: string;
  /** What kind of write this is; the executor decides how to run it. */
  kind: string;
  /** Optional. A newer item with the same key replaces a waiting one (latest snapshot wins). */
  key?: string;
  payload: P;
};

export type Verdict = "retry" | "drop";
export type OutboxState = "idle" | "sending" | "waiting" | "offline";

export type OutboxStatus = {
  /** Items not yet saved, including the one in flight. */
  pending: number;
  state: OutboxState;
  /** Items abandoned because they could never succeed, since this outbox was created. */
  dropped: number;
};

export type OutboxOptions = {
  execute: (item: OutboxItem) => Promise<void>;
  /** Decides what a failure means. Anything not clearly temporary should be "drop". */
  classify: (error: unknown, item: OutboxItem) => Verdict;
  /** Called when an item is abandoned (permanent failure, or the queue was full). */
  onDrop?: (item: OutboxItem, reason: unknown) => void;
  /** Merge `next` into the waiting tail item, or return null to keep them separate. */
  coalesce?: (tail: OutboxItem, next: OutboxItem) => OutboxItem | null;
  isOnline?: () => boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  random?: () => number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxItems?: number;
};

export const DEFAULT_BASE_DELAY_MS = 1_000;
export const DEFAULT_MAX_DELAY_MS = 30_000;
export const DEFAULT_MAX_ITEMS = 1_000;

/** Exponential backoff with jitter, never above the cap. Attempt 1 waits about the base delay. */
export function backoffDelayMs(attempt: number, base: number, max: number, random: () => number = Math.random): number {
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  return Math.min(max, Math.round(exp + random() * base * 0.25));
}

export function createOutbox(options: OutboxOptions) {
  const isOnline = options.isOnline ?? (() => true);
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const random = options.random ?? Math.random;
  const base = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const max = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;

  const queue: OutboxItem[] = [];
  let inFlight: OutboxItem | null = null;
  let draining = false;
  let attempt = 0;
  let timer: unknown = null;
  let state: OutboxState = "idle";
  let dropped = 0;
  const listeners = new Set<() => void>();

  const status = (): OutboxStatus => ({ pending: queue.length, state, dropped });
  const emit = () => listeners.forEach((l) => l());

  function setState(next: OutboxState) {
    if (state !== next) {
      state = next;
    }
    emit();
  }

  function report(item: OutboxItem, reason: unknown) {
    dropped++;
    try {
      options.onDrop?.(item, reason);
    } catch {
      // a failing notifier must never break the queue
    }
  }

  function clearScheduled() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  /** New work wakes the queue, but never skips a backoff wait that is already scheduled. */
  function poke() {
    if (timer === null) void drain();
  }

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        if (!isOnline()) {
          setState("offline");
          return; // waits for kick() when the browser reports it is back
        }
        const item = queue[0];
        inFlight = item;
        setState("sending");
        try {
          await options.execute(item);
          queue.shift();
          attempt = 0;
          inFlight = null;
          emit();
        } catch (error) {
          inFlight = null;
          if (options.classify(error, item) === "drop") {
            queue.shift();
            attempt = 0;
            report(item, error);
            emit();
            continue; // one bad item must not block the rest
          }
          attempt++;
          setState(isOnline() ? "waiting" : "offline");
          clearScheduled();
          timer = setTimer(() => {
            timer = null;
            void drain();
          }, backoffDelayMs(attempt, base, max, random));
          return;
        }
      }
      setState("idle");
    } finally {
      draining = false;
      inFlight = null;
    }
  }

  return {
    enqueue(item: OutboxItem): void {
      // Same key and still waiting: the newer snapshot replaces it in place.
      if (item.key !== undefined) {
        const i = queue.findIndex((q) => q.key === item.key && q !== inFlight);
        if (i !== -1) {
          queue[i] = item;
          emit();
          poke();
          return;
        }
      }
      // Merge into the waiting tail when the caller says it is safe.
      const tail = queue[queue.length - 1];
      if (tail && tail !== inFlight && options.coalesce) {
        const merged = options.coalesce(tail, item);
        if (merged) {
          queue[queue.length - 1] = merged;
          emit();
          poke();
          return;
        }
      }
      if (queue.length >= maxItems) {
        // Make room by abandoning the oldest waiting item, and say so.
        const i = queue.findIndex((q) => q !== inFlight);
        if (i !== -1) report(queue.splice(i, 1)[0], new Error("outbox full"));
      }
      queue.push(item);
      emit();
      poke();
    },

    /** The browser came back online, or the tab became visible: try again now, with fresh backoff. */
    kick(): void {
      clearScheduled();
      attempt = 0;
      void drain();
    },

    /** Removes waiting items matching `predicate` (e.g. when the user leaves a workspace). */
    discard(predicate: (item: OutboxItem) => boolean): number {
      let removed = 0;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i] !== inFlight && predicate(queue[i])) {
          queue.splice(i, 1);
          removed++;
        }
      }
      if (removed) emit();
      return removed;
    },

    status,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Resolves when nothing is pending (or the outbox is stuck waiting). For tests and shutdown. */
    async idle(): Promise<void> {
      while (draining) await Promise.resolve();
    },
  };
}
