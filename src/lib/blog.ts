export type BlogSection = {
  heading: string;
  paragraphs: string[];
};

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  publishedAt: string;
  readingMinutes: number;
  keywords: string[];
  image: string;
  imageAlt: string;
  sections: BlogSection[];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "ai-workspace-for-live-meetings",
    title: "Why an AI Workspace Belongs Inside the Meeting",
    description:
      "An AI workspace for live meetings keeps conversation, decisions, and a visual canvas in one room so the team does not lose the thread after the call.",
    excerpt:
      "Most meetings still split the work: a call in one tab, notes in another, and an AI chat that never saw the room. An AI workspace keeps the meeting and the thinking together.",
    publishedAt: "2026-10-07",
    readingMinutes: 6,
    keywords: [
      "AI workspace",
      "live meeting",
      "collaborative AI",
      "meeting workspace",
      "real-time collaboration",
    ],
    image: "/blog/ai-workspace-meeting.jpg",
    imageAlt:
      "A glass workspace canvas of connected cards with a small video meeting of three people docked in the corner.",
    sections: [
      {
        heading: "The meeting ends. The workspace should not.",
        paragraphs: [
          "A live meeting is where a team actually decides. Someone frames the problem, someone else pushes back, and a third person sketches the option everyone can live with. Then the call ends, and that reasoning is scattered across a chat transcript, a slide deck, and a private AI thread that nobody else can open.",
          "An AI workspace treats the meeting as part of the work, not a break from it. Echo is built as one collaborative workspace: you talk through a problem, the canvas holds the structure, and the people in the room see the same graph. The conversation does not have to be retyped into a document afterward.",
        ],
      },
      {
        heading: "What an AI meeting workspace actually holds",
        paragraphs: [
          "A useful meeting workspace has three layers that stay linked. First is dialogue: ask a question in natural language and get reasoning you can challenge. Second is a visual canvas of nodes, edges, and groups, so a decision is a map instead of a paragraph. Third is the live room itself — presence, shared cursors, and an audio and video meeting docked over that canvas.",
          "Those layers matter because meetings fail in the gaps. If the AI only sees a pasted prompt, it misses what the room already agreed. If the canvas is a separate whiteboard, the call and the map drift apart. A collaborative AI workspace feeds the current canvas back into the conversation, so the next question is about this meeting, not a blank chat.",
        ],
      },
      {
        heading: "How teams use it during the call",
        paragraphs: [
          "Start the meeting inside the workspace and keep the canvas visible. Explore the problem as questions and relationships. When the discussion turns sequential — owners, dependencies, order of work — plan those as connected nodes. When two options are on the table, put the trade-offs where everyone can point at them.",
          "Voice input helps when hands are already on the canvas. Real-time collaboration means a teammate can follow the presenter, see remote cursors, and join from a room link without exporting a snapshot. The meeting stays a working session.",
        ],
      },
      {
        heading: "What to look for before you switch tools",
        paragraphs: [
          "Ask whether the AI can see the workspace the team is editing, whether the meeting can start without leaving that workspace, and whether the result is still there when the call ends. If any of those answers is no, you still have three products and one meeting.",
          "Echo is the AI workspace that thinks with you: conversation, canvas, and live meeting in the same room. If you want the shape of that flow, start with how Echo works, then open a workspace and run the meeting where the thinking already lives.",
        ],
      },
    ],
  },
  {
    slug: "screen-presence-collaborative-meetings",
    title: "Screen Presence in Collaborative Meetings",
    description:
      "Screen presence in a collaborative meeting means the room can see the presenter, the shared screen, and the same AI workspace — without competing screen shares.",
    excerpt:
      "Screen presence is more than a camera tile. In a collaborative meeting it is how clearly the room can see who is presenting, what is on the shared screen, and where the work actually lives.",
    publishedAt: "2026-10-12",
    readingMinutes: 6,
    keywords: [
      "screen presence",
      "screen sharing",
      "presenter mode",
      "remote meeting",
      "collaborative workspace",
    ],
    image: "/blog/screen-presence.jpg",
    imageAlt:
      "Two teammates watching one presenter on a shared screen beside a glowing network graph.",
    sections: [
      {
        heading: "Screen presence is how the room knows where to look",
        paragraphs: [
          "Remote meetings lose people in the gaps between tiles. Someone is talking, someone else is sharing a slide, and the actual decision is happening in a doc nobody has open. Screen presence is the habit of making the work visible: a clear presenter, a single shared screen, and a workspace the rest of the room can follow.",
          "That is different from leaving a camera on and hoping the team infers the point. Good screen presence in a collaborative meeting tells people three things at once: who owns the presentation, what is on the screen, and how the rest of the room can stay with that view.",
        ],
      },
      {
        heading: "One presenter, one shared screen",
        paragraphs: [
          "Competing screen shares are the fastest way to break a meeting. Two people present, the stage flips, and everyone spends the next minute asking which window is current. A single presenter lock keeps ownership obvious. Spotlight puts that presenter on the stage so the room is looking at one stream.",
          "In Echo, screen sharing streams your screen or an application into the shared workspace, and the meeting dock sits over the canvas. The point of the share is the workspace itself — the node graph the team is editing — not a screenshot of a tool that will be outdated by the next comment.",
        ],
      },
      {
        heading: "Presence on the canvas, not only in the call",
        paragraphs: [
          "Screen presence also includes who is in the room when they are not presenting. Live presence, avatars, and remote cursors show who is looking at which part of the canvas. Follow mode lets anyone sync their viewport to the presenter, so a long canvas does not turn into a guided tour nobody can keep up with.",
          "That combination matters for an AI workspace. If only the presenter can see the nodes Echo just added, the meeting is a broadcast. If the room can follow the canvas, point with a cursor, and ask the next question against the same graph, screen sharing becomes collaborative work.",
        ],
      },
      {
        heading: "A simple screen-presence checklist",
        paragraphs: [
          "Before you present, decide who owns the screen and leave it there. Share the workspace, not a private notes app. Invite the room to follow your view instead of describing coordinates out loud. When the decision lands, leave it on the canvas so the shared screen and the record of the meeting are the same thing.",
          "If you are comparing how this feels in practice, the Echo demo walks through in-workspace meetings, screen sharing, spotlight, and follow-the-presenter. Screen presence works when the meeting, the presenter, and the AI workspace are one surface.",
        ],
      },
    ],
  },
  {
    slug: "visual-ai-workspace-from-conversation",
    title: "Turn a Conversation into a Visual AI Workspace",
    description:
      "A visual AI workspace turns meeting conversation into a canvas of decisions, relationships, and next steps your team can keep editing together.",
    excerpt:
      "Conversation is fast. A visual workspace is what makes it durable. Here is how teams move from a live discussion to a canvas they can still use next week.",
    publishedAt: "2026-10-16",
    readingMinutes: 7,
    keywords: [
      "visual workspace",
      "AI canvas",
      "collaborative thinking",
      "AI meeting notes",
      "real-time collaboration",
    ],
    image: "/blog/visual-workspace.jpg",
    imageAlt:
      "A spoken idea turning into a connected map of cards, groups, and directional lines.",
    sections: [
      {
        heading: "Conversation moves faster than notes",
        paragraphs: [
          "Teams adopt an AI workspace because chat alone does not hold a hard problem. A meeting produces branching questions, rejected options, and one path the group actually chose. A transcript preserves the words. A visual workspace preserves the structure: what relates to what, what depends on what, and what is still open.",
          "Echo is built for that handoff. You discuss the problem in natural language. The canvas becomes a graph of concepts, questions, and decisions. Directional edges show how the parts connect. Groups keep a theme together so the map stays readable after the meeting.",
        ],
      },
      {
        heading: "Four ways a visual workspace earns its place",
        paragraphs: [
          "Explore when the room is still finding the shape of the problem. Questions and relationships belong on the canvas before anyone locks a plan. Plan when the work has an order: sequence, owners, and dependencies are easier to argue about when they are visible. Decide when two or three options need an honest trade-off, side by side. Create when the group is still iterating and the canvas should show the current concept, not only the last message in the thread.",
          "Those are the same modes a collaborative AI workspace should support in one room. Switching tools every time the meeting changes mode is how context gets lost. The AI should see the nodes already on the canvas, and the canvas should update from the conversation you are having.",
        ],
      },
      {
        heading: "Why real-time collaboration changes the notes",
        paragraphs: [
          "A visual AI workspace is not a private summary generated after everyone hangs up. Real-time collaboration means the people in the meeting watch the structure form. Remote cursors and presence show who is editing which region. A shared room link is the workspace, so a teammate who joins late lands in the same map.",
          "That also changes what “AI meeting notes” should mean. The useful record is the canvas the room already agreed to look at: the decision node, the rejected alternative, the next step. A paragraph that restates the call is optional. The graph is the note.",
        ],
      },
      {
        heading: "Start with one meeting, not a new process",
        paragraphs: [
          "Pick a conversation that usually dies in a doc: a planning session, an architecture choice, or a problem the team keeps re-explaining. Open Echo, talk through it, and let the workspace hold the map. Invite the room. If someone is presenting, have the others follow that view so the visual workspace and the meeting stay aligned.",
          "The use cases page shows explore, plan, decide, and create in more detail. The shortest version is this: an AI workspace is worth using when the conversation and the canvas are the same place the team returns to.",
        ],
      },
    ],
  },
  {
    slug: "future-of-remote-meetings-ai-workspace-screen-sharing",
    title: "The Future of Remote Meetings: How AI Workspaces and Screen Sharing Redefine Collaborative Productivity",
    description:
      "Discover how next-generation AI workspaces, integrated screen sharing, and real-time collaboration eliminate meeting fatigue and fragmented tools for remote teams.",
    excerpt:
      "Video calls and disconnected docs create meeting fatigue. The future of remote meetings unifies screen sharing, collaborative AI, and a persistent visual workspace into one seamless surface.",
    publishedAt: "2026-10-22",
    readingMinutes: 8,
    keywords: [
      "AI workspace",
      "remote meetings",
      "screen sharing",
      "collaborative screen",
      "AI meeting assistant",
      "video conferencing",
      "real-time collaboration",
      "visual collaboration",
      "hybrid work productivity",
      "team collaboration software",
      "interactive whiteboarding",
      "AI productivity tools",
      "virtual meeting platform",
      "collaborative intelligence",
      "screen presence",
      "live meeting notes",
      "spatial canvas",
      "presenter mode",
      "context-aware AI",
      "digital workspace",
      "distributed team workflow",
      "multiplayer workspace",
      "meeting fatigue",
      "conversational AI",
    ],
    image: "/blog/future-remote-meetings.jpg",
    imageAlt:
      "A modern AI workspace showing a live video meeting dock, screen share preview, and glowing collaborative canvas with multiplayer cursors.",
    sections: [
      {
        heading: "The death of fragmented calls: Why video conferencing alone fails remote teams",
        paragraphs: [
          "Traditional video conferencing platforms were built for talking heads, not collaborative thinking. Remote teams routinely endure a fragmented dance across five separate applications: a video call window, a shared doc for notes, a slide deck for presentation, a team messaging app for sidebar comments, and a private AI chat that lacks any context of what the room is debating.",
          "This tool fragmentation is the primary driver of modern meeting fatigue. When critical decisions are scattered between ephemeral audio streams and disconnected documents, alignment evaporates the moment participants click 'Leave Meeting'. An integrated AI workspace bridges this chasm by embedding real-time collaboration, video conferencing, and contextual intelligence onto a unified spatial canvas.",
        ],
      },
      {
        heading: "Collaborative screen sharing meets context-aware AI",
        paragraphs: [
          "Standard screen sharing in conventional virtual meeting platforms is fundamentally passive: one person broadcasts a static application while everyone else observes in silence. If someone wants to propose an alternative architecture or annotate an idea, they must wait for the screen owner to yield control or paste unformatted text into a side chat.",
          "Next-generation remote meetings invert this paradigm with interactive collaborative screen sharing and screen presence. In Echo, the shared screen is not just a passive video feed; it is an active multiplayer workspace. Teammates follow the presenter seamlessly with presenter mode and follow-view synchronization, while context-aware AI listens, interprets relationships, and generates interactive concept nodes directly into the shared room.",
        ],
      },
      {
        heading: "From passive calls to collaborative intelligence",
        paragraphs: [
          "Generic AI meeting assistants that drop 10-page text summaries into your inbox after a call rarely solve team alignment. Teams do not suffer from a lack of transcripts; they struggle to extract synthesized decisions, architecture trade-offs, and clear dependencies from fast-paced conversations.",
          "True collaborative intelligence operates inside the live meeting. By engaging with conversational AI alongside your team, dialogue transforms instantaneously into visual graphs, decision matrices, and action items on an infinite spatial canvas. Because the AI has full visibility into the workspace canvas, questions are answered with deep contextual understanding rather than generic boilerplate.",
        ],
      },
      {
        heading: "Unifying hybrid work productivity and distributed team workflows",
        paragraphs: [
          "High-velocity engineering and product teams cannot afford the latency of disconnected tools. Transforming hybrid work productivity requires moving away from disposable meetings toward persistent digital workspaces where conversation, screen presence, and visual brainstorming coalesce.",
          "When you run your remote meetings inside Echo, the boundary between synchronous brainstorming and asynchronous execution disappears. The screen share, the live meeting, and the visual AI workspace remain intact, organized, and ready for team iteration long after the video call concludes.",
        ],
      },
    ],
  },
  {
    slug: "spatial-ai-canvas-screen-meetings-collaboration",
    title: "Beyond Static Slides: Real-Time AI Canvas, Live Screen Meetings, and Spatial Team Collaboration",
    description:
      "How spatial AI canvas technology, real-time screen sharing, and interactive meetings transform brainstorming, architecture reviews, and decision making for high-velocity teams.",
    excerpt:
      "Linear slides and chat threads throttle complex thought. Spatial AI workspaces connect live video meetings, mind mapping, and real-time screen collaboration on an infinite canvas.",
    publishedAt: "2026-10-25",
    readingMinutes: 7,
    keywords: [
      "AI canvas",
      "spatial collaboration",
      "real-time screen sharing",
      "visual AI workspace",
      "interactive meetings",
      "mind mapping AI",
      "collaborative whiteboarding",
      "decision making tools",
      "smart workspace",
      "follow mode presentation",
      "live team canvas",
      "generative AI workspace",
      "remote screen collaboration",
      "voice AI assistant",
      "project planning canvas",
      "asynchronous and synchronous work",
      "cloud collaboration platform",
      "shared visual workspace",
      "team knowledge graph",
      "infinite canvas workspace",
      "live presence",
      "real-time collaboration",
      "meeting workspace",
      "collaborative AI",
    ],
    image: "/blog/spatial-ai-canvas-collaboration.jpg",
    imageAlt:
      "A futuristic visual AI canvas interface for remote teams, featuring concept graphs, live video stream, and real-time screen collaboration.",
    sections: [
      {
        heading: "Breaking out of the linear document prison",
        paragraphs: [
          "Human thought is non-linear, multidimensional, and associative. Yet for decades, distributed teams have been forced to cram complex software architecture, product roadmaps, and strategic debates into linear bullet lists and static slide decks. Linear mediums stifle organic problem solving and hide critical interdependencies.",
          "A spatial visual AI workspace dismantles these constraints with an infinite canvas workspace. Instead of scrolling through 40 pages of disconnected text, teams organize ideas across two-dimensional space—grouping clusters, linking causal relationships with directional edges, and expanding technical hierarchies. It turns abstract debate into an intuitive team knowledge graph.",
        ],
      },
      {
        heading: "Live screen meetings with follow-mode and interactive presence",
        paragraphs: [
          "The greatest friction during remote screen collaboration is navigational disorientation: someone says 'look at the bottom diagram' and eight participants spend two minutes panning around trying to find the coordinate. Screen sharing shouldn't feel like a disorienting treasure hunt.",
          "Echo solves this with synchronized follow mode presentation and live presence indicators. Participants see live multiplayer cursor tags showing exactly where teammates are pointing, exploring, or drafting. With a single click, anyone can follow the presenter's viewport as they glide across complex technical diagrams, turning what used to be a rigid presentation into an interactive meeting.",
        ],
      },
      {
        heading: "Mind mapping AI: Transforming dialogue into architectural clarity",
        paragraphs: [
          "Brainstorming sessions often descend into chaos without structured facilitation. Integrating mind mapping AI and generative AI capabilities directly into the collaborative whiteboarding surface revolutionizes how concepts take form during live discussions.",
          "Whether you speak thoughts aloud via voice AI assistant or type rapid questions, Echo synthesizes arguments into cleanly formatted concept cards and structured decision trees. The AI doesn't just regurgitate words—it identifies logical contradictions, maps alternatives side by side, and organizes sequence and ownership on a visual project planning canvas in real time.",
        ],
      },
      {
        heading: "Bridging synchronous and asynchronous work in one shared visual workspace",
        paragraphs: [
          "The ultimate test of any collaboration tool is what happens when the call is over. In traditional setups, someone is saddled with the chore of transcribing meeting notes into another wiki, losing the nuanced reasoning and visual context built during the session.",
          "Because Echo is a persistent cloud collaboration platform, the shared visual workspace is the permanent record. Late joiners or asynchronous teammates in different time zones can navigate the visual map, review connected rationale, and interact with the generative AI workspace to ask follow-up questions. By uniting live screen meetings with spatial intelligence, Echo ensures your team's collective momentum never stops.",
        ],
      },
    ],
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function formatBlogDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
