import Link from "next/link";
import React from "react";

interface OpenEchoButtonProps {
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}

export default function OpenEchoButton({
  className = "",
  children,
  onClick,
}: OpenEchoButtonProps) {
  return (
    <Link
      href="/"
      onClick={onClick}
      className={`echo-cta-btn group relative inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 !text-white shadow-sm dark:!bg-white dark:!text-black px-4 py-2 text-sm font-semibold transition-all duration-300 hover:bg-zinc-800 dark:hover:bg-zinc-100 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] hover:scale-[1.02] active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${className}`}
    >
      {children ? (
        children
      ) : (
        <>
          <span>Open Echo</span>
          <span className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none">
            →
          </span>
        </>
      )}
    </Link>
  );
}
