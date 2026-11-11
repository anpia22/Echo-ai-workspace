import { BentoCard, BentoGrid, Icons, SectionHeader } from "./ui";

/**
 * Copy here describes only what Echo does today. If a feature changes, change the words with it.
 */

const CAPABILITIES = [
  {
    title: "Invite your team, with the right access",
    body: "Send an invite link and choose whether people can edit or only view. Owners and admins manage roles, and viewers get a read-only canvas.",
    icon: Icons.users,
  },
  {
    title: "Share one conversation, read-only",
    body: "Publish a single conversation and its canvas as a link anyone can read without an account. They can't edit, links expire, and you can turn one off at any time.",
    icon: Icons.link,
  },
  {
    title: "Live rooms for your workspace",
    body: "Presence, live cursors and calls are for the people in your workspace. When a direct call can't connect, Echo uses a relay so more people can join from offices and phones.",
    icon: Icons.video,
  },
  {
    title: "Undo that respects your team",
    body: "Undo and redo reverse only your own changes. If a teammate renamed a node after you moved it, their rename stays.",
    icon: Icons.undo,
  },
  {
    title: "Keeps your work through dropped connections",
    body: "If your connection drops, your edits and messages wait on your device and save automatically, in order, when you're back.",
    icon: Icons.wifi,
  },
  {
    title: "Clear when the AI struggles",
    body: "Slow or busy moments are retried automatically. If it still fails you get a plain message and a Retry button, and what you wrote is kept.",
    icon: Icons.refresh,
  },
];

/** Home page: what a team gets. */
export function TeamAndTrustSection() {
  return (
    <section className="py-14 sm:py-20">
      <SectionHeader
        eyebrow="Built for teams"
        title="Everything a team needs to decide together"
        subtitle="Access you control, sharing you choose, and a workspace that holds up when things go wrong."
      />
      <BentoGrid>
        {CAPABILITIES.map((item) => (
          <BentoCard key={item.title} title={item.title} body={item.body} icon={item.icon} />
        ))}
      </BentoGrid>
    </section>
  );
}

const TOGETHER = [
  {
    title: "Invite people",
    body: "Create an invite link from the Members panel. Choose whether people can edit or only view, and change their role any time.",
    icon: Icons.users,
  },
  {
    title: "Think side by side",
    body: "Open a live room to see who is present, follow a presenter and talk it through. If you misstep, undo only your own changes.",
    icon: Icons.video,
  },
  {
    title: "Share what you decided",
    body: "Publish one conversation and its canvas as a read-only link for people outside the workspace. Set an expiry and turn it off whenever you like.",
    icon: Icons.link,
  },
];

/** How-it-works page: what happens after the first idea. */
export function BringInYourTeamSection() {
  return (
    <section className="py-14 sm:py-20">
      <SectionHeader
        eyebrow="Then, together"
        title="Bring in your team when you're ready"
        subtitle="Start alone. When the idea is worth discussing, invite people and decide together."
      />
      <BentoGrid>
        {TOGETHER.map((item) => (
          <BentoCard key={item.title} title={item.title} body={item.body} icon={item.icon} />
        ))}
      </BentoGrid>
    </section>
  );
}
