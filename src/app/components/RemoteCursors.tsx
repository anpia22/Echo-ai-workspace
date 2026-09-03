"use client";

import { useMemo } from "react";
import { ViewportPortal } from "@xyflow/react";
import type { RemoteCursor } from "../lib/collaboration/cursorEvents";
import type { Participant } from "../lib/collaboration/participant";

type RemoteCursorsProps = {
  cursors?: RemoteCursor[];
  participants?: Participant[];
};

export default function RemoteCursors({
  cursors = [],
  participants = [],
}: RemoteCursorsProps) {
  const participantMap = useMemo(() => {
    return new Map(participants.map((p) => [p.userId, p]));
  }, [participants]);

  if (!cursors || cursors.length === 0) {
    return null;
  }

  return (
    <ViewportPortal>
      <div className="pointer-events-none absolute inset-0 z-50 overflow-visible">
        {cursors.map((cursor) => {
          const participant = participantMap.get(cursor.userId);

          // If participant metadata has not arrived yet, safely skip rendering
          if (!participant) {
            return null;
          }

          return (
            <div
              key={cursor.userId}
              className="absolute left-0 top-0 transition-transform duration-75 ease-out will-change-transform"
              style={{
                transform: `translate(${cursor.x}px, ${cursor.y}px)`,
                pointerEvents: "none",
              }}
            >
              {/* Cursor SVG Arrow Pointer */}
              <svg
                className="h-5 w-5 -translate-x-0.5 -translate-y-0.5 drop-shadow-md"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="1.5"
              >
                <path
                  d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"
                  fill={participant.color}
                />
              </svg>

              {/* Participant Display Name Badge */}
              <div
                className="ml-3 -mt-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                style={{ backgroundColor: participant.color }}
              >
                {participant.displayName}
              </div>
            </div>
          );
        })}
      </div>
    </ViewportPortal>
  );
}
