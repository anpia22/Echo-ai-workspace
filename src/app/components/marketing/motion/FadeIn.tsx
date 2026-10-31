"use client";

import React, { useEffect, useRef, useState } from "react";

type RevealState = "visible" | "hidden" | "shown";

/**
 * Content is visible by default (SSR, no-JS, print, previews). After mount,
 * only elements that start below the fold are hidden, then revealed when they
 * scroll into view. Elements already on screen never flash.
 */
export function useReveal(
  options: IntersectionObserverInit = { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<RevealState>("visible");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight) return;

    setState("hidden");

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setState("shown");
        observer.disconnect();
      }
    }, options);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [options.threshold, options.rootMargin]);

  return [ref, state !== "hidden"] as const;
}

interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number; // milliseconds
  duration?: number; // milliseconds
  direction?: "up" | "down" | "none";
  scale?: boolean;
}

export function FadeIn({
  children,
  className = "",
  delay = 0,
  duration = 700,
  direction = "up",
  scale = false,
}: FadeInProps) {
  const [ref, shown] = useReveal();

  const getInitialTransform = () => {
    if (direction === "up") return "translate-y-8";
    if (direction === "down") return "-translate-y-8";
    return "";
  };

  const initialScale = scale ? "scale-[0.95]" : "";

  return (
    <div
      ref={ref}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      className={`transition-all motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 ${
        shown
          ? "opacity-100 translate-y-0 scale-100"
          : `opacity-0 ${getInitialTransform()} ${initialScale}`
      } ${className}`}
    >
      {children}
    </div>
  );
}

interface StaggerProps {
  children: React.ReactNode[];
  className?: string;
  baseDelay?: number;
  step?: number;
}

export function Stagger({
  children,
  className = "",
  baseDelay = 0,
  step = 90,
}: StaggerProps) {
  const [ref, shown] = useReveal();

  return (
    <div ref={ref} className={className}>
      {React.Children.map(children, (child, index) => (
        <div
          key={index}
          style={{
            transitionDuration: "650ms",
            transitionDelay: `${baseDelay + index * step}ms`,
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          className={`transition-all motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 ${
            shown ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-7 scale-[0.98]"
          }`}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
