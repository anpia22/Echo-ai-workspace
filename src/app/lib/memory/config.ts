/**
 * P2.1 semantic memory: fixed settings. The vector size must match the database column
 * (`memory_chunks.embedding`, vector(1024)). Changing the model or size means re-embedding every
 * row and a schema change, which is why the model name is stored on every row.
 */
export const MEMORY_EMBEDDING_MODEL = "nvidia/nemotron-3.5-embed-1b";
export const MEMORY_EMBEDDING_DIMENSIONS = 1024;
export const MEMORY_EMBEDDINGS_URL = "https://integrate.api.nvidia.com/v1/embeddings";

/** Texts sent to the embedding API in one request. */
export const MEMORY_BATCH_SIZE = 16;
/** Most sources one save may index (a larger batch is cut; the backfill handles the rest). */
export const MEMORY_MAX_SOURCES_PER_RUN = 64;
/** Stored text is cut to this length (the database accepts up to 8000). */
export const MEMORY_MAX_TEXT_CHARS = 6000;
/** Texts shorter than this carry no useful meaning ("ok", "thanks") and are not indexed. */
export const MEMORY_MIN_TEXT_CHARS = 12;

/** Indexing is off when there is no key, or when MEMORY_INDEXING_DISABLED=true. */
export function isMemoryIndexingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if ((env.MEMORY_INDEXING_DISABLED ?? "").toLowerCase() === "true") return false;
  const key = env.NVIDIA_API_KEY;
  return typeof key === "string" && key.length > 0 && key !== "mock-nvidia-key";
}
