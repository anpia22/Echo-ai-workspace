"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Participant } from "../lib/collaboration/participant";
import {
  computeFollowStateList,
  resolveParticipantDisplayName,
  formatFollowerCountLabel,
  formatFollowingLabel,
  type FollowStateItem,
} from "../lib/collaboration/presence";

export {
  computeFollowStateList,
  resolveParticipantDisplayName,
  formatFollowerCountLabel,
  formatFollowingLabel,
  type FollowStateItem,
};

export type PresenceIndicatorProps = {
  participants: Participant[];
  currentParticipant: Participant | null;
  followingUserId?: string | null;
  followerUserIds?: Set<string> | null;
  onFollow?: (userId: string) => void;
  onUnfollow?: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export default function PresenceIndicator({
  participants,
  currentParticipant,
  followingUserId,
  followerUserIds,
  onFollow,
  onUnfollow,
  isOpen: controlledIsOpen,
  onOpenChange,
}: PresenceIndicatorProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const setIsOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setInternalIsOpen((prevInternal) => {
        const currentVal = controlledIsOpen !== undefined ? controlledIsOpen : prevInternal;
        const resolved = typeof next === "function" ? next(currentVal) : next;
        onOpenChange?.(resolved);
        return resolved;
      });
    },
    [controlledIsOpen, onOpenChange]
  );

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
  }, [isOpen, setIsOpen]);

  const followItems = computeFollowStateList(
    participants,
    currentParticipant,
    followingUserId,
    followerUserIds
  );

  const count = followItems.length;
  const followerCount = followerUserIds?.size ?? 0;

  if (count === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen((prev: boolean) => !prev)}
        className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
        title={`${count} participant${count === 1 ? "" : "s"} in room${followerCount > 0 ? ` · ${formatFollowerCountLabel(followerCount)}` : ""}`}
      >
        <span className="flex -space-x-1.5 overflow-hidden">
          {followItems.slice(0, 3).map((item) => (
            <span
              key={item.userId}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ring-1 ring-zinc-900"
              style={{ backgroundColor: item.color }}
              title={item.isYou ? `${item.displayName} (You)` : item.displayName}
            >
              {item.displayName.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </span>
        <span className="text-zinc-400">
          👥 {count}
          {followingUserId ? (
            <span className="ml-1 text-[10px] font-medium text-blue-400">
              (Following)
            </span>
          ) : null}
          {followerCount > 0 ? (
            <span
              className="ml-1 text-[10px] font-medium text-emerald-400"
              title={formatFollowerCountLabel(followerCount)}
            >
              ({formatFollowerCountLabel(followerCount)})
            </span>
          ) : null}
        </span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-50 mt-1.5 w-72 rounded-xl border border-zinc-800 bg-zinc-900 p-2 shadow-xl">
          <div className="mb-1.5 flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <span>In Room ({count})</span>
            {followerCount > 0 ? (
              <span className="text-emerald-400 font-medium lowercase">
                {formatFollowerCountLabel(followerCount)}
              </span>
            ) : null}
          </div>
          <div className="space-y-1">
            {followItems.map((item) => {
              return (
                <div
                  key={item.userId}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-200 transition hover:bg-zinc-800/60"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: item.color }}
                    >
                      {item.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate font-medium">
                      {item.displayName}
                      {item.isYou ? (
                        <span className="ml-1 text-[10px] font-normal text-zinc-400">
                          (You)
                          {followerCount > 0 ? (
                            <span className="ml-1 font-medium text-emerald-400">
                              · {formatFollowerCountLabel(followerCount)}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.isFollower ? (
                      <span
                        className="rounded border border-emerald-500/40 bg-emerald-950/60 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300"
                        title={`${item.displayName} is following your viewport`}
                      >
                        Following you
                      </span>
                    ) : null}

                    {!item.isYou && onFollow ? (
                      item.isFollowing ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onUnfollow?.()}
                            className="rounded border border-blue-500/50 bg-blue-950/80 px-2 py-0.5 text-[10px] font-medium text-blue-300 transition hover:bg-blue-900/80"
                            title="Currently following. Click to unfollow"
                            aria-label={`Following ${item.displayName}. Click to unfollow.`}
                          >
                            Following
                          </button>
                          <button
                            type="button"
                            onClick={() => onUnfollow?.()}
                            className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300 transition hover:bg-zinc-700 hover:text-white"
                            title="Stop following"
                            aria-label={`Unfollow ${item.displayName}`}
                          >
                            Unfollow
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onFollow(item.userId)}
                          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-700 hover:text-white"
                          title={`Follow ${item.displayName}'s viewport`}
                          aria-label={`Follow ${item.displayName}`}
                        >
                          Follow
                        </button>
                      )
                    ) : null}
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
