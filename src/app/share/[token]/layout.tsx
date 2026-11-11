import type { Metadata } from "next";

// A public link is a secret URL: never indexed, and the token never leaks through the Referer header.
export const metadata: Metadata = {
  title: "Shared workspace",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
