// Probe NVIDIA embeddings endpoint: which models work, vector size, latency.
const key = process.env.NVIDIA_API_KEY;
if (!key) { console.log("no NVIDIA_API_KEY"); process.exit(1); }
const models = ["nvidia/nemotron-3.5-embed-1b", "nvidia/nemotron-3.5-embed-8b", "nvidia/llama-3.2-nv-embedqa-1b-v1", "nvidia/nv-embedqa-mistral-7b-v2", "snowflake/arctic-embed-l", "nvidia/embed-qa-4"];
for (const model of models) {
  const t = Date.now();
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: ["We decided to use Postgres for storage"], input_type: "passage", encoding_format: "float", truncate: "END" }),
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let dims = null; try { dims = JSON.parse(text).data?.[0]?.embedding?.length; } catch {}
    console.log(model, res.status, "dims=" + dims, (Date.now() - t) + "ms", dims ? "" : text.slice(0, 160));
  } catch (e) { console.log(model, "error", String(e).slice(0, 100)); }
}
