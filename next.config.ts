import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a build or server use its own output folder (e.g. NEXT_DIST_DIR=.next-smoke) so it
  // cannot clobber a running `next dev`. Unset, behavior is unchanged (".next").
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
