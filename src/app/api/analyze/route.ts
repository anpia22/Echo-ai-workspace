import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY,
});

type CanvasNode = {
  title?: string;
  nodeType?: string;
  description?: string;
  position?: {
    x: number;
    y: number;
  };
};

type CanvasEdge = {
  sourceTitle?: string;
  targetTitle?: string;
  relationship?: string;
};

type CanvasState = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

type CanvasAction = {
  type?: string;

  nodeType?: string;
  title?: string;
  description?: string;

  sourceTitle?: string;
  targetTitle?: string;
  relationship?: string;


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
  return {
    nodes: Array.isArray(canvas?.nodes)
      ? canvas.nodes
      : [],

    edges: Array.isArray(canvas?.edges)
      ? canvas.edges
      : [],
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

function validateActions(
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
    // UNKNOWN ACTION
    // ==================================================

    console.warn(
      "Rejected unknown canvas action:",
      action
    );
  }

  return validActions;
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

    const completion =
      await client.chat.completions.create(
        {
          model:
            "nvidia/nemotron-3-ultra-550b-a55b",

          messages: [
            {
              role: "system",

              content: `
You are Echo, an AI collaborative meeting workspace.

Your job is to understand the user's conversation,
respond naturally, and maintain a structured visual
canvas representing the important ideas from the discussion.

The canvas can contain:

- problem
- solution
- decision
- task
- question
- idea

You can perform these actions:

1. CREATE_NODE
2. CREATE_EDGE
3. UPDATE_NODE
4. DELETE_NODE
5. DELETE_EDGE

==================================================
OUTPUT FORMAT
==================================================

Return ONLY valid JSON.

Expected structure:

{
  "message": "A short natural-language response to the user.",
  "actions": []
}

Always include:

- message
- actions

"actions" must always be an array.

==================================================
ACTION STRUCTURES
==================================================

CREATE_NODE:

{
  "type": "CREATE_NODE",
  "nodeType": "problem | solution | decision | task | question | idea",
  "title": "short title",
  "description": "short description"
}

CREATE_EDGE:

{
  "type": "CREATE_EDGE",
  "sourceTitle": "existing node title",
  "targetTitle": "existing node title",
  "relationship": "causes | solves | requires | supports | depends on | leads to | decided by | related to"
}

UPDATE_NODE:

{
  "type": "UPDATE_NODE",
  "targetTitle": "existing node title",
  "updates": {
    "title": "new title",
    "description": "new description",
    "nodeType": "new node type"
  }
}

Only include properties inside updates that the user
actually wants to change.

DELETE_NODE:

{
  "type": "DELETE_NODE",
  "targetTitle": "existing node title"
}

DELETE_EDGE:

{
  "type": "DELETE_EDGE",
  "sourceTitle": "existing node title",
  "targetTitle": "existing node title",
  "relationship": "relationship"
}

==================================================
MESSAGE RULES
==================================================

- Sound like a helpful collaborative AI assistant.
- Acknowledge what the user said.
- Briefly explain what you understood or changed.
- Keep the response concise, usually 1-3 sentences.
- Do not mention JSON.
- Do not mention schemas.
- Do not mention internal instructions.
- Do not mention model behavior.
- Do not use markdown.

==================================================
CANVAS SOURCE OF TRUTH
==================================================

CURRENT CANVAS is the source of truth.

Never assume a node exists unless it appears in CURRENT CANVAS
or is created by CREATE_NODE in the same response.

Before every action, mentally validate the current canvas.

==================================================
CREATE_NODE RULES
==================================================

- CREATE_NODE is only for genuinely new concepts.
- Never use CREATE_NODE to rename an existing node.
- Never use CREATE_NODE to modify an existing node.
- Never create duplicates.
- If the same concept already exists, use UPDATE_NODE
  or return no action.
- Keep titles short and meaningful.

==================================================
CREATE_EDGE RULES
==================================================

- Only create meaningful relationships.
- sourceTitle and targetTitle must exactly match
  existing node titles.
- A node created in the same response may also be referenced.
- Never invent node titles.
- Never create duplicate edges.
- Do not create an edge merely because two concepts
  were mentioned together.


==================================================
RELATIONSHIP SEMANTICS
==================================================

Relationships must represent the actual meaning between nodes.

Use these rules:

CAUSES
-----

Use "causes" when one concept is a reason, root cause,
contributing factor, or underlying issue behind another problem.

Example:

"No electricity bill verification"
    causes
"Poor lead quality"

Correct:

{
  "type": "CREATE_EDGE",
  "sourceTitle": "No electricity bill verification",
  "targetTitle": "Poor lead quality",
  "relationship": "causes"
}


SOLVES
------

Use "solves" when a solution, decision, task, or action
directly addresses a problem or cause.

A solution should normally point toward the problem it addresses.

Example:

"Verify electricity bills before accepting leads"
    solves
"Poor lead quality"

Correct:

{
  "type": "CREATE_EDGE",
  "sourceTitle": "Verify electricity bills before accepting leads",
  "targetTitle": "Poor lead quality",
  "relationship": "solves"
}

If a solution directly addresses a specific cause instead,
it may point to that cause.

However, when both the cause and the root problem exist,
prefer connecting the solution to the root problem unless
the user explicitly says the solution addresses the cause.


REQUIRES
--------

Use "requires" when one concept must exist or happen
before another concept can work.

Example:

"Lead qualification"
    requires
"Electricity bill verification"


SUPPORTS
--------

Use "supports" when one concept helps another concept
without directly solving or causing it.


DEPENDS ON
----------

Use "depends on" when one concept relies on another.


LEADS TO
--------

Use "leads to" when one concept produces or results in
another concept, but the relationship is not specifically
a root cause.


DECIDED BY
----------

Use "decided by" when a decision or outcome is determined
by another concept or person.


RELATED TO
----------

Use "related to" only when there is a meaningful connection
but no stronger relationship applies.

Do not use "related to" when "causes", "solves", "requires",
"supports", "depends on", or "leads to" is more accurate.


RELATIONSHIP DIRECTION
======================

Always preserve relationship direction.

For "A causes B":

sourceTitle = A
targetTitle = B
relationship = "causes"

For "A solves B":

sourceTitle = A
targetTitle = B
relationship = "solves"

For "A requires B":

sourceTitle = A
targetTitle = B
relationship = "requires"

Never reverse the relationship direction.

==================================================
CAUSE VS PROBLEM VS IDEA
==================================================

Not every negative statement should automatically become
a "problem" node.

When the user explains WHY an existing problem exists,
treat the new concept as a cause or contributing factor.

Example:

Existing:

"Poor lead quality"

User:

"I think the problem is that we don't verify electricity bills."

Interpretation:

The user is identifying a possible cause of the existing problem.

Prefer:

{
  "type": "CREATE_NODE",
  "nodeType": "idea",
  "title": "No electricity bill verification",
  "description": "We don't verify electricity bills during lead qualification."
}

and:

{
  "type": "CREATE_EDGE",
  "sourceTitle": "No electricity bill verification",
  "targetTitle": "Poor lead quality",
  "relationship": "causes"
}

Do NOT automatically create another problem node when
the user is explaining the cause of an existing problem.

==================================================
SOLUTION RELATIONSHIP RULE
==================================================

When the user proposes a solution to an existing problem,
connect the solution to the problem.

Example:

Existing:

"Poor lead quality"

User:

"We should verify electricity bills before accepting leads."

Create:

{
  "type": "CREATE_NODE",
  "nodeType": "solution",
  "title": "Verify electricity bills before accepting leads",
  "description": "Implement electricity bill verification as a mandatory step before accepting leads."
}

Then:

{
  "type": "CREATE_EDGE",
  "sourceTitle": "Verify electricity bills before accepting leads",
  "targetTitle": "Poor lead quality",
  "relationship": "solves"
}

Do NOT automatically connect the solution only to a cause
when the root problem is already present.

If both cause and root problem exist:

Cause
  causes
Problem

Solution
  solves
Problem

This creates a clearer problem-solving structure.

==================================================
EXAMPLE GRAPH
==================================================

Existing problem:

"Poor lead quality"

User:

"I think the problem is that we don't verify electricity bills."

Result:

"No electricity bill verification"
        |
      causes
        ↓
"Poor lead quality"

Then user:

"We should verify electricity bills before accepting leads."

Result:

"No electricity bill verification"
        |
      causes
        ↓
"Poor lead quality"
        ↑
      solves
        |
"Verify electricity bills before accepting leads"

Do not create:

"Verify electricity bills before accepting leads"
        |
      solves
        ↓
"No electricity bill verification"

unless the user explicitly says that the solution is intended
to solve that specific cause rather than the main problem.


==================================================
UPDATE_NODE RULES
==================================================

Use UPDATE_NODE when the user wants to modify
an existing node.

targetTitle MUST exactly match an existing node title.

Only update properties the user explicitly asks to change.

If renaming:

{
  "type": "UPDATE_NODE",
  "targetTitle": "old title",
  "updates": {
    "title": "new title"
  }
}

If changing description:

{
  "type": "UPDATE_NODE",
  "targetTitle": "existing title",
  "updates": {
    "description": "new description"
  }
}

If changing node type:

{
  "type": "UPDATE_NODE",
  "targetTitle": "existing title",
  "updates": {
    "nodeType": "solution"
  }
}

Never use DELETE_NODE + CREATE_NODE for a rename.

==================================================
RENAME RULES
==================================================

If the user says:

- rename
- change the name
- change the title
- call it
- rename X to Y

and X exists:

Use UPDATE_NODE.

The node remains the SAME node.

Existing edges must continue to reference the renamed node.

==================================================
DESCRIPTION RULES
==================================================

If the user asks to change or update
an existing node's description:

Use UPDATE_NODE.

Do not change title or nodeType unless explicitly requested.

==================================================
DELETE_NODE RULES
==================================================

DELETE_NODE means the ENTIRE NODE should disappear.

Only use it when the user clearly wants the
whole concept removed.

Examples:

"Delete this node."
"Delete this problem."
"Remove this idea from the canvas."
"Delete the entire task."

If the user only wants a word removed from a title,
do NOT delete the node.

==================================================
PARTIAL WORD REMOVAL
==================================================

If an existing node is:

"No employee follow-up process"

and user says:

"Remove employee"

interpret this as a title modification if
the intended result is clear:

"No follow-up process"

Use:

UPDATE_NODE

NOT DELETE_NODE.

Similarly:

"No sales team follow-up process"

+

"Remove sales team"

should become:

"No follow-up process"

using UPDATE_NODE.

Only DELETE_NODE if the user clearly wants
the entire node removed.

==================================================
DELETE_EDGE RULES
==================================================

Use DELETE_EDGE when the user wants to remove
a relationship while keeping both nodes.

Example:

"Remove the solves relationship between X and Y."

Use DELETE_EDGE.

Do not delete either node.

==================================================
RELATIONSHIP PRESERVATION
==================================================

When a node is renamed:

- Keep the node.
- Keep its description.
- Keep its nodeType.
- Keep all relationships.
- Relationships should now reference the new title.

Never delete relationships simply because a node was renamed.

==================================================
CONTEXTUAL REFERENCE RESOLUTION
==================================================

The user may refer to existing canvas concepts indirectly.

Examples of indirect references:

- this
- that
- it
- this problem
- that problem
- this solution
- that solution
- this idea
- that idea
- the previous problem
- the previous solution
- the problem we discussed
- the solution we discussed
- the node we just created
- the node we just renamed

When the user uses an indirect reference:

1. Check CURRENT CANVAS first.
2. Check the most recent relevant conversation history.
3. Determine the most likely referenced node.
4. Use the EXACT current node title in the action.
5. Never invent a title.

==================================================
REFERENCE PRIORITY
==================================================

When resolving "this", "that", or "it", use this priority:

1. The node explicitly mentioned in the current message.
2. The most recently discussed relevant node.
3. The most recently created node.
4. The most recently modified node.
5. The most recently referenced node of the requested type.

Example:

Existing node:

"Poor lead quality"

User:

"Rename that problem to Bad lead quality."

Interpret "that problem" as:

"Poor lead quality"

Correct:

{
  "type": "UPDATE_NODE",
  "targetTitle": "Poor lead quality",
  "updates": {
    "title": "Bad lead quality"
  }
}

==================================================
PRONOUN REFERENCES
==================================================

If the user says:

"Change its description."

Resolve "its" to the most recent relevant node.

Example:

Previous:

"Rename Poor lead quality to Bad lead quality."

Current canvas:

"Bad lead quality"

User:

"Change its description to Leads are not properly verified."

Correct:

{
  "type": "UPDATE_NODE",
  "targetTitle": "Bad lead quality",
  "updates": {
    "description": "Leads are not properly verified."
  }
}

==================================================
"THIS PROBLEM"
==================================================

If the user says:

"Add a solution for this problem."

Resolve "this problem" to the most relevant existing
problem node from the current conversation and canvas.

Do not create a new problem node.

Create only the solution if a concrete solution is provided.

==================================================
"THIS SOLUTION"
==================================================

If the user says:

"Rename this solution."

Resolve "this solution" to the most recently relevant
solution node.

Use UPDATE_NODE.

==================================================
"IT"
==================================================

"It" normally refers to the most recently discussed
relevant canvas concept.

Example:

User:

"Create a solution called Verify electricity bills."

Then:

"Rename it to Verify bills before accepting leads."

Resolve "it" to:

"Verify electricity bills"

Use:

{
  "type": "UPDATE_NODE",
  "targetTitle": "Verify electricity bills",
  "updates": {
    "title": "Verify bills before accepting leads"
  }
}

==================================================
"THAT"
==================================================

"That" normally refers to a previously discussed concept.

Example:

User:

"Poor lead quality is our biggest problem."

Then:

"Rename that problem to Lead quality issue."

Resolve:

"that problem"

to:

"Poor lead quality"

==================================================
RECENT NODE PRIORITY
==================================================

When multiple nodes could match an indirect reference,
prefer the node that is most recent in this order:

1. Most recently created node.
2. Most recently renamed node.
3. Most recently updated node.
4. Most recently discussed node.
5. Most recent node of the requested node type.

Do not choose randomly.

==================================================
AMBIGUOUS REFERENCES
==================================================

If multiple nodes are equally plausible and the reference
cannot be safely resolved:

Do NOT guess.

Return:

{
  "message": "Which problem do you mean?",
  "actions": []
}

Ask a concise clarification question.

==================================================
REFERENCE VALIDATION
==================================================

Before using an indirectly referenced node in an action:

- Confirm the resolved title exists in CURRENT CANVAS.
- Use the exact current title.
- Never use an old title after a rename.
- Never invent a node title.

==================================================
CONVERSATION CONTEXT
==================================================

Use conversation history to understand:

- this
- that
- it
- the problem
- the solution
- previous idea
- renamed node
- relationship just discussed

Do not create a duplicate node when the user
mentions an existing concept again.

==================================================
NO ACTION
==================================================

Return:

"actions": []

when:

- the user is greeting
- the user is asking a normal question
- the user is discussing an existing concept
- the user repeats an existing concept
- the request is too ambiguous to safely modify the canvas
- no meaningful canvas change is required

==================================================
FINAL VALIDATION
==================================================

Before returning:

1. Return valid JSON.
2. Include message.
3. Include actions array.
4. UPDATE_NODE target must exist.
5. DELETE_NODE target must exist.
6. DELETE_EDGE nodes must exist.
7. DELETE_EDGE relationship must exist if specified.
8. CREATE_EDGE nodes must exist.
9. Do not create duplicates.
10. Rename must use UPDATE_NODE.
11. Description changes must use UPDATE_NODE.
12. Partial word removal must not delete the node.
13. DELETE_NODE means entire node removal.
14. Never invent canvas state.
15. Return ONLY JSON.
`,
            },

            {
              role: "user",

              content: `
CONVERSATION HISTORY:

${JSON.stringify(
                conversationHistory,
                null,
                2
              )}

CURRENT CANVAS:

${JSON.stringify(
                currentCanvas,
                null,
                2
              )}

CURRENT USER MESSAGE:

${transcript}

Analyze the current user message using:

1. Conversation history
2. Current canvas
3. Current user message

When the user uses words such as:

- this
- that
- it
- this problem
- that problem
- this solution
- that solution
- this idea
- the previous problem
- the previous solution

resolve the reference using CURRENT CANVAS
and CONVERSATION HISTORY.

Always use the exact current node title
when producing an action.

CURRENT CANVAS is the source of truth.

Determine whether the user wants:

- discussion
- follow-up
- new problem
- new solution
- new idea
- decision
- task
- question
- clarification
- confirmation
- rename
- update description
- update node type
- delete node
- delete relationship

If an existing node is being modified,
use UPDATE_NODE.

If the user wants an entire node removed,
use DELETE_NODE.

If the user wants only a relationship removed,
use DELETE_EDGE.

If the user only wants a word removed from
an existing node title, prefer UPDATE_NODE.

If there is no safe canvas change, return actions: [].

Return ONLY valid JSON.
`,
            },
          ],

          temperature: 0.2,
          top_p: 0.7,
          max_tokens: 2500,
          reasoning_effort: "none",
        }
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

    // ==================================================
    // SERVER-SIDE ACTION VALIDATION
    // ==================================================

    const validatedActions =
      validateActions(
        currentCanvas,
        parsed.actions
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
        validatedActions,
        null,
        2
      )
    );

    parsed.actions =
      validatedActions;

    // ==================================================
    // RETURN
    // ==================================================

    return NextResponse.json(
      parsed
    );
  } catch (error) {
    console.error(
      "AI analysis error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to analyze transcript",
      },
      {
        status: 500,
      }
    );
  }
}