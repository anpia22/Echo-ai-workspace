/**
 * Runs the legacy `scratch/test_*` scripts as Vitest test cases.
 *
 * Each script is a self-contained program that exits 0 on success. They are run as child
 * processes (via tsx) so they keep working unchanged, and they show up as individual tests
 * with the script's own output attached when one fails.
 *
 * Which scripts run is decided by tests/suite.config.ts (explicit list, see that file).
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXCLUDED, RUN } from "./suite.config";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = path.join(ROOT, "scratch");
const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const SCRIPT_TIMEOUT_MS = 150_000;
const MAX_OUTPUT_CHARS = 200_000;

/** Secrets the scripts must never depend on or leak; the suite has to pass without them. */
const STRIPPED_ENV = [
  "NVIDIA_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "ECHO_DEMO_MODE",
  "HEALTH_CHECK_TOKEN",
];

type ScriptResult = { code: number | null; timedOut: boolean; output: string };

function runScript(file: string): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const key of STRIPPED_ENV) delete env[key];

    const child = spawn(process.execPath, [TSX_CLI, path.join("scratch", file)], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    const collect = (chunk: Buffer) => {
      if (output.length < MAX_OUTPUT_CHARS) output += chunk.toString();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, SCRIPT_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, output });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: null, timedOut: false, output: String(error) });
    });
  });
}

function tail(output: string, lines = 40): string {
  return output.trimEnd().split("\n").slice(-lines).join("\n");
}

describe("suite configuration", () => {
  const onDisk = readdirSync(SCRATCH).filter((f) => /^test.*\.(ts|mjs)$/.test(f));

  it("classifies every scratch/test* script as run or excluded", () => {
    const known = new Set([...RUN, ...Object.keys(EXCLUDED)]);
    const unclassified = onDisk.filter((f) => !known.has(f));
    expect(
      unclassified,
      `Add these to RUN or EXCLUDED (with a reason) in tests/suite.config.ts:\n  ${unclassified.join("\n  ")}`
    ).toEqual([]);
  });

  it("lists only scripts that exist", () => {
    const missing = [...RUN, ...Object.keys(EXCLUDED)].filter((f) => !existsSync(path.join(SCRATCH, f)));
    expect(missing, `Listed in tests/suite.config.ts but missing from scratch/:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("never lists a script as both run and excluded", () => {
    const both = RUN.filter((f) => f in EXCLUDED);
    expect(both).toEqual([]);
  });

  it("gives every excluded script a reason", () => {
    const blank = Object.entries(EXCLUDED).filter(([, reason]) => reason.trim().length < 10);
    expect(blank.map(([file]) => file)).toEqual([]);
  });
});

describe("legacy scripts", () => {
  for (const file of RUN) {
    it.concurrent(file, async () => {
      const result = await runScript(file);
      if (result.timedOut) {
        throw new Error(`${file} timed out after ${SCRIPT_TIMEOUT_MS / 1000}s\n${tail(result.output)}`);
      }
      if (result.code !== 0) {
        throw new Error(`${file} exited with code ${result.code}\n${tail(result.output)}`);
      }
    });
  }
});
