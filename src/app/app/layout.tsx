import type { Metadata } from "next";

// The workspace is a private, per-user app: keep it out of search results.
export const metadata: Metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
