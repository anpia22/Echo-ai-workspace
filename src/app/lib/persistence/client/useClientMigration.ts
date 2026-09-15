/**
 * Phase 13.9 — Client Migration & Cutover Hook
 *
 * Manages the client-side migration of legacy localStorage data ("echo-conversations")
 * to persistent PostgreSQL workspaces.
 *
 * CRITICAL INVARIANTS & HARDENING:
 * 1. Zero data loss: Local data is NEVER deleted before verified backup.
 * 2. Crash-safe cutover protocol:
 *    Compare Hash -> Write BACKUP -> Verify BACKUP -> Write Manifest META -> Set FLAG -> Remove SOURCE.
 * 3. Source snapshot consistency: If SOURCE changed during in-flight migration, SOURCE
 *    is NOT deleted and backup is NOT overwritten blindly; safe reconciliation/retry is executed.
 * 4. Workspace-switch race protection: Mismatched generation or workspaceId discards callback.
 * 5. Global vs Workspace-scoped flag: Manifest explicitly validates target workspaceId via `isWorkspaceMigrated`.
 * 6. Deterministic Canvas ordering: selection metadata only; server timestamps are authoritative.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MigrateWorkspaceRequest,
  MigrateWorkspaceResponse,
  LegacyConversationPayload,
} from "../migrationTypes";
import { migrateWorkspaceApi } from "./migrationApi";

export const STORAGE_SOURCE_KEY = "echo-conversations";
export const STORAGE_BACKUP_KEY = "echo-conversations-backup";
export const STORAGE_FLAG_KEY = "echo-migrated-v1";
export const STORAGE_META_KEY = "echo-migration-v1-meta";

export type MigrationStatus = "idle" | "checking" | "migrating" | "migrated" | "skipped" | "error";

export type MigrationMeta = {
  workspaceId: string;
  migratedAt: string;
  sourceHash: string;
  sourceLength: number;
  importedConversations: number;
  importedMessages: number;
};

export type UseClientMigrationOptions = {
  workspaceId: string | null;
  enabled?: boolean;
  onMigrationComplete?: (response: MigrateWorkspaceResponse) => void;
};

/**
 * Fast, deterministic source snapshot string hash for in-flight consistency checking.
 */
export function computeSourceHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `h_${Math.abs(hash).toString(16)}_${str.length}`;
}

/**
 * Validates whether the active workspace has been authoritatively migrated to PostgreSQL.
 * Enforces the invariant: flag=true AND meta.workspaceId === activeWorkspaceId.
 */
export function isWorkspaceMigrated(activeWorkspaceId: string | null): boolean {
  if (typeof window === "undefined" || !window.localStorage || !activeWorkspaceId) {
    return false;
  }

  const flag = window.localStorage.getItem(STORAGE_FLAG_KEY);
  if (flag !== "true") {
    return false;
  }

  const rawMeta = window.localStorage.getItem(STORAGE_META_KEY);
  if (!rawMeta) {
    return false;
  }

  try {
    const meta: MigrationMeta = JSON.parse(rawMeta);
    return meta?.workspaceId === activeWorkspaceId;
  } catch {
    return false;
  }
}

export function useClientMigration({
  workspaceId,
  enabled = true,
  onMigrationComplete,
}: UseClientMigrationOptions) {
  const [status, setStatus] = useState<MigrationStatus>("idle");
  const [stats, setStats] = useState<MigrateWorkspaceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeWorkspaceIdRef = useRef<string | null>(workspaceId);
  useEffect(() => {
    activeWorkspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  const migrationGenerationRef = useRef<number>(0);
  const hasAttemptedRef = useRef<boolean>(false);
  const executeMigrationRef = useRef<((targetWsId: string) => Promise<void>) | null>(null);

  const executeMigration = useCallback(async (targetWsId: string) => {
    const currentGeneration = ++migrationGenerationRef.current;
    setStatus("checking");
    setError(null);

    try {
      if (typeof window === "undefined" || !window.localStorage) {
        setStatus("skipped");
        return;
      }

      // Check migration manifest and workspace-scoped completion
      if (isWorkspaceMigrated(targetWsId)) {
        setStatus("migrated");
        return;
      }

      // Startup Crash Reconciliation:
      // If backup exists and meta matches target workspace, but flag wasn't set (crash window)
      const existingBackup = localStorage.getItem(STORAGE_BACKUP_KEY);
      const rawMeta = localStorage.getItem(STORAGE_META_KEY);
      let parsedMeta: MigrationMeta | null = null;
      if (rawMeta) {
        try {
          parsedMeta = JSON.parse(rawMeta);
        } catch {
          // ignore corrupted meta
        }
      }

      if (existingBackup && parsedMeta?.workspaceId === targetWsId) {
        const backupHash = computeSourceHash(existingBackup);
        if (parsedMeta.sourceHash === backupHash) {
          localStorage.setItem(STORAGE_FLAG_KEY, "true");
          const currentSource = localStorage.getItem(STORAGE_SOURCE_KEY);
          if (currentSource === existingBackup) {
            localStorage.removeItem(STORAGE_SOURCE_KEY);
          }
          setStatus("migrated");
          return;
        }
      }

      // Step 1: Read source snapshot
      const sourceRaw = localStorage.getItem(STORAGE_SOURCE_KEY);
      if (!sourceRaw || sourceRaw.trim() === "" || sourceRaw.trim() === "[]") {
        setStatus("skipped");
        return;
      }

      let parsedConversations: LegacyConversationPayload[] = [];
      try {
        parsedConversations = JSON.parse(sourceRaw);
      } catch (err) {
        console.warn("[Migration] Failed to parse legacy conversations JSON:", err);
        setStatus("error");
        setError("Legacy storage data is malformed JSON; aborted migration to prevent data loss.");
        return;
      }

      if (!Array.isArray(parsedConversations) || parsedConversations.length === 0) {
        setStatus("skipped");
        return;
      }

      // Step 2: Capture exact source string snapshot and compute hash (Hardening Point #3)
      const sourceSnapshot = sourceRaw;
      const sourceHash = computeSourceHash(sourceSnapshot);
      const sourceLength = sourceSnapshot.length;

      setStatus("migrating");

      const req: MigrateWorkspaceRequest = {
        targetWorkspaceId: targetWsId,
        payload: {
          sourceStorageKey: "echo-conversations",
          exportedAt: new Date().toISOString(),
          conversations: parsedConversations,
        },
      };

      // Step 3: Server migration request
      const response = await migrateWorkspaceApi(targetWsId, req);

      // Workspace-switch guard: verify generation and workspaceId match
      if (
        migrationGenerationRef.current !== currentGeneration ||
        activeWorkspaceIdRef.current !== targetWsId
      ) {
        console.warn("[Migration] Discarding migration result due to active workspace switch");
        return;
      }

      // Step 4: Source snapshot consistency check BEFORE cutover (Hardening Point #3)
      const currentSource = localStorage.getItem(STORAGE_SOURCE_KEY);
      const currentHash = currentSource ? computeSourceHash(currentSource) : "";

      if (currentHash !== sourceHash) {
        // In-flight user edit detected!
        // DO NOT delete source! DO NOT overwrite backup blindly!
        console.warn(
          "[Migration] In-flight local change detected; preserving source without deletion for safe retry/reconciliation"
        );
        setStatus("error");
        setError("In-flight changes detected during migration. Legacy source preserved; retrying...");
        // Re-execute migration on next tick with new source
        setTimeout(() => {
          if (activeWorkspaceIdRef.current === targetWsId) {
            executeMigrationRef.current?.(targetWsId);
          }
        }, 100);
        return;
      }

      // Step 5: Crash-Safe Storage Cutover Protocol
      // 5a. Write backup
      localStorage.setItem(STORAGE_BACKUP_KEY, sourceSnapshot);

      // 5b. Verify backup
      const verifiedBackup = localStorage.getItem(STORAGE_BACKUP_KEY);
      if (!verifiedBackup || verifiedBackup.length !== sourceLength || computeSourceHash(verifiedBackup) !== sourceHash) {
        throw new Error("Backup verification failed: written backup does not match source snapshot");
      }

      // 5c. Write manifest with workspaceId and sourceHash
      const meta: MigrationMeta = {
        workspaceId: targetWsId,
        migratedAt: response.migratedAt,
        sourceHash,
        sourceLength,
        importedConversations: response.importedConversations,
        importedMessages: response.importedMessages,
      };
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));

      // 5d. Set completion flag
      localStorage.setItem(STORAGE_FLAG_KEY, "true");

      // 5e. Source removal (only executed after verified backup, manifest, and flag)
      localStorage.removeItem(STORAGE_SOURCE_KEY);

      setStats(response);
      setStatus("migrated");

      if (onMigrationComplete) {
        onMigrationComplete(response);
      }
    } catch (err) {
      if (
        migrationGenerationRef.current !== currentGeneration ||
        activeWorkspaceIdRef.current !== targetWsId
      ) {
        return;
      }

      const msg = err instanceof Error ? err.message : "Migration failed";
      console.error("[Migration] Error during workspace migration:", err);
      setError(msg);
      setStatus("error");
      // Zero data loss: source is left 100% untouched
    }
  }, [onMigrationComplete]);

  useEffect(() => {
    executeMigrationRef.current = executeMigration;
  }, [executeMigration]);

  useEffect(() => {
    if (!enabled || !workspaceId) {
      return;
    }
    if (hasAttemptedRef.current) {
      return;
    }
    hasAttemptedRef.current = true;
    executeMigration(workspaceId);
  }, [enabled, workspaceId, executeMigration]);

  return {
    status,
    stats,
    error,
    retryMigration: () => {
      if (workspaceId) {
        executeMigration(workspaceId);
      }
    },
  };
}
