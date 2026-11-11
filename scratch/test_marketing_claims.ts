/**
 * Marketing and legal copy must match the product. This guards the claims that went stale once:
 * a room link no longer grants access, an account is needed for workspaces, and the privacy policy
 * must disclose public links, usage records, the call relay and what the admin page shows.
 *
 * Run: npx tsx scratch/test_marketing_claims.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx?|md)$/.test(name)) out.push(rel);
  }
  return out;
}

// Copy that readers see: marketing pages and components, the blog and FAQ data, robots/llms/ai.txt.
const copyFiles = [
  ...walk("src/app/(marketing)"),
  ...walk("src/app/components/marketing"),
  "src/lib/blog.ts",
  "src/lib/geo.ts",
  "src/app/llms.txt/route.ts",
  "src/app/ai.txt/route.ts",
];

console.log("stale claims are gone");
const STALE: Array<[string, RegExp]> = [
  ["a room link grants access to a workspace", /room link grants access/i],
  ["anyone with the room link can join", /anyone with the room link/i],
  ["no account needed to view a room", /not require an account to try or view a room/i],
  ["sharing a room link to invite people", /share a room link to invite/i],
  ["a shared room link is the workspace", /shared room link is the workspace/i],
  ["workspace permission levels listed as future work", /roadmap: workspace permission levels/i],
  ["joining from a room link", /join from a room link/i],
];
for (const [label, re] of STALE) {
  const hits = copyFiles.filter((f) => re.test(read(f)));
  check(`no page says: ${label}`, hits.length === 0, hits.join(", "));
}

console.log("the privacy policy discloses what the product does");
const privacy = read("src/app/(marketing)/privacy/page.tsx");
check("workspaces need sign-in; the demo does not", /try the demo on the home page without an account/i.test(privacy) && /To use a workspace you sign in/i.test(privacy));
check("members, roles and invitations are described", /role \(owner, admin, editor or viewer\)/i.test(privacy) && /Invitations and public links/i.test(privacy));
check("public links are explained as different from workspace access", /A public link is different/i.test(privacy) && /until it expires or you turn it off/i.test(privacy));
check("only a hash of secret links is stored, and it says so", /one-way hash of each secret link/i.test(privacy));
check("usage records are disclosed, with what they contain and do not contain", /Usage records for AI requests/i.test(privacy) && /no message, canvas or transcript content/i.test(privacy));
check("the call relay is disclosed", /relay server/i.test(privacy) && /call relay provider/i.test(privacy));
check("what the admin page can and cannot see is stated", /admin page/i.test(privacy) && /does not show conversation, canvas or transcript content/i.test(privacy));
check("queued changes in the browser are mentioned", /waiting to be saved while your connection is down/i.test(privacy));
check("public links stop working when expired or turned off", /Public links stop working as soon as they expire or are turned off/i.test(privacy));
const terms = read("src/app/(marketing)/terms/page.tsx");
check("the terms say workspaces are private to members and explain public links", /Workspaces are private to their members/i.test(terms) && /public link, anyone who has it can read/i.test(terms));
check("both policies carry a current date", /UPDATED = "November 11, 2026"/.test(read("src/app/(marketing)/privacy/page.tsx")) && /UPDATED = "November 11, 2026"/.test(terms));

console.log("the new features are described");
const geo = read("src/lib/geo.ts");
check("the team FAQ talks about invites and roles", /invite teammates with a link/i.test(geo) && /edit or only view/i.test(geo));
check("an FAQ answers sharing outside the team", /Can I share a conversation with someone outside my team\?/.test(geo) && /cannot edit it/i.test(geo));
check("an FAQ answers who can see a workspace", /Who can see my workspace\?/.test(geo));
check("the feature list includes the new capabilities", /Team invites with editor and viewer roles/.test(geo) && /Read-only public links/.test(geo) && /Undo and redo of your own changes/.test(geo));
const pricing = read("src/app/components/marketing/PricingSection.tsx") + read("src/app/(marketing)/pricing/page.tsx");
check("pricing lists roles as built, not as roadmap", /Editor and viewer roles, managed by owners and admins/.test(pricing) && /Invite links and live team rooms/.test(pricing));
check("pricing answers sharing outside the team", /share a conversation with people outside my team/i.test(pricing));
const section = read("src/app/components/marketing/TeamAndTrustSection.tsx");
check("the team section has all six capabilities", ["Invite your team", "Share one conversation", "Live rooms", "Undo that respects", "dropped connections", "AI struggles"].every((t) => section.includes(t)));
check("it appears on the home page and on how-it-works", /TeamAndTrustSection/.test(read("src/app/(marketing)/page.tsx")) && /BringInYourTeamSection/.test(read("src/app/(marketing)/how-it-works/page.tsx")));
check("the about page has teams, sharing and resilience", /title: "Teams"/.test(read("src/app/(marketing)/about/page.tsx")) && /title: "Sharing"/.test(read("src/app/(marketing)/about/page.tsx")) && /title: "Resilience"/.test(read("src/app/(marketing)/about/page.tsx")));

console.log("crawlers and AI");
const site = read("src/lib/site.ts");
check("shared conversations, invites and the admin page are blocked for crawlers", /PRIVATE_PATHS = \[[^\]]*"\/share\/"[^\]]*"\/invite\/"[^\]]*"\/admin"/.test(site));
check("llms.txt and ai.txt say shared pages are not for indexing or training", /\/share\/ are conversations that individual users published/.test(read("src/app/llms.txt/route.ts")) && /shared conversation pages \(\/share\/\)/.test(read("src/app/ai.txt/route.ts")));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
