import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildExplicitGraphEvidence,
  buildGraphContext,
  buildGraphInsightFacts,
  buildGraphRecommendationFacts,
  classifyGraphInsightIntent,
  formatExplicitGraphEvidence,
  formatGraphInsightFacts,
  formatGraphRecommendationFacts,
  isReadOnlyInsightRequest,
  isRecommendationIntent,
  logGraphContext,
  logGraphInsight,
  logGraphRecommendation,
} from "../../lib/graphContext";
import { parseGroupNodesAction, resolveGroupMemberIds } from "../../lib/groupNodesAction";
import { parseMoveNodeAction } from "../../lib/moveNodeAction";

const client = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY,
});

type CanvasNode = {
  id?: string;
  title?: string;
  nodeType?: string;
  description?: string;
  position?: {
    x: number;
    y: number;
  };
};

type CanvasEdge = {
  sourceId?: string;
  targetId?: string;
  sourceTitle?: string;
  targetTitle?: string;
  relationship?: string;
};

type CanvasGroup = {
  id?: string;
  title?: string;
  memberIds?: string[];
};

type CanvasState = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: CanvasGroup[];
};

type CanvasAction = {
  type?: string;

  nodeType?: string;
  title?: string;
  description?: string;

  sourceTitle?: string;
  targetTitle?: string;
  relationship?: string;

  nodeTitles?: string[];
  groupTitle?: string;

  position?: {
    x?: number;
    y?: number;
  };

  updates?: {
    title?: string;
    description?: string;
    nodeType?: string;
  };
};

// ==================================================
// HELPERS
// ==================================================

function normalizeCanvas(
  canvas: any
): CanvasState {
  const nodes: CanvasNode[] = Array.isArray(
    canvas?.nodes
  )
    ? canvas.nodes
    : [];

  const rawEdges: CanvasEdge[] = Array.isArray(
    canvas?.edges
  )
    ? canvas.edges
    : [];

  const edges = rawEdges.map((edge) => {
    const sourceTitle =
      edge.sourceTitle ||
      nodes.find(
        (node) => node.id === edge.sourceId
      )?.title;

    const targetTitle =
      edge.targetTitle ||
      nodes.find(
        (node) => node.id === edge.targetId
      )?.title;

    return {
      ...edge,
      sourceTitle,
      targetTitle,
    };
  });

  return {
    nodes,
    edges,
    groups: Array.isArray(canvas?.groups) ? canvas.groups : [],
  };
}

function nodeExists(
  canvas: CanvasState,
  title: string
): boolean {
  return canvas.nodes.some(
    (node) => node.title === title
  );
}

function edgeExists(
  canvas: CanvasState,
  sourceTitle: string,
  targetTitle: string,
  relationship?: string
): boolean {
  return canvas.edges.some((edge) => {
    if (
      edge.sourceTitle !== sourceTitle ||
      edge.targetTitle !== targetTitle
    ) {
      return false;
    }

    if (!relationship) {
      return true;
    }

    return (
      edge.relationship === relationship
    );
  });
}

// ==================================================
// SERVER-SIDE ACTION VALIDATION
// ==================================================

export function validateActions(
  canvas: CanvasState,
  actions: any[]
): CanvasAction[] {
  const validActions: CanvasAction[] = [];

  // We maintain a temporary representation of the
  // canvas while validating actions sequentially.
  //
  // This allows:
  //
  // CREATE_NODE
  // +
  // CREATE_EDGE
  //
  // in the SAME AI response.

  const tempNodes = [...canvas.nodes];
  const tempEdges = [...canvas.edges];
  const tempGroups = [...(canvas.groups ?? [])];

  for (const action of actions) {
    if (!action || typeof action !== "object") {
      continue;
    }

    // ==================================================
    // CREATE_NODE
    // ==================================================

    if (
      action.type === "CREATE_NODE"
    ) {
      if (
        !action.title ||
        typeof action.title !== "string"
      ) {
        continue;
      }

      const exists = tempNodes.some(
        (node) =>
          node.title === action.title
      );

      if (exists) {
        console.warn(
          "Rejected duplicate CREATE_NODE:",
          action
        );

        continue;
      }

      tempNodes.push({
        title: action.title,
        nodeType: action.nodeType,
        description: action.description,
      });

      validActions.push(action);

      continue;
    }

    // ==================================================
    // CREATE_EDGE
    // ==================================================

    if (
      action.type === "CREATE_EDGE"
    ) {
      if (
        !action.sourceTitle ||
        !action.targetTitle
      ) {
        continue;
      }

      const sourceExists =
        tempNodes.some(
          (node) =>
            node.title ===
            action.sourceTitle
        );

      const targetExists =
        tempNodes.some(
          (node) =>
            node.title ===
            action.targetTitle
        );

      if (
        !sourceExists ||
        !targetExists
      ) {
        console.warn(
          "Rejected CREATE_EDGE because node does not exist:",
          action
        );

        continue;
      }

      const exists =
        tempEdges.some(
          (edge) =>
            edge.sourceTitle ===
            action.sourceTitle &&
            edge.targetTitle ===
            action.targetTitle &&
            edge.relationship ===
            action.relationship
        );

      if (exists) {
        console.warn(
          "Rejected duplicate CREATE_EDGE:",
          action
        );

        continue;
      }

      tempEdges.push({
        sourceTitle:
          action.sourceTitle,
        targetTitle:
          action.targetTitle,
        relationship:
          action.relationship,
      });

      validActions.push(action);

      continue;
    }

    // ==================================================
    // UPDATE_NODE
    // ==================================================

    if (
      action.type === "UPDATE_NODE"
    ) {
      if (
        !action.targetTitle ||
        typeof action.targetTitle !==
        "string" ||
        !action.updates ||
        typeof action.updates !==
        "object"
      ) {
        continue;
      }

      const nodeIndex =
        tempNodes.findIndex(
          (node) =>
            node.title ===
            action.targetTitle
        );

      if (nodeIndex === -1) {
        console.warn(
          "Rejected UPDATE_NODE because target does not exist:",
          action
        );

        continue;
      }

      const oldTitle =
        action.targetTitle;

      const newTitle =
        action.updates.title ??
        oldTitle;

      // ----------------------------------------------
      // Prevent rename collision
      // ----------------------------------------------

      if (
        newTitle !== oldTitle &&
        tempNodes.some(
          (node) =>
            node.title === newTitle
        )
      ) {
        console.warn(
          "Rejected UPDATE_NODE because new title already exists:",
          action
        );

        continue;
      }

      // ----------------------------------------------
      // Update node
      // ----------------------------------------------

      tempNodes[nodeIndex] = {
        ...tempNodes[nodeIndex],

        title: newTitle,

        description:
          action.updates.description ??
          tempNodes[nodeIndex]
            .description,

        nodeType:
          action.updates.nodeType ??
          tempNodes[nodeIndex]
            .nodeType,
      };

      // ----------------------------------------------
      // Update edge references after rename
      // ----------------------------------------------

      if (newTitle !== oldTitle) {
        for (
          let i = 0;
          i < tempEdges.length;
          i++
        ) {
          if (
            tempEdges[i]
              .sourceTitle === oldTitle
          ) {
            tempEdges[i] = {
              ...tempEdges[i],
              sourceTitle: newTitle,
            };
          }

          if (
            tempEdges[i]
              .targetTitle === oldTitle
          ) {
            tempEdges[i] = {
              ...tempEdges[i],
              targetTitle: newTitle,
            };
          }
        }
      }

      validActions.push(action);

      continue;
    }

    // ==================================================
    // DELETE_NODE
    // ==================================================

    if (
      action.type === "DELETE_NODE"
    ) {
      if (
        !action.targetTitle ||
        typeof action.targetTitle !==
        "string"
      ) {
        continue;
      }

      const nodeIndex =
        tempNodes.findIndex(
          (node) =>
            node.title ===
            action.targetTitle
        );

      if (nodeIndex === -1) {
        console.warn(
          "Rejected DELETE_NODE because target does not exist:",
          action
        );

        continue;
      }

      const deletedTitle =
        action.targetTitle;

      // Remove node
      tempNodes.splice(
        nodeIndex,
        1
      );

      // Remove connected edges
      for (
        let i = tempEdges.length - 1;
        i >= 0;
        i--
      ) {
        if (
          tempEdges[i].sourceTitle ===
          deletedTitle ||
          tempEdges[i].targetTitle ===
          deletedTitle
        ) {
          tempEdges.splice(i, 1);
        }
      }

      validActions.push(action);

      continue;
    }

    // ==================================================
    // DELETE_EDGE
    // ==================================================

    if (
      action.type === "DELETE_EDGE"
    ) {
      if (
        !action.sourceTitle ||
        !action.targetTitle
      ) {
        continue;
      }

      const sourceExists =
        tempNodes.some(
          (node) =>
            node.title ===
            action.sourceTitle
        );

      const targetExists =
        tempNodes.some(
          (node) =>
            node.title ===
            action.targetTitle
        );

      if (
        !sourceExists ||
        !targetExists
      ) {
        console.warn(
          "Rejected DELETE_EDGE because node does not exist:",
          action
        );

        continue;
      }

      const edgeIndex =
        tempEdges.findIndex(
          (edge) => {
            if (
              edge.sourceTitle !==
              action.sourceTitle ||
              edge.targetTitle !==
              action.targetTitle
            ) {
              return false;
            }

            if (
              action.relationship
            ) {
              return (
                edge.relationship ===
                action.relationship
              );
            }

            return true;
          }
        );

      if (edgeIndex === -1) {
        console.warn(
          "Rejected DELETE_EDGE because edge does not exist:",
          action
        );

        continue;
      }

      tempEdges.splice(
        edgeIndex,
        1
      );

      validActions.push(action);

      continue;
    }

    // ==================================================
    // MOVE_NODE
    // ==================================================

    if (action.type === "MOVE_NODE") {
      const moveNode = parseMoveNodeAction(action);

      if (!moveNode) {
        console.warn(
          "Rejected malformed MOVE_NODE:",
          action
        );

        continue;
      }

      const targetExists = tempNodes.some(
        (node) => node.title === moveNode.targetTitle
      );

      if (!targetExists) {
        console.warn(
          "Rejected MOVE_NODE because target does not exist:",
          action
        );

        continue;
      }

      validActions.push(action);

      continue;
    }

    // ==================================================
    // GROUP_NODES
    // ==================================================

    if (action.type === "GROUP_NODES") {
      const groupNodes = parseGroupNodesAction(action);

      if (!groupNodes) {
        console.warn(
          "Rejected malformed GROUP_NODES:",
          action
        );

        continue;
      }

      const memberIds = resolveGroupMemberIds(
        tempNodes.filter(
          (node): node is { id: string; title: string } =>
            typeof node.id === "string" &&
            node.id.length > 0 &&
            typeof node.title === "string"
        ),
        groupNodes.nodeTitles
      );

      if (!memberIds) {
        console.warn(
          "Rejected GROUP_NODES because a title is missing or ambiguous:",
          action
        );

        continue;
      }

      const memberIdSet = new Set(memberIds);

      for (let index = tempGroups.length - 1; index >= 0; index -= 1) {
        const group = tempGroups[index];
        const remaining = (group.memberIds ?? []).filter(
          (memberId) => !memberIdSet.has(memberId)
        );

        if (remaining.length === 0) {
          tempGroups.splice(index, 1);
          continue;
        }

        tempGroups[index] = {
          ...group,
          memberIds: remaining,
        };
      }

      tempGroups.push({
        title: groupNodes.groupTitle,
        memberIds,
      });

      validActions.push(action);

      continue;
    }

    // ==================================================
    // UNKNOWN ACTION
    // ==================================================

    console.warn(
      "Rejected unknown canvas action:",
      action
    );
  }

  return validActions;
}

function logMultiStepReasoning(
  transcript: string,
  candidateActions: unknown,
  validatedActions: unknown
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log("=== ECHO MULTI-STEP REASONING ===");
  console.log("User intent:", transcript);
  console.log(
    "Candidate actions:",
    JSON.stringify(candidateActions, null, 2)
  );
  console.log(
    "Validated actions:",
    JSON.stringify(validatedActions, null, 2)
  );
  console.log("=================================");
}

function stripPrivateReasoningFields(parsed: Record<string, unknown>) {
  delete parsed.chain_of_thought;
  delete parsed.internal_reasoning;
  delete parsed.private_reasoning;
}

// ==================================================
// POST
// ==================================================

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const transcript =
      body.transcript;

    const currentCanvas =
      normalizeCanvas(
        body.currentCanvas
      );

    const conversationHistory =
      Array.isArray(
        body.conversationHistory
      )
        ? body.conversationHistory
        : [];

    const graphContext =
      buildGraphContext(
        currentCanvas.nodes,
        currentCanvas.edges
      );

    logGraphContext(graphContext);

    const explicitGraphEvidence = buildExplicitGraphEvidence(
      graphContext
    );
    const explicitGraphSummary = formatExplicitGraphEvidence(
      explicitGraphEvidence
    );
    const graphInsightFacts = buildGraphInsightFacts(graphContext);
    const graphInsightSummary = formatGraphInsightFacts(graphInsightFacts);
    const graphRecommendationFacts = buildGraphRecommendationFacts(
      graphContext,
      graphInsightFacts
    );
    const graphRecommendationSummary = formatGraphRecommendationFacts(
      graphRecommendationFacts
    );
    const graphInsightIntent = classifyGraphInsightIntent(
      typeof transcript === "string" ? transcript : ""
    );

    if (
      !transcript ||
      typeof transcript !==
      "string"
    ) {
      return NextResponse.json(
        {
          error:
            "Transcript is required",
        },
        {
          status: 400,
        }
      );
    }

    // ==================================================
    // AI REQUEST
    // ==================================================

    const aiStart = Date.now();

    console.log("🚀 Sending request to NVIDIA...");

    const completion =
      await client.chat.completions.create(
        {
          model:
            "nvidia/nemotron-3-ultra-550b-a55b",

          messages: [
            {
              role: "system",
              content: `You are Echo, a conversational AI collaborative workspace partner, not a command executor.
Understand natural conversation. Modify the canvas only when meaningful. Answer casual or read-only questions with conversational text and "actions": []. Never create a node just because an idea is mentioned unless intent warrants capturing it.

## ACTION SCHEMA
Supported actions (Return ONLY these valid actions in a JSON array):
- CREATE_NODE: {"type": "CREATE_NODE", "nodeType": "problem|solution|decision|task|question|idea", "title": "string", "description": "string"}
- CREATE_EDGE: {"type": "CREATE_EDGE", "sourceTitle": "existing title", "targetTitle": "existing title", "relationship": "causes|solves|supports|requires|depends on|decided by|related to"}
- UPDATE_NODE: {"type": "UPDATE_NODE", "targetTitle": "existing title", "updates": {"title": "optional", "description": "optional", "nodeType": "optional"}}
- DELETE_NODE: {"type": "DELETE_NODE", "targetTitle": "existing title"}
- DELETE_EDGE: {"type": "DELETE_EDGE", "sourceTitle": "existing title", "targetTitle": "existing title", "relationship": "existing relationship"}
- MOVE_NODE: {"type": "MOVE_NODE", "targetTitle": "existing title", "position": {"x": 0, "y": 0}}
- GROUP_NODES: {"type": "GROUP_NODES", "nodeTitles": ["existing title"], "groupTitle": "string"}

## CANVAS SOURCE OF TRUTH
CURRENT CANVAS GRAPH is authoritative. Before creating, check if it exists. Do NOT duplicate. Reuse existing nodes via exact titles. Use UPDATE_NODE, MOVE_NODE, DELETE_NODE, CREATE_EDGE, GROUP_NODES. Only CREATE_NODE for genuinely new concepts. Do not invent node IDs.
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
- "Group the root causes together" -> GROUP_NODES
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
Keep message concise. If no canvas mutation, actions must be empty.`,
            },

            {
              role: "user",

              content: `RECENT CONVERSATION:

${JSON.stringify(
                conversationHistory,
                null,
                2
              )}

CURRENT CANVAS GRAPH:

${JSON.stringify(
                graphContext,
                null,
                2
              )}

${explicitGraphSummary}

${graphInsightSummary}

${graphRecommendationSummary}

CURRENT USER MESSAGE:

${transcript}

Use the conversation history and CURRENT CANVAS GRAPH as context.

Understand the user's message naturally.

Do not assume that the user is giving a command.

Determine what the user means in the context of the ongoing conversation.

A single request may need multiple actions. Generate only the
minimum actions, in dependency order (CREATE_NODE before any
CREATE_EDGE that uses that new title). Prefer existing nodes.
Do not duplicate existing titles.
If the user asks to add a solution without naming it, or
confirms a prior recommendation with "do that" / "go ahead"
when one target is clear, invent a concise solution from
context and emit CREATE_NODE plus the needed CREATE_EDGE.
Do not ask them to name the solution first.
If several recommended targets are still equally valid,
ask which one and return "actions": [].

If the user asks a reasoning, insight, or recommendation
question about the workspace (main problems, causes,
solutions, unresolved items, workspace summary, evidence,
ranking, what to do next, what to focus on, coverage gaps,
or similar), inspect CURRENT CANVAS GRAPH, EXPLICIT
RELATIONSHIPS, GRAPH INSIGHT FACTS, and GRAPH
RECOMMENDATION FACTS first. Answer from those facts only.
Return "actions": [] unless they explicitly ask to modify
the canvas. Do not invent ranking, causality, solutions,
impact, or priority. Recommendations must stay
recommendations. If there is not enough evidence, say so
and return "actions": [].

If the message introduces meaningful information that belongs on the
workspace, create or update the appropriate canvas elements.

If the message is only conversational, respond naturally and return:

"actions": []

When referring to existing canvas nodes or edges, always use
their exact titles from CURRENT CANVAS GRAPH.

When resolving words such as "this", "that", "it", "this problem",
"that problem", "this solution", "that solution", "this decision",
"that relationship", "the previous problem", or similar references,
use both RECENT CONVERSATION and CURRENT CANVAS GRAPH.

Prefer the most recently discussed relevant object of that type.
Do not invent titles. Do not recreate deleted nodes.
Do not create a new node when the user is referring to an
existing canvas concept.
Do not invent relationships that are not explicit edges.

If a reference is genuinely ambiguous, ask a natural
clarification question and return:

"actions": []

If the user is revising, replacing, correcting, or renaming an
existing canvas concept, use UPDATE_NODE. Do not DELETE then CREATE.

If the user wants a concept removed entirely, use DELETE_NODE.

Return ONLY valid JSON.`,
            },
          ],

          temperature: 0.2,
          top_p: 0.7,
          max_tokens: 900,
          reasoning_effort: "none",
        }
      );

    console.log(
      "⏱️ NVIDIA response time:",
      ((Date.now() - aiStart) / 1000).toFixed(2),
      "seconds"
    );

    // ==================================================
    // READ AI RESPONSE
    // ==================================================

    const content =
      completion.choices[0]?.message
        ?.content;

    if (!content) {
      throw new Error(
        "Empty AI response"
      );
    }

    console.log(
      "RAW AI RESPONSE:",
      content
    );

    let parsed: any;

    try {
      parsed = JSON.parse(
        content
      );
    } catch {
      console.error(
        "Invalid AI JSON:",
        content
      );

      return NextResponse.json(
        {
          error:
            "AI returned invalid JSON",
          raw: content,
        },
        {
          status: 500,
        }
      );
    }

    // ==================================================
    // BASIC RESPONSE VALIDATION
    // ==================================================

    if (
      typeof parsed.message !==
      "string"
    ) {
      parsed.message =
        "Echo processed your request.";
    }

    if (
      !Array.isArray(
        parsed.actions
      )
    ) {
      parsed.actions = [];
    }

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      stripPrivateReasoningFields(parsed);
    }

    // ==================================================
    // SERVER-SIDE ACTION VALIDATION
    // ==================================================

    const validatedActions =
      validateActions(
        currentCanvas,
        parsed.actions
      );

    const readOnlyInsight = isReadOnlyInsightRequest(
      transcript
    );
    const insightActions = readOnlyInsight
      ? []
      : validatedActions;

    if (
      readOnlyInsight &&
      validatedActions.length > 0
    ) {
      console.warn(
        "Stripped canvas actions from read-only insight request"
      );
    }

    logGraphInsight(
      graphInsightIntent,
      graphInsightFacts,
      insightActions
    );

    if (isRecommendationIntent(graphInsightIntent)) {
      logGraphRecommendation(
        graphInsightIntent,
        graphRecommendationFacts,
        insightActions
      );
    }

    logMultiStepReasoning(
      transcript,
      parsed.actions,
      insightActions
    );

    console.log(
      "AI ACTIONS:",
      JSON.stringify(
        parsed.actions,
        null,
        2
      )
    );

    console.log(
      "VALIDATED ACTIONS:",
      JSON.stringify(
        insightActions,
        null,
        2
      )
    );

    parsed.actions =
      insightActions;

    // ==================================================
    // RETURN
    // ==================================================

    return NextResponse.json(
      parsed
    );
  } catch (error: any) {
    console.error("❌ AI analysis error:", error);

    return NextResponse.json(
      {
        error: "Failed to analyze transcript",
        message:
          error?.message ||
          error?.error?.message ||
          "Unknown server error",
        name: error?.name,
        status: error?.status,
      },
      {
        status: 500,
      }
    );
  }
}