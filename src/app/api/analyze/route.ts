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
    const currentCanvas = body.currentCanvas || [];

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

- Only create a node when the conversation contains a meaningful new idea.
- Before creating a node, check the existing canvas.
- Do not create duplicate nodes.
- If the conversation refers to an existing idea, use CREATE_EDGE instead when a meaningful relationship exists.
- CREATE_EDGE sourceTitle and targetTitle must match existing canvas node titles.
- Keep titles short.
- Keep descriptions concise.
- Relationships should be meaningful, such as:
  "solves"
  "causes"
  "supports"
  "depends on"
  "decided by"
  "related to"
- Do not create random relationships.
- Do not create a node just because the user asks a general question.
- If the user is simply asking for clarification or continuing discussion,
  return an empty actions array when no canvas change is appropriate.

IMPORTANT:

- Return ONLY valid JSON.
- Do not wrap the JSON in markdown.
- Always include both "message" and "actions".
- "actions" must always be an array.
`,
        },
        {
          role: "user",
          content: `
CURRENT CANVAS:

${JSON.stringify(currentCanvas, null, 2)}

USER MESSAGE:

${transcript}

Analyze the user's message in the context of the existing canvas.

Decide whether the canvas should change.

Then provide:
1. A concise natural-language response.
2. Any necessary canvas actions.
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