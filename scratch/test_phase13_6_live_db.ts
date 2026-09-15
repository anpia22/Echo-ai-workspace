/**
 * Phase 13.6 — Live Database Verification Suite
 *
 * Tests against live PostgreSQL / Supabase instance:
 * 1. Workspace creation & membership
 * 2. Conversation creation via ConversationRepository
 * 3. Concurrent message appends with atomic sequence verification (no duplicate sequence)
 * 4. User and assistant message persistence
 * 5. Message idempotency (same ID + same payload returns existing record)
 * 6. Conflict rejection (same ID + different payload raises CONFLICT)
 * 7. Cross-workspace tenancy isolation (cannot read or write across workspaces)
 * 8. Hydration zero-write guarantee
 * 9. Chronological message ordering
 */

import { getServerSupabaseClient } from "../src/app/lib/persistence/server/db";
import { ConversationRepository } from "../src/app/lib/persistence/repositories/conversationRepository";
import { WorkspaceRepository } from "../src/app/lib/persistence/repositories/workspaceRepository";
import { createActor } from "../src/app/lib/persistence/server/auth";
import { PersistenceError } from "../src/app/lib/persistence/server/errors";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[Live DB Assertion Failed] ${msg}`);
  }
}

async function runLiveDbTests() {
  console.log("=================================================================");
  console.log("PHASE 13.6 — Live Database Verification");
  console.log("=================================================================\n");

  const supabase = getServerSupabaseClient();
  const convRepo = new ConversationRepository(supabase);
  const wsRepo = new WorkspaceRepository(supabase);

  const testWsIdA = "66666666-6666-6666-6666-666666666661";
  const testWsIdB = "66666666-6666-6666-6666-666666666662";
  const testUserIdA = "user-13-6-alice";
  const testUserIdB = "user-13-6-bob";
  const actorA = createActor(testUserIdA);
  const actorB = createActor(testUserIdB);

  try {
    // 0. Cleanup prior test artifacts
    await supabase.from("workspaces").delete().in("id", [testWsIdA, testWsIdB]);
    console.log("✔ Pre-cleanup complete\n");

    // 1. Create Workspace A
    console.log("1. Creating Workspace A...");
    await wsRepo.createWorkspace(actorA, {
      id: testWsIdA,
      title: "Phase 13.6 Workspace A",
    });
    console.log("✔ Workspace A created");

    // 2. Create Workspace B (for cross-workspace isolation tests)
    console.log("2. Creating Workspace B...");
    await wsRepo.createWorkspace(actorB, {
      id: testWsIdB,
      title: "Phase 13.6 Workspace B",
    });
    console.log("✔ Workspace B created");

    // 3. Create Conversation in Workspace A
    console.log("3. Creating conversation in Workspace A...");
    const convId = "77777777-7777-7777-7777-777777777771";
    const createConvRes = await convRepo.createConversation(actorA, {
      id: convId,
      workspaceId: testWsIdA,
      title: "General Discussion",
      metadata: { department: "engineering" },
    });
    assert(createConvRes.conversation.id === convId, "Conversation ID preserved");
    assert(createConvRes.conversation.workspaceId === testWsIdA, "WorkspaceId matched");
    assert(createConvRes.conversation.title === "General Discussion", "Title matched");
    console.log("✔ Conversation created in Workspace A");

    // 4. Concurrent message appends with atomic sequence verification
    console.log("4. Testing concurrent message appends (atomic sequence)...");
    const [msgRes1, msgRes2] = await Promise.all([
      convRepo.appendMessage(actorA, {
        workspaceId: testWsIdA,
        conversationId: convId,
        role: "user",
        content: "Message 1: concurrent test",
      }),
      convRepo.appendMessage(actorA, {
        workspaceId: testWsIdA,
        conversationId: convId,
        role: "user",
        content: "Message 2: concurrent test",
      }),
    ]);

    const seq1 = msgRes1.message.sequence;
    const seq2 = msgRes2.message.sequence;
    assert(typeof seq1 === "number" && typeof seq2 === "number", "Sequences are numbers");
    assert(seq1 !== seq2, `Sequences must NOT be equal! Got ${seq1} and ${seq2}`);
    assert(
      (seq1 === 1 && seq2 === 2) || (seq1 === 2 && seq2 === 1),
      `Expected sequences 1 and 2, got ${seq1} and ${seq2}`
    );
    console.log(`✔ Concurrent messages serialized atomically with distinct sequences (${seq1}, ${seq2})`);

    // 5. Append assistant message
    console.log("5. Appending assistant response message...");
    const msgIdAssistant = "88888888-8888-8888-8888-888888888881";
    const assistantRes = await convRepo.appendMessage(actorA, {
      id: msgIdAssistant,
      workspaceId: testWsIdA,
      conversationId: convId,
      role: "assistant",
      content: "Echo generated analysis based on your query.",
    });
    assert(assistantRes.message.sequence === 3, `Expected sequence 3, got ${assistantRes.message.sequence}`);
    assert(assistantRes.message.role === "assistant", "Role is assistant");
    console.log("✔ Assistant message appended with sequence 3");

    // 6. Message Idempotency: exact duplicate ID & payload
    console.log("6. Testing exact duplicate append (idempotent hit)...");
    const dupRes = await convRepo.appendMessage(actorA, {
      id: msgIdAssistant,
      workspaceId: testWsIdA,
      conversationId: convId,
      role: "assistant",
      content: "Echo generated analysis based on your query.",
    });
    assert(dupRes.message.id === msgIdAssistant, "Same ID returned");
    assert(dupRes.message.sequence === 3, "Sequence unchanged on idempotent hit");
    // Verify messages count did not increase in database
    const { count: countAfterDup } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", convId);
    assert(countAfterDup === 3, `Expected 3 total messages, got ${countAfterDup}`);
    console.log("✔ Idempotent duplicate handled cleanly; no duplicate row created");

    // 7. Conflicting Duplicate ID Rejection
    console.log("7. Testing conflicting duplicate message ID...");
    let conflictCaught = false;
    try {
      await convRepo.appendMessage(actorA, {
        id: msgIdAssistant,
        workspaceId: testWsIdA,
        conversationId: convId,
        role: "assistant",
        content: "DIFFERENT CONTENT WITH SAME ID",
      });
    } catch (err) {
      conflictCaught = (err as PersistenceError).code === "CONFLICT";
    }
    assert(conflictCaught, "Conflicting duplicate threw CONFLICT error");
    console.log("✔ Conflicting message ID strictly rejected as CONFLICT");

    // 8. Cross-Workspace Security: Workspace B cannot access Workspace A's conversation
    console.log("8. Testing cross-workspace security isolation...");
    let crossWsAppendFailed = false;
    try {
      // User B trying to append to Workspace A's conversation under Workspace B
      await convRepo.appendMessage(actorB, {
        workspaceId: testWsIdB,
        conversationId: convId, // Belonging to Workspace A
        role: "user",
        content: "Infiltrating message",
      });
    } catch (err) {
      crossWsAppendFailed = (err as PersistenceError).code === "NOT_FOUND";
    }
    assert(crossWsAppendFailed, "Cross-workspace append correctly rejected as NOT_FOUND");

    let crossWsListFailed = false;
    try {
      // User B trying to list messages of Workspace A's conversation under Workspace B
      await convRepo.listMessages(actorB, testWsIdB, convId);
    } catch (err) {
      crossWsListFailed = (err as PersistenceError).code === "NOT_FOUND";
    }
    assert(crossWsListFailed, "Cross-workspace listMessages correctly rejected as NOT_FOUND");
    console.log("✔ Cross-workspace read and write access strictly blocked");

    // 9. Chronological listMessages verification
    console.log("9. Verifying chronological message listing...");
    const messages = await convRepo.listMessages(actorA, testWsIdA, convId);
    assert(messages.length === 3, `Expected 3 messages, got ${messages.length}`);
    assert(messages[0].sequence === 1, "First message has sequence 1");
    assert(messages[1].sequence === 2, "Second message has sequence 2");
    assert(messages[2].sequence === 3, "Third message has sequence 3");
    console.log("✔ Messages returned in exact chronological sequence (1, 2, 3)");

    // 10. Hydration Zero-Write Verification
    console.log("10. Testing hydration zero-write guarantee...");
    const hydrationBefore = await wsRepo.loadWorkspace(actorA, testWsIdA);
    assert(hydrationBefore.conversations.length === 1, "Hydrated 1 conversation");
    assert(hydrationBefore.activeConversationMessages.length === 3, "Hydrated 3 active messages");

    const { count: finalMsgCount } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", convId);
    assert(finalMsgCount === 3, "Message count unchanged after hydration");
    console.log("✔ Hydration read-only verification passed: zero database mutations");

  } finally {
    // Cleanup
    console.log("11. Cleaning up test workspaces...");
    await supabase.from("workspaces").delete().in("id", [testWsIdA, testWsIdB]);
    console.log("✔ Cleanup complete");
  }

  console.log("\n=================================================================");
  console.log("PHASE 13.6 — LIVE DATABASE VERIFICATION: ALL PASS ✅");
  console.log("=================================================================\n");
}

runLiveDbTests().catch((err) => {
  console.error("\n❌ LIVE DB TEST FAILED:", err);
  process.exit(1);
});
