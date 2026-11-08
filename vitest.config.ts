import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Legacy scripts run as child processes (about 3-5 s each); allow headroom on slow CI machines.
    testTimeout: 180_000,
    hookTimeout: 60_000,
    maxConcurrency: 4,
  },
});
