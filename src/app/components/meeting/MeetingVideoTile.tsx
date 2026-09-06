"use client";

import { useEffect, useRef } from "react";

export type MeetingVideoTileProps = {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  className?: string;
  ariaLabel?: string;
};

/**
 * Reusable video component for binding a WebRTC MediaStream to an HTMLVideoElement.
 * Does not re-create the DOM element unnecessarily and prevents audio echo when muted.
 */
export function MeetingVideoTile({
  stream,
  muted = false,
  mirror = false,
  className = "",
  ariaLabel,
}: MeetingVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
    } else {
      videoEl.srcObject = null;
    }

    return () => {
      if (videoEl && videoEl.srcObject) {
        videoEl.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      aria-label={ariaLabel}
      className={`h-full w-full object-cover transition-transform duration-200 ${
        mirror ? "-scale-x-100" : ""
      } ${className}`}
    />
  );
}
