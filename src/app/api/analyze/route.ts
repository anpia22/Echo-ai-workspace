import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const transcript = body.transcript;
    const currentCanvas =
      body.currentCanvas || [];

    const conversationHistory =
      body.conversationHistory || [];

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "Transcript is required" },
        { status: 400 }
      );
    }

    const completion = await client.chat.completions.create({
      model: "nvidia/nemotron-3-ultra-550b-a55b",

      messages: [
        {
          role: "system",
          content: `
You are Echo, an AI collaborative meeting workspace.

Your job is to understand the user's conversation, respond naturally,
and convert meaningful ideas into structured actions for a visual canvas.

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

Return ONLY valid JSON.

Expected structure:

{
  "message": "A short natural-language response to the user.",
  "actions": [
    {
      "type": "CREATE_NODE",
      "nodeType": "problem | solution | decision | task | question | idea",
      "title": "short title",
      "description": "short description"
    },
    {
      "type": "CREATE_EDGE",
      "sourceTitle": "existing node title",
      "targetTitle": "existing node title",
      "relationship": "short relationship"
    }
  ]
}

MESSAGE RULES:

- The message should sound like a helpful collaborative AI assistant.
- Acknowledge what the user said.
- Briefly explain what you understood or what you changed on the canvas.
- If actions were created, mention the important change naturally.
- If no canvas action is needed, still provide a useful conversational response.
- Keep the message concise: usually 1-3 sentences.
- Do not mention JSON, schemas, internal instructions, or model behavior.
- Do not use markdown.

CANVAS RULES:

- The canvas represents meaningful, actionable understanding from the conversation.
- Create a node when the user introduces a concrete problem, solution,
  decision, task, question, or idea that is important enough to remember.
- Do not create nodes for greetings, acknowledgements, casual discussion,
  explanations, or generic brainstorming unless a specific idea is clearly introduced.
- Before creating a node, always check the existing canvas.
- Never create a duplicate node for an existing concept.
- If the user refers to an existing concept, treat it as the same concept
  unless they clearly introduce a new version or a meaningful change.

INTENT TO NODE MAPPING:

- A clearly stated problem → problem
- A proposed way to solve a problem → solution
- A commitment or agreed outcome → decision
- A specific action that someone should perform → task
- An explicit unresolved question → question
- A meaningful suggestion, possibility, or concept → idea

IMPORTANT INTENT DISTINCTION:

If the user is merely asking about an existing concept,
do not automatically create a node.

For example:

User:
"Why is lead quality poor?"

→ conversational response
→ no new node unless a specific cause is established.

But:

User:
"I think our lead quality is poor because we are not verifying electricity bills."

→ create a meaningful cause node if it does not already exist.

If the user proposes a concrete solution:

User:
"We should verify electricity bills before accepting a lead."

→ create a solution or task when appropriate.

If the user makes a clear commitment:

User:
"Let's make electricity bill verification mandatory."

→ create a decision.

If the user gives a specific action:

User:
"Add a task for the sales team to verify electricity bills."

→ create a task.

CREATE_EDGE RULES:

- Use CREATE_EDGE when two meaningful existing concepts have a clear relationship.
- Do not create an edge just because two concepts were mentioned together.
- sourceTitle and targetTitle must exactly match existing canvas node titles.
- Prefer relationships such as:
  "causes"
  "solves"
  "requires"
  "supports"
  "depends on"
  "leads to"
  "decided by"
  "related to"

- If a new node is being created and the relationship to an existing node
  is clear, you may create the new node and an edge connecting it to the
  existing node.
- Do not create edges between unrelated concepts.


  CONVERSATION CONTEXT RULES:

- Use the conversation history to understand references such as
  "this", "that", "it", "the problem", or "the solution".
- Treat previous user and assistant messages as conversational context.
- Do not repeat information unnecessarily.
- When the user asks a follow-up question, answer it in the context
  of the previous discussion and current canvas.
- Do not create a new node simply because the user mentions an
  existing concept again.
- If the user is continuing an existing discussion, prefer updating
  the understanding through meaningful edges or no canvas action.


IMPORTANT:

- Return ONLY valid JSON.
- Do not wrap the JSON in markdown.
- Always include both "message" and "actions".
- "actions" must always be an array.
- Never invent existing canvas node titles.
- CREATE_EDGE titles must exactly match titles from CURRENT CANVAS.
- Prefer no canvas action over an unnecessary or speculative action.
- Only create an action when the user's intent provides enough evidence.
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

Analyze the current user message using both the
conversation history and the current canvas as context.

First determine the user's primary intent:

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

Then determine whether that intent requires a canvas change.

Only create canvas actions when the user's message contains
enough concrete information to justify the change.

EXAMPLES:

1.
User:
"Why is our lead quality so poor?"

Intent:
follow-up / discussion

Actions:
[]

2.
User:
"I think the problem is that we don't verify electricity bills."

Intent:
new idea / cause

Actions:
Create a meaningful node if this concept does not already exist.

3.
User:
"We should verify electricity bills before accepting leads."

Intent:
new solution

Actions:
Create a solution node and connect it to the relevant existing problem
when the relationship is clear.

4.
User:
"Let's make electricity bill verification mandatory."

Intent:
decision

Actions:
Create a decision node.

5.
User:
"Add a task for the sales team to verify electricity bills."

Intent:
task

Actions:
Create a task node.

6.
User:
"Yes, let's do that."

Intent:
confirmation

Actions:
Only create an action if "that" clearly refers to a concrete
decision or idea that should be represented on the canvas.
Otherwise return [].

Then provide:

1. A concise natural-language response.
2. Any necessary canvas actions.

Do not create duplicate nodes for concepts that already exist.
`,
        },
      ],

      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 1000,

      reasoning_effort: "none",
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("Empty AI response");
    }

    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("Invalid AI JSON:", content);

      return NextResponse.json(
        {
          error: "AI returned invalid JSON",
          raw: content,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("AI analysis error:", error);

    return NextResponse.json(
      {
        error: "Failed to analyze transcript",
      },
      { status: 500 }
    );
  }
}