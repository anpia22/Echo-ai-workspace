import { createClient } from "./client";
import type { User, Session, AuthError } from "@supabase/supabase-js";

export type AuthResult = {
  user: User | null;
  session: Session | null;
  error: AuthError | Error | null;
};

/**
 * Sign in using email and password
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return {
    user: data.user,
    session: data.session,
    error,
  };
}

/**
 * Sign up using email, password, and optional display name
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<AuthResult> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName?.trim() || email.split("@")[0],
      },
    },
  });

  return {
    user: data.user,
    session: data.session,
    error,
  };
}

/**
 * Initiate OAuth sign in (Google, GitHub, etc.) with PKCE redirect
 */
export async function signInWithOAuth(
  provider: "google" | "github",
  redirectTo?: string
): Promise<{ error: AuthError | null }> {
  const supabase = createClient();
  const callbackUrl = new URL(
    "/auth/callback",
    typeof window !== "undefined" ? window.location.origin : ""
  );

  if (redirectTo) {
    callbackUrl.searchParams.set("next", redirectTo);
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  return { error };
}

/**
 * Sign out current user session
 */
export async function signOut(): Promise<{ error: AuthError | null }> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Get current client session user
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
