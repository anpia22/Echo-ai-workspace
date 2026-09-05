export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    try {
      return await nextResolve("next/server.js", context);
    } catch {
      // fallback
    }
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (!specifier.endsWith(".ts") && !specifier.endsWith(".js") && !specifier.endsWith(".mjs") && !specifier.endsWith(".json")) {
      try {
        return await nextResolve(specifier + ".ts", context);
      } catch {
        // fallback
      }
    }
  }
  return nextResolve(specifier, context);
}
