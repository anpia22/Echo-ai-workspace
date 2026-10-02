"use client";

import React, { useEffect, useRef, useState } from "react";

export function useInView(options: IntersectionObserverInit = { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    // If user prefers reduced motion, trigger immediately
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsInView(true);
      return;
    }

    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        observer.unobserve(element);
      }
    }, options);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [options.threshold, options.rootMargin]);

  return [ref, isInView] as const;
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
  const [ref, inView] = useInView();

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
        inView
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
  const [ref, inView] = useInView();

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
            inView ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-7 scale-[0.98]"
          }`}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
