/**
 * P2.1: NVIDIA embeddings client. Server only. Retries transient failures (429, 5xx, network,
 * timeouts) with backoff; never retries a request that can never succeed (400, 401, 403, 404, 410).
 */
import {
  MEMORY_BATCH_SIZE,
  MEMORY_EMBEDDING_DIMENSIONS,
  MEMORY_EMBEDDING_MODEL,
  MEMORY_EMBEDDINGS_URL,
} from "./config";

export type EmbeddingInputType = "passage" | "query";

export class EmbeddingError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = "EmbeddingError";
    this.retryable = retryable;
    this.status = status;
  }
}

export type EmbeddingDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  apiKey?: string;
  timeoutMs?: number;
  maxAttempts?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function embedBatch(texts: string[], inputType: EmbeddingInputType, deps: EmbeddingDeps): Promise<number[][]> {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const apiKey = deps.apiKey ?? process.env.NVIDIA_API_KEY;
  const maxAttempts = deps.maxAttempts ?? 4;
  const timeoutMs = deps.timeoutMs ?? 20_000;
  if (!apiKey) throw new EmbeddingError("NVIDIA_API_KEY is not configured", false);

  let lastError: EmbeddingError = new EmbeddingError("Embedding request failed", true);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await doFetch(MEMORY_EMBEDDINGS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MEMORY_EMBEDDING_MODEL,
          input: texts,
          input_type: inputType,
          encoding_format: "float",
          truncate: "END",
          dimensions: MEMORY_EMBEDDING_DIMENSIONS,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ embedding?: number[]; index?: number }> };
        const data = Array.isArray(json.data) ? [...json.data] : [];
        data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        if (data.length !== texts.length) {
          throw new EmbeddingError(`Expected ${texts.length} embeddings, got ${data.length}`, false, res.status);
        }
        return data.map((d) => {
          const v = d.embedding;
          if (!Array.isArray(v) || v.length !== MEMORY_EMBEDDING_DIMENSIONS || v.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
            throw new EmbeddingError(`Embedding has the wrong shape (expected ${MEMORY_EMBEDDING_DIMENSIONS} numbers)`, false, res.status);
          }
          return v;
        });
      }
      const retryable = isTransientStatus(res.status);
      lastError = new EmbeddingError(`Embedding API returned ${res.status}`, retryable, res.status);
      if (!retryable) throw lastError;
      const retryAfter = Number(res.headers.get("retry-after"));
      if (attempt < maxAttempts) {
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : Math.min(1000 * 2 ** (attempt - 1), 8000));
      }
    } catch (error) {
      if (error instanceof EmbeddingError && !error.retryable) throw error;
      lastError = error instanceof EmbeddingError ? error : new EmbeddingError("Embedding request failed (network or timeout)", true);
      if (attempt < maxAttempts) await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
    }
  }
  throw lastError;
}

/** Embeds texts in batches, keeping the order. Throws EmbeddingError if any batch finally fails. */
export async function embedTexts(texts: string[], inputType: EmbeddingInputType, deps: EmbeddingDeps = {}): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += MEMORY_BATCH_SIZE) {
    out.push(...(await embedBatch(texts.slice(i, i + MEMORY_BATCH_SIZE), inputType, deps)));
  }
  return out;
}
