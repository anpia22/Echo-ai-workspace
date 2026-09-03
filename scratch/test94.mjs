import fs from 'fs';
import OpenAI from 'openai';

const envContent = fs.readFileSync('.env.local', 'utf8');
const key = envContent.split('\\n').find(l => l.startsWith('NVIDIA_API_KEY=')).split('=')[1].trim();
process.env.NVIDIA_API_KEY = key;

const client = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY,
});

const systemPrompt = `You are Echo, a conversational AI collaborative workspace partner, not a command executor.
Understand natural conversation. Modify the canvas only when meaningful. Answer casual or read-only questions with conversational text and "actions": []. Never create a node just because an idea is mentioned unless intent warrants capturing it.

## ACTION SCHEMA
Supported actions (Return ONLY these valid actions in a JSON array):
- CREATE_NODE: {"type": "CREATE_NODE", "nodeType": "problem|solution|decision|task|question|idea", "title": "string", "description": "string"}
- CREATE_EDGE: {"type": "CREATE_EDGE", "sourceTitle": "existing title", "targetTitle": "existing title", "relationship": "causes|solves|supports|requires|depends on|decided by|related to"}
- UPDATE_NODE: {"type": "UPDATE_NODE", "targetTitle": "existing title", "updates": {"title": "optional", "description": "optional", "nodeType": "optional"}}
- DELETE_NODE: {"type": "DELETE_NODE", "targetTitle": "existing title"}
- DELETE_EDGE: {"type": "DELETE_EDGE", "sourceTitle": "existing title", "targetTitle": "existing title", "relationship": "existing relationship"}
- MOVE_NODE: {"type": "MOVE_NODE", "targetTitle": "existing title", "position": {"x": 0, "y": 0}}

## CANVAS SOURCE OF TRUTH
CURRENT CANVAS GRAPH is authoritative. Before creating, check if it exists. Do NOT duplicate. Reuse existing nodes via exact titles. Use UPDATE_NODE, MOVE_NODE, DELETE_NODE, CREATE_EDGE. Only CREATE_NODE for genuinely new concepts. Do not invent node IDs.
Types: problem (issue/negative), solution (remedy), decision (explicit choice), task (actionable work), question (unresolved), idea (proposed). Only create meaningful information.

## REFERENCE RESOLUTION
Resolve "it", "this", "that", "this problem", "another cause", "rename it", "move it", "that relationship" using exact existing canvas titles/edges and recent conversation. Prefer the most recent relevant entity. Relationship references (e.g. "that relationship") use the most recently discussed existing edge. If ambiguous, ask a concise question and return "actions": []. Never guess between multiple plausible nodes.
Prefer UPDATE_NODE over CREATE_NODE for revising existing nodes (e.g. "Rename X to Y").

## GRAPH REASONING & INSIGHTS
For read-only questions ("What's unresolved?", "focus next?", "causes?"), do not mutate the canvas. Use ONLY provided graph facts. Do not invent impact, priority, severity, metrics, business outcomes, or unsupported causes/relationships. If evidence lacks, say so. Read-only reasoning MUST return "actions": [].

## CAUSAL SIBLING RULE
When the user says "another cause" (or similar), interpret it as another peer cause of the SAME target problem, NOT a cause of the cause, unless explicitly stated.

## MULTI-ACTION ORDER
Break multi-step requests into minimum required actions. Execute in dependency order (e.g., CREATE_NODE before CREATE_EDGE that uses it). The newly created node must be referenced by its exact generated title in the subsequent edge. No intermediate nodes/edges unless requested.

## EXISTING CANVAS SAFETY
Never duplicate existing nodes, invent existing titles/IDs, link to nonexistent nodes, self-link, or delete edges without exact relationships. When modifying, preserve identity conceptually (use UPDATE_NODE).

## NATURAL-LANGUAGE INTENT
Interpret semantically, not by strict keywords.
- "Move X to the right" -> MOVE_NODE
- "Rename X to Y" -> UPDATE_NODE
- "Remove that relationship" -> DELETE_EDGE
- "Add a solution for X and connect it" -> CREATE_NODE + CREATE_EDGE
- "That makes sense" -> conversational response + actions: []

## RESPONSE FORMAT
Return ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "message": "short conversational response",
  "actions": []
}
Keep message concise. If no canvas mutation, actions must be empty.`;

const scenarios = [
  {
    id: "E1",
    userPrompt: `RECENT CONVERSATION:\n[]\nCURRENT CANVAS GRAPH:\n{"nodes": [], "edges": []}\nEXPLICIT RELATIONSHIPS:\nNone\nGRAPH INSIGHT FACTS:\nNone\nGRAPH RECOMMENDATION FACTS:\nNone\nMULTI-HOP FACTS:\nNone\nCURRENT USER MESSAGE:\nSales performance is getting worse.`
  },
  {
    id: "E2",
    userPrompt: `RECENT CONVERSATION:\n[{"role": "user", "content": "Sales performance is getting worse."},{"role": "assistant", "content": "Got it. I've added 'Sales performance is getting worse' as a problem on the canvas."}]\nCURRENT CANVAS GRAPH:\n{"nodes": [{"title": "Sales performance is getting worse", "nodeType": "problem"}], "edges": []}\nEXPLICIT RELATIONSHIPS:\nNone\nGRAPH INSIGHT FACTS:\nNone\nGRAPH RECOMMENDATION FACTS:\nNone\nMULTI-HOP FACTS:\nNone\nCURRENT USER MESSAGE:\nPoor lead quality is one reason.`
  },
  {
    id: "E4",
    userPrompt: `RECENT CONVERSATION:\n[]\nCURRENT CANVAS GRAPH:\n{"nodes": [{"title": "Sales performance is getting worse", "nodeType": "problem"}, {"title": "Poor lead quality", "nodeType": "problem"}, {"title": "Weak lead verification", "nodeType": "problem"}], "edges": [{"sourceTitle": "Poor lead quality", "targetTitle": "Sales performance is getting worse", "relationship": "causes"}, {"sourceTitle": "Weak lead verification", "targetTitle": "Sales performance is getting worse", "relationship": "causes"}]}\nEXPLICIT RELATIONSHIPS:\nPoor lead quality causes Sales performance is getting worse\nWeak lead verification causes Sales performance is getting worse\nGRAPH INSIGHT FACTS:\nNone\nGRAPH RECOMMENDATION FACTS:\nNone\nMULTI-HOP FACTS:\nNone\nCURRENT USER MESSAGE:\nMove Weak lead verification to the right.`
  },
  {
    id: "E5",
    userPrompt: `RECENT CONVERSATION:\n[]\nCURRENT CANVAS GRAPH:\n{"nodes": [{"title": "Weak lead verification", "nodeType": "problem"}], "edges": []}\nEXPLICIT RELATIONSHIPS:\nNone\nGRAPH INSIGHT FACTS:\nNone\nGRAPH RECOMMENDATION FACTS:\nNone\nMULTI-HOP FACTS:\nNone\nCURRENT USER MESSAGE:\nRename Weak lead verification to Weak verification.`
  },
  {
    id: "E8",
    userPrompt: `RECENT CONVERSATION:\n[]\nCURRENT CANVAS GRAPH:\n{"nodes": [{"title": "Poor lead quality", "nodeType": "problem"}], "edges": []}\nEXPLICIT RELATIONSHIPS:\nNone\nGRAPH INSIGHT FACTS:\nNone\nGRAPH RECOMMENDATION FACTS:\nNone\nMULTI-HOP FACTS:\nNone\nCURRENT USER MESSAGE:\nWhat's unresolved?`
  }
];

const delay = ms => new Promise(res => setTimeout(res, ms));

async function callNvidia(userPrompt, streamReq) {
  const start = Date.now();
  let firstTokenTime = null;
  let fullContent = "";
  
  try {
    const res = await client.chat.completions.create({
      model: "nvidia/nemotron-3-ultra-550b-a55b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 900,
      stream: streamReq,
    });

    if (streamReq) {
      for await (const chunk of res) {
        if (!firstTokenTime) {
          firstTokenTime = Date.now() - start;
        }
        fullContent += chunk.choices[0]?.delta?.content || "";
      }
    } else {
      fullContent = res.choices[0]?.message?.content || "";
      firstTokenTime = Date.now() - start;
    }
  } catch(e) {
    return { error: e.message };
  }
  
  const totalTime = Date.now() - start;
  return { TTFT: firstTokenTime, totalTime, content: fullContent };
}

async function runTest() {
  console.log("=== NON-STREAMING TEST ===");
  const nonStreamStats = [];
  for(let i=0; i<5; i++) {
    for (const s of scenarios) {
      await delay(3500);
      const res = await callNvidia(s.userPrompt, false);
      if (res.error) {
        console.log("Error on " + s.id + ": " + res.error);
        continue;
      }
      nonStreamStats.push({ id: s.id, ...res });
      console.log("Non-Stream Run " + (i+1) + " " + s.id + " -> TTFT: " + res.TTFT + "ms, Total: " + res.totalTime + "ms");
    }
  }

  console.log("\\n=== STREAMING TEST ===");
  const streamStats = [];
  for(let i=0; i<5; i++) {
    for (const s of scenarios) {
      await delay(3500);
      const res = await callNvidia(s.userPrompt, true);
      if (res.error) {
        console.log("Error on " + s.id + ": " + res.error);
        continue;
      }
      streamStats.push({ id: s.id, ...res });
      let actions = "Parse Error";
      try {
        const parsed = JSON.parse(res.content);
        actions = JSON.stringify(parsed.actions.map(a => a.type));
      } catch(e) {}
      console.log("Stream Run " + (i+1) + " " + s.id + " -> TTFT: " + res.TTFT + "ms, Total: " + res.totalTime + "ms | Actions: " + actions);
    }
  }

  // Summary
  const nsTTFT = nonStreamStats.map(x => x.TTFT).sort((a,b)=>a-b);
  const nsTotal = nonStreamStats.map(x => x.totalTime).sort((a,b)=>a-b);
  
  const sTTFT = streamStats.map(x => x.TTFT).sort((a,b)=>a-b);
  const sTotal = streamStats.map(x => x.totalTime).sort((a,b)=>a-b);
  
  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const p50 = arr => arr.length ? arr[Math.floor(arr.length/2)] : 0;

  console.log("\\n=== RESULTS ===");
  console.log("Non-Streaming (Runs: " + nonStreamStats.length + "):");
  console.log("  TTFT p50: " + p50(nsTTFT) + "ms | Mean: " + avg(nsTTFT).toFixed(2) + "ms");
  console.log("  Total p50: " + p50(nsTotal) + "ms | Mean: " + avg(nsTotal).toFixed(2) + "ms");
  
  console.log("\\nStreaming (Runs: " + streamStats.length + "):");
  console.log("  TTFT p50: " + p50(sTTFT) + "ms | Mean: " + avg(sTTFT).toFixed(2) + "ms");
  console.log("  Total p50: " + p50(sTotal) + "ms | Mean: " + avg(sTotal).toFixed(2) + "ms");
}

runTest();
