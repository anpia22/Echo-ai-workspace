export type GraphContextNode = {
  id: string;
  nodeType?: string;
  title: string;
  description?: string;
  position?: {
    x: number;
    y: number;
  };
};

export type GraphContextEdge = {
  source: string;
  target: string;
  sourceTitle?: string;
  targetTitle?: string;
  relationship?: string;
};

export type GraphContext = {
  nodes: GraphContextNode[];
  edges: GraphContextEdge[];
};

export function logGraphContext(context: GraphContext) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log("=== ECHO GRAPH CONTEXT ===");
  console.log("Nodes:", context.nodes.length);
  console.log("Edges:", context.edges.length);
  console.log(JSON.stringify(context, null, 2));
  console.log("==========================");

  const graphMultiHopFacts = buildGraphMultiHopFacts(context);
  console.log(
    "MULTI-HOP FACTS:",
    JSON.stringify(graphMultiHopFacts, null, 2)
  );
}

export type ExplicitGraphEvidence = {
  relationships: string[];
  causalRoots: string[];
  hasCausalEdges: boolean;
};

/**
 * Read-only summary of explicit edges. Does not infer
 * causality from titles — only listed relationships.
 */
export function buildExplicitGraphEvidence(
  context: GraphContext
): ExplicitGraphEvidence {
  const titleById = new Map(
    context.nodes.map((node) => [node.id, node.title])
  );

  const relationships: string[] = [];

  for (const edge of context.edges) {
    const sourceTitle =
      edge.sourceTitle || titleById.get(edge.source);
    const targetTitle =
      edge.targetTitle || titleById.get(edge.target);
    const relationship = edge.relationship || "related to";

    if (!sourceTitle || !targetTitle) {
      continue;
    }

    relationships.push(
      `${sourceTitle} --${relationship}--> ${targetTitle}`
    );
  }

  const causalEdges = context.edges.filter(
    (edge) => edge.relationship === "causes"
  );
  const causedIds = new Set(causalEdges.map((edge) => edge.target));
  const causalRoots: string[] = [];
  const seenRoots = new Set<string>();

  for (const edge of causalEdges) {
    if (causedIds.has(edge.source)) {
      continue;
    }

    const title =
      edge.sourceTitle || titleById.get(edge.source);

    if (!title || seenRoots.has(title)) {
      continue;
    }

    seenRoots.add(title);
    causalRoots.push(title);
  }

  return {
    relationships,
    causalRoots,
    hasCausalEdges: causalEdges.length > 0,
  };
}

export function formatExplicitGraphEvidence(
  evidence: ExplicitGraphEvidence
): string {
  const relationshipLines =
    evidence.relationships.length > 0
      ? evidence.relationships.map((line) => `- ${line}`).join("\n")
      : "- none";

  const rootLines = !evidence.hasCausalEdges
    ? "- none (no explicit causes edges)"
    : evidence.causalRoots.length > 0
      ? evidence.causalRoots.map((title) => `- ${title}`).join("\n")
      : "- none (causal edges exist but every cause is also caused by another node)";

  return `EXPLICIT RELATIONSHIPS:
${relationshipLines}

UPSTREAM CAUSES (nodes that cause something and are not themselves caused by an explicit causes edge):
${rootLines}`;
}

export type GraphInsightCause = {
  source: string;
  target: string;
};

export type GraphInsightSolve = {
  source: string;
  target: string;
};

export type GraphInsightSolvedProblem = {
  problem: string;
  solutions: string[];
};

export type GraphInsightFacts = {
  problems: string[];
  solutions: string[];
  nodesByType: Record<string, string[]>;
  causeEdges: GraphInsightCause[];
  solveEdges: GraphInsightSolve[];
  problemsWithSolutions: GraphInsightSolvedProblem[];
  unresolvedProblems: string[];
  rankingAttributesPresent: boolean;
};

function uniqueTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const title of titles) {
    if (seen.has(title)) {
      continue;
    }

    seen.add(title);
    result.push(title);
  }

  return result;
}

function titlesOfType(context: GraphContext, nodeType: string): string[] {
  return uniqueTitles(
    context.nodes
      .filter((node) => node.nodeType === nodeType)
      .map((node) => node.title)
  );
}

/**
 * Read-only insight facts from explicit node types and edges.
 * Does not infer causality, solutions, or ranking from titles.
 */
export function buildGraphInsightFacts(
  context: GraphContext
): GraphInsightFacts {
  const titleById = new Map(
    context.nodes.map((node) => [node.id, node.title])
  );

  const nodesByType: Record<string, string[]> = {};

  for (const node of context.nodes) {
    const nodeType = node.nodeType || "unknown";

    if (!nodesByType[nodeType]) {
      nodesByType[nodeType] = [];
    }

    if (!nodesByType[nodeType].includes(node.title)) {
      nodesByType[nodeType].push(node.title);
    }
  }

  const problems = titlesOfType(context, "problem");
  const solutions = titlesOfType(context, "solution");

  const causeEdges: GraphInsightCause[] = [];
  const solveEdges: GraphInsightSolve[] = [];
  const solutionsByProblem = new Map<string, string[]>();

  for (const edge of context.edges) {
    const sourceTitle =
      edge.sourceTitle || titleById.get(edge.source);
    const targetTitle =
      edge.targetTitle || titleById.get(edge.target);

    if (!sourceTitle || !targetTitle) {
      continue;
    }

    if (edge.relationship === "causes") {
      causeEdges.push({
        source: sourceTitle,
        target: targetTitle,
      });
    }

    if (edge.relationship === "solves") {
      solveEdges.push({
        source: sourceTitle,
        target: targetTitle,
      });

      const existing = solutionsByProblem.get(targetTitle) ?? [];

      if (!existing.includes(sourceTitle)) {
        existing.push(sourceTitle);
        solutionsByProblem.set(targetTitle, existing);
      }
    }
  }

  const problemsWithSolutions: GraphInsightSolvedProblem[] = problems
    .filter((problem) => solutionsByProblem.has(problem))
    .map((problem) => ({
      problem,
      solutions: solutionsByProblem.get(problem) ?? [],
    }));

  const unresolvedProblems = problems.filter(
    (problem) => !solutionsByProblem.has(problem)
  );

  const ranking = detectRankingAttributes(context);

  return {
    problems,
    solutions,
    nodesByType,
    causeEdges,
    solveEdges,
    problemsWithSolutions,
    unresolvedProblems,
    rankingAttributesPresent: ranking.present,
  };
}

function detectRankingAttributes(context: GraphContext): {
  present: boolean;
  notes: string[];
} {
  const notes: string[] = [];
  const pattern =
    /\b(priority|severity|impact|importance|urgency|roi)\s*[:=]\s*([^\n.,;]+)/i;

  for (const node of context.nodes) {
    const haystack = [node.title, node.description]
      .filter((value): value is string => typeof value === "string")
      .join(" ");
    const match = haystack.match(pattern);

    if (!match) {
      continue;
    }

    notes.push(`${node.title}: ${match[0].trim()}`);
  }

  return {
    present: notes.length > 0,
    notes,
  };
}

function formatTitleList(titles: string[]): string {
  return titles.length > 0
    ? titles.map((title) => `- ${title}`).join("\n")
    : "- none";
}

export function formatGraphInsightFacts(facts: GraphInsightFacts): string {
  const typeLines = Object.keys(facts.nodesByType)
    .sort()
    .map((nodeType) => {
      const titles = facts.nodesByType[nodeType].join(", ");
      return `- ${nodeType}: ${titles}`;
    });

  const causeLines =
    facts.causeEdges.length > 0
      ? facts.causeEdges
          .map((edge) => `- ${edge.source} --causes--> ${edge.target}`)
          .join("\n")
      : "- none";

  const solveLines =
    facts.solveEdges.length > 0
      ? facts.solveEdges
          .map((edge) => `- ${edge.source} --solves--> ${edge.target}`)
          .join("\n")
      : "- none";

  const solvedLines =
    facts.problemsWithSolutions.length > 0
      ? facts.problemsWithSolutions
          .map(
            (item) =>
              `- ${item.problem} (solved by: ${item.solutions.join(", ")})`
          )
          .join("\n")
      : "- none";

  return `GRAPH INSIGHT FACTS (explicit graph only; do not invent):
NODE TYPES:
${typeLines.length > 0 ? typeLines.join("\n") : "- none"}

PROBLEMS:
${formatTitleList(facts.problems)}

SOLUTIONS:
${formatTitleList(facts.solutions)}

EXPLICIT CAUSES (source --causes--> target; do not reverse):
${causeLines}

EXPLICIT SOLVES (source --solves--> target; do not reverse):
${solveLines}

PROBLEMS WITH AT LEAST ONE SOLUTION:
${solvedLines}

UNRESOLVED PROBLEMS (problem nodes with no incoming solves edge):
${formatTitleList(facts.unresolvedProblems)}

RANKING ATTRIBUTES (priority / severity / impact / importance):
${facts.rankingAttributesPresent ? "- present" : "- none"}`;
}

export type GraphCausalPath = {
  nodes: string[];
  hops: number;
};

export type GraphMultiHopFacts = {
  causalPaths: GraphCausalPath[];
  maxCausalDepth: number;
};

export function buildGraphMultiHopFacts(
  context: GraphContext
): GraphMultiHopFacts {
  const titleById = new Map(
    context.nodes.map((node) => [node.id, node.title])
  );

  const adjacency = new Map<string, string[]>();

  for (const edge of context.edges) {
    if (edge.relationship !== "causes") {
      continue;
    }

    if (!titleById.has(edge.source) || !titleById.has(edge.target)) {
      continue;
    }

    const targets = adjacency.get(edge.source) ?? [];

    if (!targets.includes(edge.target)) {
      targets.push(edge.target);
    }

    adjacency.set(edge.source, targets);
  }

  const causalPaths: GraphCausalPath[] = [];
  const seenPaths = new Set<string>();

  function walk(
    startId: string,
    currentId: string,
    path: string[]
  ) {
    const nextIds = adjacency.get(currentId) ?? [];

    for (const nextId of nextIds) {
      if (path.includes(nextId)) {
        continue;
      }

      const nextPath = [...path, nextId];

      if (nextPath.length >= 3) {
        const titles = nextPath
          .map((id) => titleById.get(id))
          .filter(
            (title): title is string =>
              typeof title === "string"
          );

        if (titles.length !== nextPath.length) {
          continue;
        }

        const key = titles.join(" → ");

        if (!seenPaths.has(key)) {
          seenPaths.add(key);

          causalPaths.push({
            nodes: titles,
            hops: titles.length - 1,
          });
        }
      }

      walk(
        startId,
        nextId,
        nextPath
      );
    }
  }

  for (const node of context.nodes) {
    walk(node.id, node.id, [node.id]);
  }

  const maxCausalDepth =
    causalPaths.length > 0
      ? Math.max(
          ...causalPaths.map(
            (path) => path.hops
          )
        )
      : 0;

  return {
    causalPaths,
    maxCausalDepth,
  };
}

export function formatGraphMultiHopFacts(
  facts: GraphMultiHopFacts
): string {
  const pathLines =
    facts.causalPaths.length > 0
      ? facts.causalPaths
          .map(
            (path) =>
              `- ${path.nodes.join(" --causes--> ")} (${path.hops} hops)`
          )
          .join("\n")
      : "- none";

  return `GRAPH MULTI-HOP CAUSAL FACTS (explicit causes edges only):
CAUSAL PATHS:
${pathLines}

MAX CAUSAL DEPTH:
- ${facts.maxCausalDepth}`;
}

export type GraphRecommendationFacts = {
  topLevelProblems: string[];
  standaloneProblems: string[];
  upstreamCauses: string[];
  unresolvedCauses: string[];
  solvedCauses: string[];
  coverageGaps: string[];
  topLevelUnresolvedWithSolvedCauses: Array<{
    problem: string;
    solvedCauses: string[];
  }>;
  rankingAttributesPresent: boolean;
  rankingNotes: string[];
};

function titlesCausing(
  causeEdges: GraphInsightCause[],
  title: string
): string[] {
  return uniqueTitles(
    causeEdges
      .filter((edge) => edge.target === title)
      .map((edge) => edge.source)
  );
}

function titlesCausedBy(
  causeEdges: GraphInsightCause[],
  title: string
): string[] {
  return uniqueTitles(
    causeEdges
      .filter((edge) => edge.source === title)
      .map((edge) => edge.target)
  );
}

/**
 * Structural recommendation facts from explicit types and edges.
 * Does not invent priority, impact, or business ranking.
 */
export function buildGraphRecommendationFacts(
  context: GraphContext,
  insight: GraphInsightFacts = buildGraphInsightFacts(context)
): GraphRecommendationFacts {
  const problemSet = new Set(insight.problems);
  const solvedSet = new Set(
    insight.problemsWithSolutions.map((item) => item.problem)
  );
  const unresolvedSet = new Set(insight.unresolvedProblems);

  const upstreamCauses = uniqueTitles(
    insight.causeEdges.map((edge) => edge.source)
  );
  const upstreamProblemCauses = upstreamCauses.filter((title) =>
    problemSet.has(title)
  );

  const topLevelProblems = insight.problems.filter((title) => {
    const incoming = titlesCausing(insight.causeEdges, title);
    const outgoing = titlesCausedBy(insight.causeEdges, title);
    return incoming.length > 0 && outgoing.length === 0;
  });

  const standaloneProblems = insight.problems.filter((title) => {
    const incoming = titlesCausing(insight.causeEdges, title);
    const outgoing = titlesCausedBy(insight.causeEdges, title);
    return incoming.length === 0 && outgoing.length === 0;
  });

  const unresolvedCauses = upstreamProblemCauses.filter((title) =>
    unresolvedSet.has(title)
  );
  const solvedCauses = upstreamProblemCauses.filter((title) =>
    solvedSet.has(title)
  );

  const topLevelUnresolvedWithSolvedCauses = topLevelProblems
    .filter((title) => unresolvedSet.has(title))
    .map((problem) => {
      const causes = titlesCausing(insight.causeEdges, problem).filter(
        (title) => problemSet.has(title)
      );
      const solvedForProblem = causes.filter((title) => solvedSet.has(title));
      const allCausesSolved =
        causes.length > 0 && solvedForProblem.length === causes.length;

      return {
        problem,
        solvedCauses: solvedForProblem,
        allCausesSolved,
      };
    })
    .filter((item) => item.allCausesSolved)
    .map(({ problem, solvedCauses }) => ({
      problem,
      solvedCauses,
    }));

  const coveredTopLevel = new Set(
    topLevelUnresolvedWithSolvedCauses.map((item) => item.problem)
  );

  let coverageGaps: string[] = [];

  if (unresolvedCauses.length > 0) {
    coverageGaps = unresolvedCauses;
  } else if (standaloneProblems.some((title) => unresolvedSet.has(title))) {
    coverageGaps = standaloneProblems.filter((title) =>
      unresolvedSet.has(title)
    );
  } else {
    coverageGaps = insight.unresolvedProblems.filter(
      (title) => !coveredTopLevel.has(title)
    );
  }

  const ranking = detectRankingAttributes(context);

  return {
    topLevelProblems,
    standaloneProblems,
    upstreamCauses: upstreamProblemCauses,
    unresolvedCauses,
    solvedCauses,
    coverageGaps,
    topLevelUnresolvedWithSolvedCauses,
    rankingAttributesPresent: ranking.present,
    rankingNotes: ranking.notes,
  };
}

export function formatGraphRecommendationFacts(
  facts: GraphRecommendationFacts
): string {
  const coveredLines =
    facts.topLevelUnresolvedWithSolvedCauses.length > 0
      ? facts.topLevelUnresolvedWithSolvedCauses
          .map(
            (item) =>
              `- ${item.problem} has no direct incoming solves edge, but every identified upstream problem-cause currently has a solution (${item.solvedCauses.join(", ")})`
          )
          .join("\n")
      : "- none";

  const rankingLines = facts.rankingAttributesPresent
    ? facts.rankingNotes.map((note) => `- ${note}`).join("\n")
    : "- none (do not invent priority, severity, impact, urgency, cost, or ROI)";

  return `GRAPH RECOMMENDATION FACTS (explicit structure only; recommendations, not decisions):
TOP-LEVEL PROBLEMS (problem nodes that are caused by something and do not themselves cause another node):
${formatTitleList(facts.topLevelProblems)}

STANDALONE PROBLEMS (problem nodes with no explicit causes edges in or out):
${formatTitleList(facts.standaloneProblems)}

UPSTREAM PROBLEM CAUSES (problem nodes that are the source of an explicit causes edge):
${formatTitleList(facts.upstreamCauses)}

UNRESOLVED CAUSES (upstream problem causes with no incoming solves edge):
${formatTitleList(facts.unresolvedCauses)}

CAUSES THAT ALREADY HAVE A SOLUTION:
${formatTitleList(facts.solvedCauses)}

SOLUTION COVERAGE GAPS (unresolved actionable problem causes, else unresolved standalone problems; not an impact ranking):
${formatTitleList(facts.coverageGaps)}

TOP-LEVEL PROBLEMS WITH NO DIRECT SOLUTION WHOSE UPSTREAM CAUSES ARE SOLVED:
${coveredLines}

RANKING ATTRIBUTES FOUND IN NODE TITLE/DESCRIPTION:
${rankingLines}`;
}

export type GraphInsightIntent =
  | "main_problems"
  | "main_causes"
  | "solutions"
  | "problems_with_solutions"
  | "unresolved_problems"
  | "workspace_summary"
  | "evidence"
  | "ranking"
  | "focus_recommendation"
  | "next_step"
  | "unresolved_recommendation"
  | "solution_coverage"
  | "other_recommendation"
  | "other_insight"
  | "action";

export function isRecommendationIntent(intent: GraphInsightIntent): boolean {
  return (
    intent === "focus_recommendation" ||
    intent === "next_step" ||
    intent === "unresolved_recommendation" ||
    intent === "solution_coverage" ||
    intent === "other_recommendation"
  );
}

function hasCanvasModificationIntent(transcript: string): boolean {
  return /\b(add|create|connect|delete|remove|rename|update|capture|insert|draw|group)\b/.test(
    transcript
  );
}

function isQuestionLike(transcript: string): boolean {
  return (
    transcript.includes("?") ||
    /^(what|which|who|where|why|how|summarize|list)\b/.test(transcript)
  );
}

export function classifyGraphInsightIntent(
  transcript: string
): GraphInsightIntent {
  const text = transcript.trim().toLowerCase();

  if (!text) {
    return "action";
  }

  if (hasCanvasModificationIntent(text)) {
    return "action";
  }

  if (
    /\b(biggest|clearest|largest|widest)\s+(coverage\s+)?gap\b/.test(text) ||
    /\bcoverage gap\b/.test(text) ||
    /\bwhere (do we have|is) (the )?\b/.test(text) && /\bgap\b/.test(text) ||
    /\bmissing (a )?solution/.test(text) && /\b(where|which|what)\b/.test(text)
  ) {
    return "solution_coverage";
  }

  if (
    /\bwhat should (we|i) do about\b/.test(text) ||
    /\bwhy\b/.test(text) && /\brecommend/.test(text)
  ) {
    return "other_recommendation";
  }

  if (
    /\b(address next|tackle next|fix next|work on next)\b/.test(text) ||
    /\bwhat should we address\b/.test(text) ||
    /\bwhich issue should we tackle\b/.test(text)
  ) {
    return "unresolved_recommendation";
  }

  if (
    /\b(do next|next step|tackle first|do first|fix first|start (with|on)|work on first)\b/.test(
      text
    ) ||
    /\bwhat should we priorit/.test(text)
  ) {
    return "next_step";
  }

  if (
    /\b(what|where|which)\b/.test(text) && /\bfocus\b/.test(text) ||
    /\bshould we focus\b/.test(text) ||
    /\bwhich (issue|problem|cause)\b/.test(text) &&
      /\b(work on|tackle|address|priorit)\b/.test(text)
  ) {
    return "focus_recommendation";
  }

  if (
    /\bwhat would you recommend\b/.test(text) ||
    /\bwhat do you recommend\b/.test(text) ||
    /\brecommend(?:ation)?\b/.test(text) &&
      isQuestionLike(text)
  ) {
    return "other_recommendation";
  }

  if (/\bsummarize\b/.test(text) && /\b(workspace|canvas|graph)\b/.test(text)) {
    return "workspace_summary";
  }

  if (/\bevidence\b/.test(text) || /\bsupports that\b/.test(text)) {
    return "evidence";
  }

  if (
    /\b(biggest|most important|highest priority|most severe|fix first|do first)\b/.test(
      text
    )
  ) {
    return "ranking";
  }

  if (
    /\bunresolved\b/.test(text) ||
    /\bstill open\b/.test(text) ||
    /\bwithout a solution\b/.test(text) ||
    /\bnot (yet )?solved\b/.test(text) ||
    /\bwhat should we fix\b/.test(text)
  ) {
    return "unresolved_problems";
  }

  if (
    /\balready have solutions\b/.test(text) ||
    /\bproblems with solutions\b/.test(text) ||
    /\bwhich problems\b/.test(text) && /\bsolution/.test(text)
  ) {
    return "problems_with_solutions";
  }

  if (
    /\bwhat solutions\b/.test(text) ||
    /\bwhich solutions\b/.test(text) ||
    /\bsolutions do we have\b/.test(text)
  ) {
    return "solutions";
  }

  if (
    /\bmain causes\b/.test(text) ||
    /\bwhat(?:'s| is| are) causing\b/.test(text) ||
    /\bcauses do we\b/.test(text)
  ) {
    return "main_causes";
  }

  if (
    /\bmain problems\b/.test(text) ||
    /\bwhat(?:'s| is| are) the problems\b/.test(text) ||
    /\bwhich problems\b/.test(text)
  ) {
    return "main_problems";
  }

  if (isQuestionLike(text)) {
    return "other_insight";
  }

  return "action";
}

export function isReadOnlyInsightRequest(transcript: string): boolean {
  const intent = classifyGraphInsightIntent(transcript);

  return intent !== "action";
}

export function logGraphInsight(
  intent: GraphInsightIntent,
  facts: GraphInsightFacts,
  actions: unknown
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log("=== ECHO GRAPH INSIGHT ===");
  console.log("Intent:", intent);
  console.log("Unresolved:", facts.unresolvedProblems);
  console.log("Causes:", facts.causeEdges);
  console.log("Solves:", facts.solveEdges);
  console.log("Actions:", JSON.stringify(actions, null, 2));
  console.log("===========================");
}

export function logGraphRecommendation(
  intent: GraphInsightIntent,
  facts: GraphRecommendationFacts,
  actions: unknown
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log("=== ECHO GRAPH RECOMMENDATION ===");
  console.log("Intent:", intent);
  console.log("Coverage gaps:", facts.coverageGaps);
  console.log("Unresolved causes:", facts.unresolvedCauses);
  console.log("Solved causes:", facts.solvedCauses);
  console.log("Top-level:", facts.topLevelProblems);
  console.log(
    "Top-level unresolved with solved causes:",
    facts.topLevelUnresolvedWithSolvedCauses
  );
  console.log("Ranking attributes:", facts.rankingAttributesPresent);
  console.log("Actions:", JSON.stringify(actions, null, 2));
  console.log("=================================");
}

type GraphSourceNode = {
  id?: string;
  nodeType?: string;
  title?: string;
  description?: string;
  position?: {
    x: number;
    y: number;
  };
};

type GraphSourceEdge = {
  sourceId?: string;
  targetId?: string;
  relationship?: string;
};

export function buildGraphContext(
  nodes: ReadonlyArray<GraphSourceNode> | undefined,
  edges: ReadonlyArray<GraphSourceEdge> | undefined
): GraphContext {
  const graphNodes: GraphContextNode[] = [];
  const titlesById = new Map<string, string>();

  for (const node of nodes ?? []) {
    if (
      typeof node?.id !== "string" ||
      node.id.length === 0 ||
      typeof node.title !== "string" ||
      node.title.length === 0
    ) {
      continue;
    }

    const graphNode: GraphContextNode = {
      id: node.id,
      title: node.title,
    };

    if (typeof node.nodeType === "string" && node.nodeType.length > 0) {
      graphNode.nodeType = node.nodeType;
    }

    if (
      typeof node.description === "string" &&
      node.description.length > 0
    ) {
      graphNode.description = node.description;
    }

    if (node.position) {
      graphNode.position = node.position;
    }

    graphNodes.push(graphNode);
    titlesById.set(node.id, node.title);
  }

  const graphEdges: GraphContextEdge[] = [];

  for (const edge of edges ?? []) {
    const source = edge?.sourceId;
    const target = edge?.targetId;

    if (
      typeof source !== "string" ||
      source.length === 0 ||
      typeof target !== "string" ||
      target.length === 0 ||
      !titlesById.has(source) ||
      !titlesById.has(target)
    ) {
      continue;
    }

    const graphEdge: GraphContextEdge = {
      source,
      target,
      sourceTitle: titlesById.get(source),
      targetTitle: titlesById.get(target),
    };

    if (
      typeof edge.relationship === "string" &&
      edge.relationship.length > 0
    ) {
      graphEdge.relationship = edge.relationship;
    }

    graphEdges.push(graphEdge);
  }

  return {
    nodes: graphNodes,
    edges: graphEdges,
  };
}
