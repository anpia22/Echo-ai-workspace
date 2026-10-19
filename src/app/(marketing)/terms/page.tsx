import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { withSeo } from "@/lib/seo";

export const metadata: Metadata = withSeo("/terms", {
  title: "Terms and Conditions",
  description:
    "The rules for using Echo, including shared rooms, meetings, screen sharing, and AI output.",
  openGraph: {
    title: "Terms and Conditions",
    description:
      "The rules for using Echo, including shared rooms, meetings, screen sharing, and AI output.",
    type: "website",
  },
});

const UPDATED = "October 19, 2026";

export default function TermsPage() {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <header className="flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Terms
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Terms and Conditions
        </h1>
        <p className="text-sm text-zinc-500">Last updated {UPDATED}</p>
        <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          These terms are the agreement between you and the operator of this
          Echo deployment. By opening a workspace, joining a room, or using a
          meeting, you agree to them. If you do not agree, do not use Echo.
        </p>
      </header>

      <Section title="The service">
        <p>
          Echo is a collaborative AI workspace. It combines a conversation, a
          visual canvas, and a live meeting in one room. Features can change,
          and a room may be unavailable while the service is updated or
          repaired. Echo is a working product, and a session can fail or lose
          unsaved work.
        </p>
      </Section>

      <Section title="Who may use it">
        <p>
          You may use Echo if you are at least 16 and you are allowed to agree
          to these terms. If you use Echo for an organization, you confirm that
          you can accept these terms for that organization.
        </p>
      </Section>

      <Section title="Rooms and shared work">
        <p>
          A room link grants access to that workspace. You are responsible for
          who you invite. Other people in the room can see the shared canvas,
          presence, cursors, and the meeting you join. Do not rely on a room
          link as a secret if you have shared it widely.
        </p>
        <p>
          You keep ownership of the content you create. You give the operator
          permission to host that content, show it to people in the room, and
          send the parts needed for a reply to the AI provider. That permission
          lasts while the content remains on the service.
        </p>
      </Section>

      <Section title="Meetings and screen sharing">
        <p>
          Audio, video, and screen sharing are visible to the other people in
          the meeting. You are responsible for what you say and what you put on
          a shared screen, including information that belongs to someone else.
          Do not record another person unless you are allowed to.
        </p>
        <p>
          Speech may be transcribed so the workspace can keep context. Do not
          say something in a meeting that you would not want stored as text
          with that workspace.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>You will not:</p>
        <ul>
          <li>Break the law or violate someone else&apos;s rights.</li>
          <li>Harass, threaten, or impersonate another person.</li>
          <li>
            Upload or share content you do not have the right to share,
            including private information about someone who is not in the room.
          </li>
          <li>
            Interfere with the service, probe it without permission, or attempt
            to access a workspace you were not invited to.
          </li>
          <li>Use Echo to develop or distribute malware.</li>
        </ul>
        <p>
          The operator may remove content or close a room that breaks these
          terms.
        </p>
      </Section>

      <Section title="AI output">
        <p>
          Echo sends conversation, canvas context, and transcript excerpts to
          an AI model and may turn the reply into canvas changes. Output can be
          wrong, incomplete, or poorly suited to your situation. You decide
          what to keep. Do not treat Echo as legal, medical, financial, or
          other professional advice.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          The{" "}
          <Link
            href="/privacy"
            className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
          >
            privacy policy
          </Link>{" "}
          explains what the product stores and which providers process it. That
          policy is part of these terms.
        </p>
      </Section>

      <Section title="Disclaimers and liability">
        <p>
          Echo is provided as available. The operator does not promise that the
          service will be uninterrupted, that content will never be lost, or
          that AI output will be accurate. To the extent the law allows, the
          operator is not liable for indirect or consequential loss, lost
          profits, or decisions you make from workspace content or AI output.
        </p>
        <p>
          Nothing in these terms removes rights that the law where you live
          does not allow to be waived.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          The operator may update these terms by posting a new version on this
          page. The date at the top will change. If you keep using Echo after
          the update, the new terms apply to that use.
        </p>
        <p>
          This site does not publish a separate support inbox. Questions about
          these terms go to the person or organization that invited you to this
          Echo deployment.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
        {title}
      </h2>
      {children}
    </section>
  );
}
