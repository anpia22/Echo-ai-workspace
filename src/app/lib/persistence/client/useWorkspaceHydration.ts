/**
 * Phase 13.4 — Workspace Hydration Hook: useWorkspaceHydration
 *
 * Coordinates URL identity, server loading/creation, and frontend state hydration.
 *
 * CRITICAL INVARIANTS:
 * - Deterministic URL routing: /?workspace=<workspaceId>
 * - At most one workspace creation attempt per unparameterized page lifecycle (guarded against React StrictMode).
 * - Race condition protection: newer workspace requests immediately supersede older in-flight creations or loads.
 * - Stale async responses or aborted requests are discarded and never commit state or mutate URL.
 * - Hydration is strictly READ-ONLY; zero writes to persistence.
 * - Does not import server/repository/database code.
 */

import { setWorkspaceReadOnly } from "./readOnly";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Workspace, CreateWorkspaceResponse } from "../workspaceTypes";
import {
  createWorkspaceApi,
  listWorkspacesApi,
  loadWorkspaceApi,
  WorkspaceApiError,
} from "./workspaceApi";
import {
  normalizePersistedCanvas,
  normalizePersistedConversations,
  pickWorkspaceToOpen,
  type RuntimeCanvasState,
  type RuntimeConversation,
} from "./workspaceHydration";

export type HydrationStatus = "idle" | "loading" | "ready" | "error";

export type HydrationError = {
  status?: number;
  code: string;
  message: string;
};

export type WorkspaceHydrationResult = {
  status: HydrationStatus;
  workspaceId: string | null;
  workspace: Workspace | null;
  hydratedCanvas: RuntimeCanvasState | null;
  hydratedConversations: RuntimeConversation[] | null;
  error: HydrationError | null;
  retry: () => void;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAST_WORKSPACE_KEY = "echo_last_active_workspace_id";
const CANONICAL_FALLBACK_WORKSPACE_ID = "cf6233ce-0e8d-45a4-9624-3c97f3ccd1d1";

export function useWorkspaceHydration(rawWorkspaceParam: string | null): WorkspaceHydrationResult {
  const [status, setStatus] = useState<HydrationStatus>("loading");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [hydratedCanvas, setHydratedCanvas] = useState<RuntimeCanvasState | null>(null);
  const [hydratedConversations, setHydratedConversations] = useState<RuntimeConversation[] | null>(null);
  const [error, setError] = useState<HydrationError | null>(null);

  // Guards against race conditions, stale responses, and React Strict Mode double-invocations
  const activeRequestGenRef = useRef(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const inFlightCreationPromiseRef = useRef<Promise<CreateWorkspaceResponse> | null>(null);
  const hasCreatedRef = useRef(false);
  const retryCountRef = useRef(0);
  const workspaceIdRef = useRef<string | null>(null);

  const performHydration = useCallback(async () => {
    const trimmedParam = rawWorkspaceParam?.trim();

    // Guard: If workspace is already loaded/hydrated and there is either no workspace parameter
    // in the URL or the parameter matches the already-loaded workspace, maintain "ready" status
    // and avoid re-entering "loading" (which causes frozen loading screens on room creation/navigation).
    if (hasCreatedRef.current && workspaceIdRef.current) {
      if (!trimmedParam || trimmedParam === workspaceIdRef.current) {
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          if (!url.searchParams.has("workspace")) {
            url.searchParams.set("workspace", workspaceIdRef.current);
            window.history.replaceState(null, "", url.toString());
          }
        }
        setStatus("ready");
        return;
      }
    }

    // 1. Abort any previous in-flight request
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    const currentGen = ++activeRequestGenRef.current;
    setStatus("loading");
    setError(null);

    // -------------------------------------------------------------
    // Case A: Concrete workspace identity in URL
    // -------------------------------------------------------------
    if (trimmedParam) {
      // Validate workspace UUID shape
      if (!UUID_REGEX.test(trimmedParam)) {
        setStatus("error");
        setError({
          status: 400,
          code: "INVALID_WORKSPACE_ID",
          message: `The workspace ID in the URL is malformed: '${trimmedParam}'`,
        });
        return;
      }

      setWorkspaceId(trimmedParam);

      try {
        const hydrationData = await loadWorkspaceApi(trimmedParam, controller.signal);

        // Stale check: discard if superseded by a newer request or aborted
        if (currentGen !== activeRequestGenRef.current || controller.signal.aborted) {
          return;
        }

        const normalizedCanvas = normalizePersistedCanvas(hydrationData.canvas);
        const normalizedConvs = normalizePersistedConversations(
          hydrationData.conversations,
          hydrationData.activeConversationMessages,
          normalizedCanvas
        );

        setWorkspaceReadOnly(hydrationData.role === "viewer");
        setWorkspace(hydrationData.workspace);
        setHydratedCanvas(normalizedCanvas);
        setHydratedConversations(normalizedConvs);
        workspaceIdRef.current = trimmedParam;
        hasCreatedRef.current = true;

        if (typeof window !== "undefined" && window.localStorage) {
          try {
            window.localStorage.setItem(LAST_WORKSPACE_KEY, trimmedParam);
          } catch {
            // ignore localStorage quota/disabled errors
          }
        }

        setStatus("ready");
      } catch (err) {
        if (currentGen !== activeRequestGenRef.current || controller.signal.aborted) {
          return;
        }

        if (err instanceof WorkspaceApiError) {
          setStatus("error");
          setError({
            status: err.status,
            code: err.code,
            message: err.message,
          });
        } else {
          setStatus("error");
          setError({
            status: 500,
            code: "LOAD_ERROR",
            message: err instanceof Error ? err.message : "Failed to load workspace",
          });
        }
      }
    } else {
      // -------------------------------------------------------------
      // Case B: No workspace identity in URL -> Restore last active or create new
      // -------------------------------------------------------------
      // Prevent duplicate creation attempts for the same unparameterized mount (StrictMode defense)
      if (hasCreatedRef.current) {
        if (workspaceIdRef.current) {
          setStatus("ready");
        }
        return;
      }

      // The browser pointer is only a hint for WHICH of the account's workspaces to open.
      let storedPointer: string | null = null;
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          const stored = window.localStorage.getItem(LAST_WORKSPACE_KEY);
          if (stored && UUID_REGEX.test(stored.trim())) {
            storedPointer = stored.trim();
          }
        } catch {
          // ignore
        }
      }

      // The account is the source of truth: ask the server which workspaces this user
      // belongs to, so data follows the user across sign-outs and devices.
      let candidateWorkspaceId: string | null = null;
      let serverListResolved = false;
      try {
        const { workspaces } = await listWorkspacesApi(controller.signal);
        if (controller.signal.aborted || currentGen !== activeRequestGenRef.current) {
          return;
        }
        serverListResolved = true;
        candidateWorkspaceId = pickWorkspaceToOpen(workspaces, storedPointer);
      } catch (err) {
        if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError") || currentGen !== activeRequestGenRef.current) {
          return;
        }
        console.warn("[useWorkspaceHydration] Could not list workspaces, using browser pointer:", err);
      }

      // Only when the server list is unavailable do we rely on the pointer / legacy fallback.
      if (!serverListResolved) {
        candidateWorkspaceId = storedPointer ?? CANONICAL_FALLBACK_WORKSPACE_ID;
      }

      if (candidateWorkspaceId) {
        try {
          const hydrationData = await loadWorkspaceApi(candidateWorkspaceId, controller.signal);
          if (currentGen !== activeRequestGenRef.current || controller.signal.aborted) {
            return;
          }

          const normalizedCanvas = normalizePersistedCanvas(hydrationData.canvas);
          const normalizedConvs = normalizePersistedConversations(
            hydrationData.conversations,
            hydrationData.activeConversationMessages,
            normalizedCanvas
          );

          hasCreatedRef.current = true;
          workspaceIdRef.current = candidateWorkspaceId;
          setWorkspaceId(candidateWorkspaceId);
          setWorkspaceReadOnly(hydrationData.role === "viewer");
          setWorkspace(hydrationData.workspace);
          setHydratedCanvas(normalizedCanvas);
          setHydratedConversations(normalizedConvs);

          if (typeof window !== "undefined" && window.localStorage) {
            try {
              window.localStorage.setItem(LAST_WORKSPACE_KEY, candidateWorkspaceId);
            } catch {}
          }

          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set("workspace", candidateWorkspaceId);
            window.history.replaceState(null, "", url.toString());
          }

          setStatus("ready");
          return;
        } catch (err) {
          // If the request was cancelled/aborted intentionally (e.g., StrictMode remount or active parameter change),
          // discard immediately and do NOT treat as failure or create a fallback workspace.
          if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError") || currentGen !== activeRequestGenRef.current) {
            return;
          }

          console.warn("[useWorkspaceHydration] Candidate workspace load failed, falling back to new workspace creation:", err);
          // Forget the pointer only when the workspace is truly gone (404). A 403/network error
          // (e.g. signed out, wrong account) must not erase the user's way back to their data.
          if (err instanceof WorkspaceApiError && err.status === 404 && typeof window !== "undefined" && window.localStorage) {
            try {
              window.localStorage.removeItem(LAST_WORKSPACE_KEY);
            } catch {}
          }
        }
      }

      // Check abort before creating workspace
      if (controller.signal.aborted || currentGen !== activeRequestGenRef.current) {
        return;
      }

      if (!inFlightCreationPromiseRef.current) {
        inFlightCreationPromiseRef.current = createWorkspaceApi({ title: "Echo Workspace" });
      }

      try {
        const created = await inFlightCreationPromiseRef.current;

        // Stale check: discard if a concrete request began while creation was in flight
        if (currentGen !== activeRequestGenRef.current) {
          return;
        }

        hasCreatedRef.current = true;
        inFlightCreationPromiseRef.current = null;

        const newId = created.workspace.id;
        workspaceIdRef.current = newId;
        setWorkspaceId(newId);
        setWorkspaceReadOnly(false);
        setWorkspace(created.workspace);
        setHydratedCanvas({ nodes: [], edges: [], groups: [] });
        setHydratedConversations([]);

        if (typeof window !== "undefined" && window.localStorage) {
          try {
            window.localStorage.setItem(LAST_WORKSPACE_KEY, newId);
          } catch {}
        }

        // Update URL safely without full page reload, preserving other query parameters (e.g. room)
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("workspace", newId);
          window.history.replaceState(null, "", url.toString());
        }

        setStatus("ready");
      } catch (err) {
        inFlightCreationPromiseRef.current = null;
        if (currentGen !== activeRequestGenRef.current) {
          return;
        }

        if (err instanceof WorkspaceApiError) {
          setStatus("error");
          setError({
            status: err.status,
            code: err.code,
            message: err.message,
          });
        } else {
          setStatus("error");
          setError({
            status: 500,
            code: "CREATE_ERROR",
            message: err instanceof Error ? err.message : "Failed to initialize workspace",
          });
        }
      }
    }
  }, [rawWorkspaceParam]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async workspace hydration on mount
    void performHydration();
  }, [performHydration]);

  useEffect(() => {
    return () => {
      activeAbortControllerRef.current?.abort();
    };
  }, []);

  const retry = useCallback(() => {
    retryCountRef.current++;
    hasCreatedRef.current = false;
    workspaceIdRef.current = null;
    inFlightCreationPromiseRef.current = null;
    void performHydration();
  }, [performHydration]);

  return {
    status,
    workspaceId,
    workspace,
    hydratedCanvas,
    hydratedConversations,
    error,
    retry,
  };
}
