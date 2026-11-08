"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { saveProfile } from "@/lib/supabase/profile";
import {
  DISPLAY_NAME_MAX,
  validateDisplayName,
} from "@/lib/profileName";
import { getParticipantColor } from "../../lib/collaboration/participant";

type ProfileDialogProps = {
  /** "onboarding" can't be dismissed; "edit" can be closed with Esc or Cancel. */
  mode: "onboarding" | "edit";
  userId: string;
  initialName: string;
  onSaved: (name: string) => void;
  onClose?: () => void;
};

export function ProfileDialog({
  mode,
  userId,
  initialName,
  onSaved,
  onClose,
}: ProfileDialogProps) {
  const titleId = useId();
  const descId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isOnboarding = mode === "onboarding";
  const color = getParticipantColor(userId);
  const preview = validateDisplayName(name);
  const previewName = preview.ok ? preview.value : name.trim() || "Your name";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal needs the client DOM
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [mounted]);

  useEffect(() => {
    if (isOnboarding || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOnboarding, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const validated = validateDisplayName(name);
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    setSaving(true);
    setError(null);
    const result = await saveProfile(validated.value);
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.name);
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!isOnboarding && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-3xl border border-zinc-200/80 bg-white p-7 text-zinc-900 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <h2 id={titleId} className="text-xl font-bold tracking-tight">
          {isOnboarding ? "Welcome to Echo" : "Edit your profile"}
        </h2>
        <p id={descId} className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {isOnboarding
            ? "Choose the name your teammates will see on the canvas, in rooms and in meetings. You can change it any time."
            : "This is the name teammates see on the canvas, in rooms and in meetings."}
        </p>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/50">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {previewName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{previewName}</p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">How you appear to others</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5" noValidate>
          <label
            htmlFor={`${titleId}-name`}
            className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
          >
            Display name
          </label>
          <input
            id={`${titleId}-name`}
            ref={inputRef}
            type="text"
            value={name}
            maxLength={DISPLAY_NAME_MAX + 10}
            autoComplete="nickname"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${titleId}-error` : undefined}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-white"
            placeholder="Alex Morgan"
          />
          <div className="mt-1 flex items-start justify-between gap-3">
            <p
              id={`${titleId}-error`}
              role="alert"
              className="min-h-[1rem] text-xs text-red-600 dark:text-red-400"
            >
              {error}
            </p>
            <span className="shrink-0 text-[11px] text-zinc-400">
              {Array.from(name.trim()).length}/{DISPLAY_NAME_MAX}
            </span>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            {!isOnboarding && onClose ? (
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-500 active:scale-[0.99] disabled:opacity-50"
            >
              {saving ? "Saving…" : isOnboarding ? "Continue" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
