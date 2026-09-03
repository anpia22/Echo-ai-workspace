"use client";

import { useEffect, useRef, useState } from "react";
import type { Participant } from "../lib/collaboration/participant";

type PresenceIndicatorProps = {
  participants: Participant[];
  currentParticipant: Participant | null;
};

export default function PresenceIndicator({
  participants,
  currentParticipant,
}: PresenceIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  // Combine participants ensuring currentParticipant is present if tracked
  const displayParticipants: Participant[] = [...participants];
  if (
    currentParticipant &&
    !displayParticipants.some((p) => p.userId === currentParticipant.userId)
  ) {
    displayParticipants.unshift(currentParticipant);
  }

  // Sort so current user is first
  displayParticipants.sort((a, b) => {
    if (a.userId === currentParticipant?.userId) return -1;
    if (b.userId === currentParticipant?.userId) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  const count = displayParticipants.length;

  if (count === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
        title={`${count} participant${count === 1 ? "" : "s"} in room`}
      >
        <span className="flex -space-x-1.5 overflow-hidden">
          {displayParticipants.slice(0, 3).map((participant) => (
            <span
              key={participant.userId}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ring-1 ring-zinc-900"
              style={{ backgroundColor: participant.color }}
              title={
                participant.userId === currentParticipant?.userId
                  ? `${participant.displayName} (You)`
                  : participant.displayName
              }
            >
              {participant.displayName.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </span>
        <span className="text-zinc-400">👥 {count}</span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-50 mt-1.5 w-48 rounded-xl border border-zinc-800 bg-zinc-900 p-2 shadow-xl">
          <div className="mb-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            In Room ({count})
          </div>
          <div className="space-y-1">
            {displayParticipants.map((participant) => {
              const isYou = participant.userId === currentParticipant?.userId;
              return (
                <div
                  key={participant.userId}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-200 transition hover:bg-zinc-800/60"
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: participant.color }}
                  >
                    {participant.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {participant.displayName}
                    {isYou ? (
                      <span className="ml-1 text-[10px] text-zinc-400 font-normal">
                        (You)
                      </span>
                    ) : null}
                  </span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
