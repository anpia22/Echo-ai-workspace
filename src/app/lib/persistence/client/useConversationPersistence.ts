/**
 * Phase 13.6 — Conversation Persistence Hook
 *
 * Manages durable persistence of conversations and messages to Supabase/PostgreSQL.
 *
 * CRITICAL INVARIANTS:
 * - Runtime state (messages in React state) is updated first; persistence is non-blocking.
 * - Persistence failures set visible "error" or "conflict" status; NEVER silently report "saved".
 * - Persistence failure does NOT delete or destructively mutate the local user message.
 * - Strict race protection: late responses from conversation A cannot overwrite conversation B.
 * - Hydration is read-only; this hook never triggers unsolicited writes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendMessageApi,
  createConversationApi,
  listConversationMessagesApi,
  ConversationPersistenceConflictError,
  ConversationPersistenceApiError,
} from "./conversationApi";
import type { MessageRecord, MessageRole } from "../conversationTypes";

export type ConversationPersistenceStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export type RuntimeMessageInput = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type RuntimeConversationInput = {
  id: string;
  title: string;
};

export function useConversationPersistence(workspaceId: string | null) {
  const [conversationPersistenceStatus, setConversationPersistenceStatus] =
    useState<ConversationPersistenceStatus>("idle");

  const activeRequestIdRef = useRef<number>(0);
  const activeConversationIdRef = useRef<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const setSavedWithAutoClear = useCallback(() => {
    setConversationPersistenceStatus("saved");
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = setTimeout(() => {
      setConversationPersistenceStatus("idle");
      savedTimerRef.current = null;
    }, 2000);
  }, []);

  /**
   * Persists a new conversation thread to the backend database.
   */
  const persistNewConversation = useCallback(
    async (conversation: RuntimeConversationInput): Promise<boolean> => {
      if (!workspaceId) {
        return false;
      }

      setConversationPersistenceStatus("saving");

      try {
        await createConversationApi(workspaceId, {
          id: conversation.id,
          title: conversation.title,
        });

        setSavedWithAutoClear();
        return true;
      } catch (err) {
        if (err instanceof ConversationPersistenceConflictError) {
          setConversationPersistenceStatus("conflict");
        } else {
          console.error("[useConversationPersistence] Failed to persist conversation:", err);
          setConversationPersistenceStatus("error");
        }
        return false;
      }
    },
    [workspaceId, setSavedWithAutoClear]
  );

  /**
   * Persists a user or assistant message to the active conversation thread.
   */
  const persistMessage = useCallback(
    async (
      conversationId: string,
      message: RuntimeMessageInput,
      conversationTitle?: string
    ): Promise<boolean> => {
      if (!workspaceId || !conversationId) {
        return false;
      }

      setConversationPersistenceStatus("saving");

      try {
        await appendMessageApi(workspaceId, conversationId, {
          id: message.id,
          role: message.role as MessageRole,
          content: message.content,
        });

        setSavedWithAutoClear();
        return true;
      } catch (err) {
        // Self-healing: if the conversation thread does not exist yet in this workspace
        // (e.g. client initialized, legacy localStorage, or created before workspace persistence),
        // auto-create the conversation thread and retry appending the message.
        if (
          err instanceof ConversationPersistenceApiError &&
          (err.status === 404 || err.code === "NOT_FOUND" || err.message.includes("not found in workspace"))
        ) {
          try {
            try {
              await createConversationApi(workspaceId, {
                id: conversationId,
                title: conversationTitle || "New Conversation",
              });
            } catch (createErr) {
              if (!(createErr instanceof ConversationPersistenceConflictError)) {
                throw createErr;
              }
            }

            await appendMessageApi(workspaceId, conversationId, {
              id: message.id,
              role: message.role as MessageRole,
              content: message.content,
            });

            setSavedWithAutoClear();
            return true;
          } catch (retryErr) {
            console.error("[useConversationPersistence] Failed to auto-provision conversation and persist message:", retryErr);
            setConversationPersistenceStatus("error");
            return false;
          }
        }

        if (err instanceof ConversationPersistenceConflictError) {
          setConversationPersistenceStatus("conflict");
        } else {
          console.error("[useConversationPersistence] Failed to persist message:", err);
          setConversationPersistenceStatus("error");
        }
        // IMPORTANT: Never delete or revert local message on persistence failure.
        return false;
      }
    },
    [workspaceId, setSavedWithAutoClear]
  );

  const activeAbortControllerRef = useRef<AbortController | null>(null);

  /**
   * Loads message history for an inactive conversation when switched.
   * Employs strict request-generation token and AbortController to drop stale out-of-order responses.
   */
  const loadConversationMessages = useCallback(
    async (
      conversationId: string,
      onLoaded: (conversationId: string, messages: MessageRecord[]) => void
    ): Promise<void> => {
      if (!workspaceId || !conversationId) {
        return;
      }

      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
        activeAbortControllerRef.current = null;
      }

      const controller = new AbortController();
      activeAbortControllerRef.current = controller;

      const requestId = ++activeRequestIdRef.current;
      activeConversationIdRef.current = conversationId;

      try {
        const messages = await listConversationMessagesApi(workspaceId, conversationId, {
          signal: controller.signal,
        });

        // Race protection: ignore response if user switched conversations before response returned
        if (
          controller.signal.aborted ||
          requestId !== activeRequestIdRef.current ||
          activeConversationIdRef.current !== conversationId
        ) {
          return;
        }

        onLoaded(conversationId, messages);
      } catch (err: any) {
        if (
          controller.signal.aborted ||
          requestId !== activeRequestIdRef.current ||
          err?.name === "AbortError"
        ) {
          return;
        }
        if (
          err instanceof ConversationPersistenceApiError &&
          (err.status === 404 || err.code === "NOT_FOUND" || err.message.includes("not found in workspace"))
        ) {
          // If conversation does not exist on server yet (e.g. client created, local storage),
          // treat as empty message list rather than fatal error
          onLoaded(conversationId, []);
          return;
        }
        console.error("[useConversationPersistence] Failed to load messages:", err);
        setConversationPersistenceStatus("error");
      }
    },
    [workspaceId]
  );

  return {
    conversationPersistenceStatus,
    persistNewConversation,
    persistMessage,
    loadConversationMessages,
  };
}
