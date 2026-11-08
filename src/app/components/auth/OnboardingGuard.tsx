"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  cacheProfileName,
  getSuggestedName,
  isOnboarded,
} from "@/lib/supabase/profile";
import { ProfileDialog } from "./ProfileDialog";

type GuardState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "onboarding"; user: User };

/**
 * Holds the workspace app back until the signed-in user has confirmed a display
 * name, so the room never joins with a placeholder like "User 4821".
 * Signed-out visitors (demo mode) and auth lookup failures pass straight through.
 */
export function OnboardingGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GuardState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        const user = data.user;
        if (!user) {
          setState({ status: "ready" });
        } else if (isOnboarded(user)) {
          cacheProfileName(user);
          setState({ status: "ready" });
        } else {
          setState({ status: "onboarding", user });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "ready" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <div className="h-dvh bg-slate-50 dark:bg-zinc-950" aria-busy="true" />;
  }

  if (state.status === "onboarding") {
    return (
      <div className="h-dvh bg-slate-50 dark:bg-zinc-950">
        <ProfileDialog
          mode="onboarding"
          userId={state.user.id}
          initialName={getSuggestedName(state.user)}
          onSaved={() => setState({ status: "ready" })}
        />
      </div>
    );
  }

  return <>{children}</>;
}
