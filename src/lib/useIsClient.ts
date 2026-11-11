import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server rendering and the first client render (so markup matches), true afterwards.
 * Use it to render portals and other browser-only UI, instead of setting a "mounted" state in an effect.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
