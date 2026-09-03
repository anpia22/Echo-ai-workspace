"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logGraphContext = logGraphContext;
exports.buildExplicitGraphEvidence = buildExplicitGraphEvidence;
exports.formatExplicitGraphEvidence = formatExplicitGraphEvidence;
exports.buildGraphInsightFacts = buildGraphInsightFacts;
exports.formatGraphInsightFacts = formatGraphInsightFacts;
exports.buildGraphMultiHopFacts = buildGraphMultiHopFacts;
exports.formatGraphMultiHopFacts = formatGraphMultiHopFacts;
exports.buildGraphRecommendationFacts = buildGraphRecommendationFacts;
exports.formatGraphRecommendationFacts = formatGraphRecommendationFacts;
exports.isRecommendationIntent = isRecommendationIntent;
exports.classifyGraphInsightIntent = classifyGraphInsightIntent;
exports.isReadOnlyInsightRequest = isReadOnlyInsightRequest;
exports.logGraphInsight = logGraphInsight;
exports.logGraphRecommendation = logGraphRecommendation;
exports.buildGraphContext = buildGraphContext;
function logGraphContext(context) {
    if (process.env.NODE_ENV === "production") {
        return;
    }
    console.log("=== ECHO GRAPH CONTEXT ===");
    console.log("Nodes:", context.nodes.length);
    console.log("Edges:", context.edges.length);
    console.log(JSON.stringify(context, null, 2));
    console.log("==========================");
    var graphMultiHopFacts = buildGraphMultiHopFacts(context);
    console.log("MULTI-HOP FACTS:", JSON.stringify(graphMultiHopFacts, null, 2));
}
/**
 * Read-only summary of explicit edges. Does not infer
 * causality from titles — only listed relationships.
 */
function buildExplicitGraphEvidence(context) {
    var titleById = new Map(context.nodes.map(function (node) { return [node.id, node.title]; }));
    var relationships = [];
    for (var _i = 0, _a = context.edges; _i < _a.length; _i++) {
        var edge = _a[_i];
        var sourceTitle = edge.sourceTitle || titleById.get(edge.source);
        var targetTitle = edge.targetTitle || titleById.get(edge.target);
        var relationship = edge.relationship || "related to";
        if (!sourceTitle || !targetTitle) {
            continue;
        }
        relationships.push("".concat(sourceTitle, " --").concat(relationship, "--> ").concat(targetTitle));
    }
    var causalEdges = context.edges.filter(function (edge) { return edge.relationship === "causes"; });
    var causedIds = new Set(causalEdges.map(function (edge) { return edge.target; }));
    var causalRoots = [];
    var seenRoots = new Set();
    for (var _b = 0, causalEdges_1 = causalEdges; _b < causalEdges_1.length; _b++) {
        var edge = causalEdges_1[_b];
        if (causedIds.has(edge.source)) {
            continue;
        }
        var title = edge.sourceTitle || titleById.get(edge.source);
        if (!title || seenRoots.has(title)) {
            continue;
        }
        seenRoots.add(title);
        causalRoots.push(title);
    }
    return {
        relationships: relationships,
        causalRoots: causalRoots,
        hasCausalEdges: causalEdges.length > 0,
    };
}
function formatExplicitGraphEvidence(evidence) {
    var relationshipLines = evidence.relationships.length > 0
        ? evidence.relationships.map(function (line) { return "- ".concat(line); }).join("\n")
        : "- none";
    var rootLines = !evidence.hasCausalEdges
        ? "- none (no explicit causes edges)"
        : evidence.causalRoots.length > 0
            ? evidence.causalRoots.map(function (title) { return "- ".concat(title); }).join("\n")
            : "- none (causal edges exist but every cause is also caused by another node)";
    return "EXPLICIT RELATIONSHIPS:\n".concat(relationshipLines, "\n\nUPSTREAM CAUSES (nodes that cause something and are not themselves caused by an explicit causes edge):\n").concat(rootLines);
}
function uniqueTitles(titles) {
    var seen = new Set();
    var result = [];
    for (var _i = 0, titles_1 = titles; _i < titles_1.length; _i++) {
        var title = titles_1[_i];
        if (seen.has(title)) {
            continue;
        }
        seen.add(title);
        result.push(title);
    }
    return result;
}
function titlesOfType(context, nodeType) {
    return uniqueTitles(context.nodes
        .filter(function (node) { return node.nodeType === nodeType; })
        .map(function (node) { return node.title; }));
}
/**
 * Read-only insight facts from explicit node types and edges.
 * Does not infer causality, solutions, or ranking from titles.
 */
function buildGraphInsightFacts(context) {
    var _a;
    var titleById = new Map(context.nodes.map(function (node) { return [node.id, node.title]; }));
    var nodesByType = {};
    for (var _i = 0, _b = context.nodes; _i < _b.length; _i++) {
        var node = _b[_i];
        var nodeType = node.nodeType || "unknown";
        if (!nodesByType[nodeType]) {
            nodesByType[nodeType] = [];
        }
        if (!nodesByType[nodeType].includes(node.title)) {
            nodesByType[nodeType].push(node.title);
        }
    }
    var problems = titlesOfType(context, "problem");
    var solutions = titlesOfType(context, "solution");
    var causeEdges = [];
    var solveEdges = [];
    var solutionsByProblem = new Map();
    for (var _c = 0, _d = context.edges; _c < _d.length; _c++) {
        var edge = _d[_c];
        var sourceTitle = edge.sourceTitle || titleById.get(edge.source);
        var targetTitle = edge.targetTitle || titleById.get(edge.target);
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
            var existing = (_a = solutionsByProblem.get(targetTitle)) !== null && _a !== void 0 ? _a : [];
            if (!existing.includes(sourceTitle)) {
                existing.push(sourceTitle);
                solutionsByProblem.set(targetTitle, existing);
            }
        }
    }
    var problemsWithSolutions = problems
        .filter(function (problem) { return solutionsByProblem.has(problem); })
        .map(function (problem) {
        var _a;
        return ({
            problem: problem,
            solutions: (_a = solutionsByProblem.get(problem)) !== null && _a !== void 0 ? _a : [],
        });
    });
    var unresolvedProblems = problems.filter(function (problem) { return !solutionsByProblem.has(problem); });
    var ranking = detectRankingAttributes(context);
    return {
        problems: problems,
        solutions: solutions,
        nodesByType: nodesByType,
        causeEdges: causeEdges,
        solveEdges: solveEdges,
        problemsWithSolutions: problemsWithSolutions,
        unresolvedProblems: unresolvedProblems,
        rankingAttributesPresent: ranking.present,
    };
}
function detectRankingAttributes(context) {
    var notes = [];
    var pattern = /\b(priority|severity|impact|importance|urgency|roi)\s*[:=]\s*([^\n.,;]+)/i;
    for (var _i = 0, _a = context.nodes; _i < _a.length; _i++) {
        var node = _a[_i];
        var haystack = [node.title, node.description]
            .filter(function (value) { return typeof value === "string"; })
            .join(" ");
        var match = haystack.match(pattern);
        if (!match) {
            continue;
        }
        notes.push("".concat(node.title, ": ").concat(match[0].trim()));
    }
    return {
        present: notes.length > 0,
        notes: notes,
    };
}
function formatTitleList(titles) {
    return titles.length > 0
        ? titles.map(function (title) { return "- ".concat(title); }).join("\n")
        : "- none";
}
function formatGraphInsightFacts(facts) {
    var typeLines = Object.keys(facts.nodesByType)
        .sort()
        .map(function (nodeType) {
        var titles = facts.nodesByType[nodeType].join(", ");
        return "- ".concat(nodeType, ": ").concat(titles);
    });
    var causeLines = facts.causeEdges.length > 0
        ? facts.causeEdges
            .map(function (edge) { return "- ".concat(edge.source, " --causes--> ").concat(edge.target); })
            .join("\n")
        : "- none";
    var solveLines = facts.solveEdges.length > 0
        ? facts.solveEdges
            .map(function (edge) { return "- ".concat(edge.source, " --solves--> ").concat(edge.target); })
            .join("\n")
        : "- none";
    var solvedLines = facts.problemsWithSolutions.length > 0
        ? facts.problemsWithSolutions
            .map(function (item) {
            return "- ".concat(item.problem, " (solved by: ").concat(item.solutions.join(", "), ")");
        })
            .join("\n")
        : "- none";
    return "GRAPH INSIGHT FACTS (explicit graph only; do not invent):\nNODE TYPES:\n".concat(typeLines.length > 0 ? typeLines.join("\n") : "- none", "\n\nPROBLEMS:\n").concat(formatTitleList(facts.problems), "\n\nSOLUTIONS:\n").concat(formatTitleList(facts.solutions), "\n\nEXPLICIT CAUSES (source --causes--> target; do not reverse):\n").concat(causeLines, "\n\nEXPLICIT SOLVES (source --solves--> target; do not reverse):\n").concat(solveLines, "\n\nPROBLEMS WITH AT LEAST ONE SOLUTION:\n").concat(solvedLines, "\n\nUNRESOLVED PROBLEMS (problem nodes with no incoming solves edge):\n").concat(formatTitleList(facts.unresolvedProblems), "\n\nRANKING ATTRIBUTES (priority / severity / impact / importance):\n").concat(facts.rankingAttributesPresent ? "- present" : "- none");
}
function buildGraphMultiHopFacts(context) {
    var _a;
    var titleById = new Map(context.nodes.map(function (node) { return [node.id, node.title]; }));
    var adjacency = new Map();
    for (var _i = 0, _b = context.edges; _i < _b.length; _i++) {
        var edge = _b[_i];
        if (edge.relationship !== "causes") {
            continue;
        }
        if (!titleById.has(edge.source) || !titleById.has(edge.target)) {
            continue;
        }
        var targets = (_a = adjacency.get(edge.source)) !== null && _a !== void 0 ? _a : [];
        if (!targets.includes(edge.target)) {
            targets.push(edge.target);
        }
        adjacency.set(edge.source, targets);
    }
    var causalPaths = [];
    var seenPaths = new Set();
    function walk(startId, currentId, path) {
        var _a;
        var nextIds = (_a = adjacency.get(currentId)) !== null && _a !== void 0 ? _a : [];
        for (var _i = 0, nextIds_1 = nextIds; _i < nextIds_1.length; _i++) {
            var nextId = nextIds_1[_i];
            if (path.includes(nextId)) {
                continue;
            }
            var nextPath = __spreadArray(__spreadArray([], path, true), [nextId], false);
            if (nextPath.length >= 3) {
                var titles = nextPath
                    .map(function (id) { return titleById.get(id); })
                    .filter(function (title) {
                    return typeof title === "string";
                });
                if (titles.length !== nextPath.length) {
                    continue;
                }
                var key = titles.join(" → ");
                if (!seenPaths.has(key)) {
                    seenPaths.add(key);
                    causalPaths.push({
                        nodes: titles,
                        hops: titles.length - 1,
                    });
                }
            }
            walk(startId, nextId, nextPath);
        }
    }
    for (var _c = 0, _d = context.nodes; _c < _d.length; _c++) {
        var node = _d[_c];
        walk(node.id, node.id, [node.id]);
    }
    var maxCausalDepth = causalPaths.length > 0
        ? Math.max.apply(Math, causalPaths.map(function (path) { return path.hops; })) : 0;
    return {
        causalPaths: causalPaths,
        maxCausalDepth: maxCausalDepth,
    };
}
function formatGraphMultiHopFacts(facts) {
    var pathLines = facts.causalPaths.length > 0
        ? facts.causalPaths
            .map(function (path) {
            return "- ".concat(path.nodes.join(" --causes--> "), " (").concat(path.hops, " hops)");
        })
            .join("\n")
        : "- none";
    return "GRAPH MULTI-HOP CAUSAL FACTS (explicit causes edges only):\nCAUSAL PATHS:\n".concat(pathLines, "\n\nMAX CAUSAL DEPTH:\n- ").concat(facts.maxCausalDepth);
}
function titlesCausing(causeEdges, title) {
    return uniqueTitles(causeEdges
        .filter(function (edge) { return edge.target === title; })
        .map(function (edge) { return edge.source; }));
}
function titlesCausedBy(causeEdges, title) {
    return uniqueTitles(causeEdges
        .filter(function (edge) { return edge.source === title; })
        .map(function (edge) { return edge.target; }));
}
/**
 * Structural recommendation facts from explicit types and edges.
 * Does not invent priority, impact, or business ranking.
 */
function buildGraphRecommendationFacts(context, insight) {
    if (insight === void 0) { insight = buildGraphInsightFacts(context); }
    var problemSet = new Set(insight.problems);
    var solvedSet = new Set(insight.problemsWithSolutions.map(function (item) { return item.problem; }));
    var unresolvedSet = new Set(insight.unresolvedProblems);
    var upstreamCauses = uniqueTitles(insight.causeEdges.map(function (edge) { return edge.source; }));
    var upstreamProblemCauses = upstreamCauses.filter(function (title) {
        return problemSet.has(title);
    });
    var topLevelProblems = insight.problems.filter(function (title) {
        var incoming = titlesCausing(insight.causeEdges, title);
        var outgoing = titlesCausedBy(insight.causeEdges, title);
        return incoming.length > 0 && outgoing.length === 0;
    });
    var standaloneProblems = insight.problems.filter(function (title) {
        var incoming = titlesCausing(insight.causeEdges, title);
        var outgoing = titlesCausedBy(insight.causeEdges, title);
        return incoming.length === 0 && outgoing.length === 0;
    });
    var unresolvedCauses = upstreamProblemCauses.filter(function (title) {
        return unresolvedSet.has(title);
    });
    var solvedCauses = upstreamProblemCauses.filter(function (title) {
        return solvedSet.has(title);
    });
    var topLevelUnresolvedWithSolvedCauses = topLevelProblems
        .filter(function (title) { return unresolvedSet.has(title); })
        .map(function (problem) {
        var causes = titlesCausing(insight.causeEdges, problem).filter(function (title) { return problemSet.has(title); });
        var solvedForProblem = causes.filter(function (title) { return solvedSet.has(title); });
        var allCausesSolved = causes.length > 0 && solvedForProblem.length === causes.length;
        return {
            problem: problem,
            solvedCauses: solvedForProblem,
            allCausesSolved: allCausesSolved,
        };
    })
        .filter(function (item) { return item.allCausesSolved; })
        .map(function (_a) {
        var problem = _a.problem, solvedCauses = _a.solvedCauses;
        return ({
            problem: problem,
            solvedCauses: solvedCauses,
        });
    });
    var coveredTopLevel = new Set(topLevelUnresolvedWithSolvedCauses.map(function (item) { return item.problem; }));
    var coverageGaps = [];
    if (unresolvedCauses.length > 0) {
        coverageGaps = unresolvedCauses;
    }
    else if (standaloneProblems.some(function (title) { return unresolvedSet.has(title); })) {
        coverageGaps = standaloneProblems.filter(function (title) {
            return unresolvedSet.has(title);
        });
    }
    else {
        coverageGaps = insight.unresolvedProblems.filter(function (title) { return !coveredTopLevel.has(title); });
    }
    var ranking = detectRankingAttributes(context);
    return {
        topLevelProblems: topLevelProblems,
        standaloneProblems: standaloneProblems,
        upstreamCauses: upstreamProblemCauses,
        unresolvedCauses: unresolvedCauses,
        solvedCauses: solvedCauses,
        coverageGaps: coverageGaps,
        topLevelUnresolvedWithSolvedCauses: topLevelUnresolvedWithSolvedCauses,
        rankingAttributesPresent: ranking.present,
        rankingNotes: ranking.notes,
    };
}
function formatGraphRecommendationFacts(facts) {
    var coveredLines = facts.topLevelUnresolvedWithSolvedCauses.length > 0
        ? facts.topLevelUnresolvedWithSolvedCauses
            .map(function (item) {
            return "- ".concat(item.problem, " has no direct incoming solves edge, but every identified upstream problem-cause currently has a solution (").concat(item.solvedCauses.join(", "), ")");
        })
            .join("\n")
        : "- none";
    var rankingLines = facts.rankingAttributesPresent
        ? facts.rankingNotes.map(function (note) { return "- ".concat(note); }).join("\n")
        : "- none (do not invent priority, severity, impact, urgency, cost, or ROI)";
    return "GRAPH RECOMMENDATION FACTS (explicit structure only; recommendations, not decisions):\nTOP-LEVEL PROBLEMS (problem nodes that are caused by something and do not themselves cause another node):\n".concat(formatTitleList(facts.topLevelProblems), "\n\nSTANDALONE PROBLEMS (problem nodes with no explicit causes edges in or out):\n").concat(formatTitleList(facts.standaloneProblems), "\n\nUPSTREAM PROBLEM CAUSES (problem nodes that are the source of an explicit causes edge):\n").concat(formatTitleList(facts.upstreamCauses), "\n\nUNRESOLVED CAUSES (upstream problem causes with no incoming solves edge):\n").concat(formatTitleList(facts.unresolvedCauses), "\n\nCAUSES THAT ALREADY HAVE A SOLUTION:\n").concat(formatTitleList(facts.solvedCauses), "\n\nSOLUTION COVERAGE GAPS (unresolved actionable problem causes, else unresolved standalone problems; not an impact ranking):\n").concat(formatTitleList(facts.coverageGaps), "\n\nTOP-LEVEL PROBLEMS WITH NO DIRECT SOLUTION WHOSE UPSTREAM CAUSES ARE SOLVED:\n").concat(coveredLines, "\n\nRANKING ATTRIBUTES FOUND IN NODE TITLE/DESCRIPTION:\n").concat(rankingLines);
}
function isRecommendationIntent(intent) {
    return (intent === "focus_recommendation" ||
        intent === "next_step" ||
        intent === "unresolved_recommendation" ||
        intent === "solution_coverage" ||
        intent === "other_recommendation");
}
function hasCanvasModificationIntent(transcript) {
    return /\b(add|create|connect|delete|remove|rename|update|capture|insert|draw)\b/.test(transcript);
}
function isQuestionLike(transcript) {
    return (transcript.includes("?") ||
        /^(what|which|who|where|why|how|summarize|list)\b/.test(transcript));
}
function classifyGraphInsightIntent(transcript) {
    var text = transcript.trim().toLowerCase();
    if (!text) {
        return "action";
    }
    if (hasCanvasModificationIntent(text)) {
        return "action";
    }
    if (/\b(biggest|clearest|largest|widest)\s+(coverage\s+)?gap\b/.test(text) ||
        /\bcoverage gap\b/.test(text) ||
        /\bwhere (do we have|is) (the )?\b/.test(text) && /\bgap\b/.test(text) ||
        /\bmissing (a )?solution/.test(text) && /\b(where|which|what)\b/.test(text)) {
        return "solution_coverage";
    }
    if (/\bwhat should (we|i) do about\b/.test(text) ||
        /\bwhy\b/.test(text) && /\brecommend/.test(text)) {
        return "other_recommendation";
    }
    if (/\b(address next|tackle next|fix next|work on next)\b/.test(text) ||
        /\bwhat should we address\b/.test(text) ||
        /\bwhich issue should we tackle\b/.test(text)) {
        return "unresolved_recommendation";
    }
    if (/\b(do next|next step|tackle first|do first|fix first|start (with|on)|work on first)\b/.test(text) ||
        /\bwhat should we priorit/.test(text)) {
        return "next_step";
    }
    if (/\b(what|where|which)\b/.test(text) && /\bfocus\b/.test(text) ||
        /\bshould we focus\b/.test(text) ||
        /\bwhich (issue|problem|cause)\b/.test(text) &&
            /\b(work on|tackle|address|priorit)\b/.test(text)) {
        return "focus_recommendation";
    }
    if (/\bwhat would you recommend\b/.test(text) ||
        /\bwhat do you recommend\b/.test(text) ||
        /\brecommend(?:ation)?\b/.test(text) &&
            isQuestionLike(text)) {
        return "other_recommendation";
    }
    if (/\bsummarize\b/.test(text) && /\b(workspace|canvas|graph)\b/.test(text)) {
        return "workspace_summary";
    }
    if (/\bevidence\b/.test(text) || /\bsupports that\b/.test(text)) {
        return "evidence";
    }
    if (/\b(biggest|most important|highest priority|most severe|fix first|do first)\b/.test(text)) {
        return "ranking";
    }
    if (/\bunresolved\b/.test(text) ||
        /\bstill open\b/.test(text) ||
        /\bwithout a solution\b/.test(text) ||
        /\bnot (yet )?solved\b/.test(text) ||
        /\bwhat should we fix\b/.test(text)) {
        return "unresolved_problems";
    }
    if (/\balready have solutions\b/.test(text) ||
        /\bproblems with solutions\b/.test(text) ||
        /\bwhich problems\b/.test(text) && /\bsolution/.test(text)) {
        return "problems_with_solutions";
    }
    if (/\bwhat solutions\b/.test(text) ||
        /\bwhich solutions\b/.test(text) ||
        /\bsolutions do we have\b/.test(text)) {
        return "solutions";
    }
    if (/\bmain causes\b/.test(text) ||
        /\bwhat(?:'s| is| are) causing\b/.test(text) ||
        /\bcauses do we\b/.test(text)) {
        return "main_causes";
    }
    if (/\bmain problems\b/.test(text) ||
        /\bwhat(?:'s| is| are) the problems\b/.test(text) ||
        /\bwhich problems\b/.test(text)) {
        return "main_problems";
    }
    if (isQuestionLike(text) && /\b(graph|canvas|workspace|node|cause|solution)\b/.test(text)) {
        return "other_insight";
    }
    return "action";
}
function isReadOnlyInsightRequest(transcript) {
    var intent = classifyGraphInsightIntent(transcript);
    return intent !== "action";
}
function logGraphInsight(intent, facts, actions) {
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
function logGraphRecommendation(intent, facts, actions) {
    if (process.env.NODE_ENV === "production") {
        return;
    }
    console.log("=== ECHO GRAPH RECOMMENDATION ===");
    console.log("Intent:", intent);
    console.log("Coverage gaps:", facts.coverageGaps);
    console.log("Unresolved causes:", facts.unresolvedCauses);
    console.log("Solved causes:", facts.solvedCauses);
    console.log("Top-level:", facts.topLevelProblems);
    console.log("Top-level unresolved with solved causes:", facts.topLevelUnresolvedWithSolvedCauses);
    console.log("Ranking attributes:", facts.rankingAttributesPresent);
    console.log("Actions:", JSON.stringify(actions, null, 2));
    console.log("=================================");
}
function buildGraphContext(nodes, edges) {
    var graphNodes = [];
    var titlesById = new Map();
    for (var _i = 0, _a = nodes !== null && nodes !== void 0 ? nodes : []; _i < _a.length; _i++) {
        var node = _a[_i];
        if (typeof (node === null || node === void 0 ? void 0 : node.id) !== "string" ||
            node.id.length === 0 ||
            typeof node.title !== "string" ||
            node.title.length === 0) {
            continue;
        }
        var graphNode = {
            id: node.id,
            title: node.title,
        };
        if (typeof node.nodeType === "string" && node.nodeType.length > 0) {
            graphNode.nodeType = node.nodeType;
        }
        if (typeof node.description === "string" &&
            node.description.length > 0) {
            graphNode.description = node.description;
        }
        graphNodes.push(graphNode);
        titlesById.set(node.id, node.title);
    }
    var graphEdges = [];
    for (var _b = 0, _c = edges !== null && edges !== void 0 ? edges : []; _b < _c.length; _b++) {
        var edge = _c[_b];
        var source = edge === null || edge === void 0 ? void 0 : edge.sourceId;
        var target = edge === null || edge === void 0 ? void 0 : edge.targetId;
        if (typeof source !== "string" ||
            source.length === 0 ||
            typeof target !== "string" ||
            target.length === 0 ||
            !titlesById.has(source) ||
            !titlesById.has(target)) {
            continue;
        }
        var graphEdge = {
            source: source,
            target: target,
            sourceTitle: titlesById.get(source),
            targetTitle: titlesById.get(target),
        };
        if (typeof edge.relationship === "string" &&
            edge.relationship.length > 0) {
            graphEdge.relationship = edge.relationship;
        }
        graphEdges.push(graphEdge);
    }
    return {
        nodes: graphNodes,
        edges: graphEdges,
    };
}
