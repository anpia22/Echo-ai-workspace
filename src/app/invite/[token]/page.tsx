"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type State =
  | { kind: "working" }
  | { kind: "error"; message: string };

/**
 * Landing page for an invite link. Signed-out visitors go through /login and come back here;
 * signed-in visitors join the workspace and are sent straight into it.
 */
export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token ?? "";
  const [state, setState] = useState<State>({ kind: "working" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
        return;
      }

      try {
        const res = await fetch("/api/invites/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState({ kind: "error", message: body?.error?.message ?? "Could not accept this invite." });
          return;
        }
        try {
          window.localStorage.setItem("echo_last_active_workspace_id", body.workspaceId);
        } catch {
          // the ?workspace= parameter below is enough
        }
        router.replace(`/app?workspace=${encodeURIComponent(body.workspaceId)}`);
      } catch {
        setState({ kind: "error", message: "Network error. Check your connection and try again." });
      }
    })();
  }, [token, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {state.kind === "working" ? (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-white">Joining workspace…</h1>
          </>
        ) : (
          <>
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-white">Invite problem</h1>
            <p role="alert" className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {state.message}
            </p>
            <Link
              href="/app"
              className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
            >
              Go to my workspaces
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
