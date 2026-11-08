/**
 * P0.3 — Structured logging with redaction (server-side).
 *
 * One JSON line per event in production, so log search/alerting works:
 *   {"ts":"2026-11-08T10:00:00.000Z","level":"info","event":"ai.request.finished","route":"analyze",...}
 *
 * Safety rules enforced here, not left to each call site:
 *  - values under sensitive keys (token, password, email, transcript, prompt, content, ...) are replaced
 *  - long strings are truncated, large arrays/objects/depth are bounded
 *  - Error objects are reduced to name + truncated message + a few stack lines
 *
 * LOG_LEVEL (debug | info | warn | error) controls verbosity; default "info".
 *
 * Error tracking: call reportError(); it logs a structured error event and forwards to any
 * reporter registered with setErrorReporter() — the seam where Sentry (or similar) plugs in
 * once an account/DSN exists. No third-party service is required for this to work.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY =
  /^(token|access_?token|refresh_?token|id_?token|secret|client_?secret|password|passwd|authorization|cookie|set-cookie|api_?key|service_?role_?key|email|transcript|prompt|content|text|body|raw)$/i;

const MAX_STRING = 300;
const MAX_ARRAY = 20;
const MAX_KEYS = 40;
const MAX_DEPTH = 4;

export const REDACTED = "[redacted]";

function truncate(value: string): string {
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[+${value.length - MAX_STRING}]` : value;
}

function serializeError(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: truncate(error.message),
    stack: error.stack?.split("\n").slice(0, 5).map((l) => l.trim()).join(" | "),
  };
}

/** Returns a copy of `value` that is safe to log. Exported for tests. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Error) return serializeError(value);
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1));
    if (value.length > MAX_ARRAY) items.push(`[+${value.length - MAX_ARRAY} more]`);
    return items;
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (count++ >= MAX_KEYS) {
        out["[truncated]"] = true;
        break;
      }
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }

  return String(value);
}

export type LogSink = (level: LogLevel, line: string, record: Record<string, unknown>) => void;
export type ErrorReporter = (error: unknown, context: Record<string, unknown>) => void;

export type LoggerOptions = {
  level?: LogLevel;
  /** JSON lines when true; readable "[event] {...}" lines otherwise. */
  json?: boolean;
  now?: () => number;
  sink?: LogSink;
};

function parseLevel(raw: string | undefined): LogLevel {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "debug" || v === "info" || v === "warn" || v === "error" ? v : "info";
}

const consoleSink: LogSink = (level, line) => {
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(line);
};

export function createLogger(options: LoggerOptions = {}) {
  const minLevel = options.level ?? parseLevel(process.env.LOG_LEVEL);
  const json = options.json ?? process.env.NODE_ENV === "production";
  const now = options.now ?? Date.now;
  const sink = options.sink ?? consoleSink;
  const reporters: ErrorReporter[] = [];

  function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const safe = (redact(fields) as Record<string, unknown>) ?? {};
    const record = { ts: new Date(now()).toISOString(), level, event, ...safe };
    const line = json ? JSON.stringify(record) : `[${level}] ${event} ${Object.keys(safe).length ? JSON.stringify(safe) : ""}`.trimEnd();
    try {
      sink(level, line, record);
    } catch {
      // Logging must never break a request.
    }
  }

  return {
    debug: (event: string, fields?: Record<string, unknown>) => log("debug", event, fields),
    info: (event: string, fields?: Record<string, unknown>) => log("info", event, fields),
    warn: (event: string, fields?: Record<string, unknown>) => log("warn", event, fields),
    error: (event: string, fields?: Record<string, unknown>) => log("error", event, fields),

    /** Logs a structured error event and forwards it to registered reporters (e.g. Sentry). */
    reportError(error: unknown, context: Record<string, unknown> = {}): void {
      log("error", "error.reported", { ...context, error });
      for (const reporter of reporters) {
        try {
          reporter(error, redact(context) as Record<string, unknown>);
        } catch {
          // A failing reporter must not take the request down.
        }
      }
    },

    setErrorReporter(reporter: ErrorReporter): void {
      reporters.push(reporter);
    },
  };
}

export const logger = createLogger();
