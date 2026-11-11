import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { withSeo } from "@/lib/seo";

export const metadata: Metadata = withSeo("/privacy", {
  title: "Privacy Policy",
  description:
    "How Echo handles workspace content, meetings, transcripts, and the information sent to the AI provider.",
  openGraph: {
    title: "Privacy Policy",
    description:
      "How Echo handles workspace content, meetings, transcripts, and the information sent to the AI provider.",
    type: "website",
  },
});

const UPDATED = "November 11, 2026";

export default function PrivacyPage() {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <header className="flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Privacy
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="text-sm text-zinc-500">Last updated {UPDATED}</p>
        <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Echo is a collaborative AI workspace. This policy explains what the
          product stores, who else can see it, and which providers process it
          so the workspace, the meeting, and the AI can work.
        </p>
      </header>

      <Section title="What Echo is">
        <p>
          Echo lets people talk through a problem, keep the structure on a
          shared canvas, and meet in the same room. The operator of the Echo
          site you are using is responsible for this deployment. This policy
          describes the product as it works today.
        </p>
      </Section>

      <Section title="Information the product handles">
        <p>Depending on how you use a room, Echo handles:</p>
        <ul>
          <li>
            A display name and a participant id, so other people in the room
            can see who is present.
          </li>
          <li>
            Workspace content you create: conversations, canvas nodes, groups,
            edges, and related workspace records.
          </li>
          <li>
            Meeting participation. Audio, video, and screen sharing are sent
            directly between people in the room with WebRTC. Echo uses a
            realtime service to coordinate the room. The media itself is not a
            file Echo saves as a recording.
          </li>
          <li>
            Transcript text. Speech in a meeting can be turned into text so the
            workspace can keep context. That text can be stored with the
            workspace.
          </li>
          <li>
            Account details you give when signing in, such as your email
            address and display name, and which workspaces you belong to and in
            what role (owner, admin, editor or viewer).
          </li>
          <li>
            Invitations and public links. Echo stores only a one-way hash of
            each secret link, who created it, when it expires, and whether it
            was turned off.
          </li>
          <li>
            Usage records for AI requests: which account (or, for visitors who
            are not signed in, a one-way hash of the network address), which
            feature and model, when, how long it took and whether it worked.
            They contain no message, canvas or transcript content. They are
            used to run the service, limit abuse and understand load.
          </li>
          <li>
            Changes that are waiting to be saved while your connection is down.
            They are held in your browser until they are saved.
          </li>
          <li>
            A theme preference and, on older browsers, a local copy of
            conversations kept in your browser until it is moved to the
            workspace.
          </li>
        </ul>
        <p>
          You can try the demo on the home page without an account. To use a
          workspace you sign in with an email link or a provider, so your
          workspaces follow you across devices. Echo does not run third-party
          advertising or analytics cookies.
        </p>
      </Section>

      <Section title="How that information is used">
        <p>Echo uses this information to:</p>
        <ul>
          <li>Show the shared canvas and keep a room in sync.</li>
          <li>Show presence, cursors, and who is presenting.</li>
          <li>Connect an audio, video, or screen-share meeting inside the workspace.</li>
          <li>
            Use a relay server so a call can connect when a direct connection is
            not possible. The relay forwards encrypted call media; it can see
            technical details such as network addresses and timing.
          </li>
          <li>
            Send the relevant conversation, canvas context, and transcript
            excerpts to the AI model so Echo can reply and suggest canvas
            changes.
          </li>
          <li>Remember your light or dark theme on this browser.</li>
        </ul>
      </Section>

      <Section title="Who else can see it">
        <p>
          People you invite can join your workspace as editors or viewers, and
          live rooms are limited to signed-in members of that workspace. Members
          can see the shared canvas, presence, and meeting, within their role. A
          public link is different: anyone who has it can read the one
          conversation and canvas you published, without signing in, until it
          expires or you turn it off. Do not put secrets on a canvas, do not
          publish what you would not show to everyone, and do not share a screen
          you would not show to every person in the room.
        </p>
        <p>Operators and providers that process data for the product:</p>
        <ul>
          <li>
            Supabase stores workspace records and carries realtime room
            updates.
          </li>
          <li>
            NVIDIA processes the prompts Echo sends to the Nemotron model,
            including the conversation and workspace context needed to generate
            responses. Under NVIDIA&apos;s developer API terms, prompt and workspace
            inputs are processed ephemerally and are not retained or used by NVIDIA
            to train foundation models.
          </li>
          <li>
            A speech-to-text provider may process meeting audio when
            transcription is on, and Echo keeps the resulting text.
          </li>
          <li>
            A call relay provider, when the operator has set one up, forwards
            encrypted call media when a direct connection is not possible.
          </li>
        </ul>
        <p>
          The operator can see totals and usage statistics, for example how
          many accounts and AI requests there are, on an admin page. That page
          does not show conversation, canvas or transcript content.
        </p>
        <p>
          Echo does not sell personal information. Content is shared with a
          provider only so the workspace, the meeting, or the AI response can
          function.
        </p>
      </Section>

      <Section title="How long it stays">
        <p>
          Workspace content stays until it is deleted from that workspace or
          the deployment removes it. A browser copy used for theme or for moving
          older conversations stays on that device until you clear site data.
          Meeting audio and video are live between participants and are not
          kept as a recording by Echo. Transcript text that was saved with the
          workspace remains with that workspace. Public links stop working as
          soon as they expire or are turned off. Usage records are kept for
          operating and protecting the service.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          You choose what to type, what to say, and what to put on a shared
          screen. Owners and admins can remove members, change roles and turn
          public links off. You can leave a room, stop a screen share, and
          clear this site&apos;s data in your browser. To ask for access to or deletion of
          workspace content stored on the server, email{" "}
          <a href="mailto:echoaiworkspace@gmail.com">echoaiworkspace@gmail.com</a>.
          Echo is run by Anup, the founder.
        </p>
        <p>
          If the privacy law where you live gives you rights to access, correct,
          delete, or export personal information, you can use that same email
          address to make the request. Some records may be kept when the operator
          needs them for security or to meet a legal duty.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Echo is not directed at children under 16, and it should not be used
          to collect information from a child.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes, the updated version will be posted on this
          page with a new date. Continued use of the workspace after that date
          means the current policy applies to new use.
        </p>
        <p>
          The{" "}
          <Link
            href="/terms"
            className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
          >
            terms and conditions
          </Link>{" "}
          cover how you may use the product.
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
