/**
 * P1.4 — Retry button wiring in the app page. The page is a large React component, so these
 * are structural checks that lock in the rules: a retry reuses the failed user message
 * (no duplicate in the chat or the database), only retryable failures offer it, and a
 * normal send can never be mistaken for a retry.
 *
 * Run: npx tsx scratch/test_p1_4_retry_ui.ts
 */

import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const page = readFileSync(new URL("../src/app/app/page.tsx", import.meta.url), "utf8");
const fn = page.slice(page.indexOf("const analyzeTranscript = async"), page.indexOf("const sortedConversations"));

console.log("retry flag");
check("only an explicit { retry: true } counts as a retry", /options\?\.retry === true/.test(fn));
check("the send button calls it without arguments (no click event leaks in)", /onClick=\{\(\) => void analyzeTranscript\(\)\}/.test(page) && !/onClick=\{analyzeTranscript\}/.test(page));
check("a retry can run with an empty input box", /!isRetry && !transcript\.trim\(\)/.test(fn));

console.log("no duplicate message");
check("retry reuses the failed message object", /failed\s*\?\s*failed\.message/.test(fn));
check("retry does not append the user message again", /if \(!failed\) \{\s*setMessages/.test(fn));
check("retry does not save the user message again", /if \(!failed\) \{\s*persistMessage\(/.test(fn));
check("retry does not add the message to the AI history twice", /\(failed\s*\?\s*messages\s*:\s*\[\.\.\.messages, newUserMessage\]/.test(fn));

console.log("when a retry is offered");
check("only failures the server marks retryable are stored for retry", /const canRetry = data\?\.retryable === true/.test(fn) && /lastFailedRef\.current = canRetry/.test(fn));
check("network failures are retryable", /catch \(error\)[\s\S]*lastFailedRef\.current = \{[\s\S]*retryable: true/.test(fn));
check("a new normal send clears any pending retry", /\} else \{\s*lastFailedRef\.current = null;/.test(fn));
check("success clears it", /lastFailedRef\.current = null;\s*\/\/ After a retry/.test(fn));
check("retry is refused if the open conversation or workspace changed", /failed\.conversationId !== requestConversationId/.test(fn) && /failed\.workspaceId !== requestWorkspaceId/.test(fn));
check("a successful retry does not wipe text typed since", /transcript\.trim\(\) === userMessage/.test(fn));

console.log("button");
check("Retry button appears only on retryable errors and never for viewers", /voiceFeedback\.kind === "error" && voiceFeedback\.retryable && !isViewOnly/.test(page));
check("button calls analyzeTranscript with retry", /analyzeTranscript\(\{ retry: true \}\)/.test(page));
check("button is testable", /data-testid="retry-ai"/.test(page));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
