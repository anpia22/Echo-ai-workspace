import { NextResponse } from "next/server";
import { PersistenceError } from "../persistence/server/errors";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export function errorResponse(error: unknown, fallback: string) {
  if (error instanceof PersistenceError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.toHttpStatus() }
    );
  }
  // Do not echo internal error text to the browser.
  console.error(`[invites] ${fallback}`, error instanceof Error ? error.message : error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: fallback } }, { status: 500 });
}

export function validationError(message: string) {
  return NextResponse.json({ error: { code: "VALIDATION_ERROR", message } }, { status: 400 });
}

/** Returns the parsed JSON body ({} when empty), or null when the body is not valid JSON. */
export async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    const text = await request.text();
    return text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    return null;
  }
}
