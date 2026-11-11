"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import EchoCanvas from "../../components/EchoCanvas";
import type { PublicView } from "../../lib/share/shareLogic";

const POLL_MS = 5_000;
const PAUSE_ON_LIMIT_MS = 30_000;

type Status = "loading" | "live" | "reconnecting" | "gone";

/**
 * Read-only public view of ONE conversation: its discussion and its own canvas, for anyone with
 * the link.
 * No sign-in, no editing, no live channel: it re-checks every few seconds and only downloads
 * the content again when it changed.
 */
export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [view, setView] = useState<PublicView | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const etagRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const poll = useCallback(async () => {
    if (stoppedRef.current) return;
    let nextDelay = POLL_MS;
    try {
      const url = `/api/public/${encodeURIComponent(token)}${etagRef.current ? `?v=${encodeURIComponent(etagRef.current)}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 404) {
        stoppedRef.current = true;
        setStatus("gone");
        return;
      }
      if (res.status === 429) {
        nextDelay = PAUSE_ON_LIMIT_MS;
        setStatus("reconnecting");
      } else if (!res.ok) {
        setStatus("reconnecting");
      } else {
        const body = await res.json();
        if (!body.unchanged) {
          etagRef.current = body.etag;
          setView(body as PublicView);
        }
        setStatus("live");
      }
    } catch {
      setStatus("reconnecting");
    }
    if (!stoppedRef.current) timerRef.current = setTimeout(poll, nextDelay);
  }, [token]);

  useEffect(() => {
    stoppedRef.current = false;
    void poll();

    // Do not poll while the tab is hidden.
    const onVisibility = () => {
      if (document.hidden) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
      } else if (!stoppedRef.current && timerRef.current === null) {
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [poll]);

  const messages = view?.conversation.messages ?? [];
  const messageCount = messages.length;
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messageCount]);

  const canvas = useMemo(
    () => ({ nodes: view?.canvas.nodes ?? [], edges: view?.canvas.edges ?? [], groups: view?.canvas.groups ?? [] }),
    [view]
  );

  if (status === "gone") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-white">This link isn&apos;t available</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            It may have been turned off, or it has expired. Ask the person who shared it for a new link.
          </p>
          <Link href="/" className="mt-4 inline-block text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
            What is Echo?
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="min-w-0 max-w-[60vw] truncate text-sm font-semibold">{view?.title ?? "Shared conversation"}</h1>
        <span className="rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300">
          Public · read-only
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400" role="status">
          <span
            className={`h-1.5 w-1.5 rounded-full ${status === "live" ? "bg-emerald-500" : status === "loading" ? "bg-zinc-400" : "bg-amber-500"}`}
            aria-hidden="true"
          />
          {status === "live" ? "Live" : status === "loading" ? "Loading…" : "Reconnecting…"}
        </span>
        <Link href="/" className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400">
          Made with Echo
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section aria-label="Canvas" className="relative min-h-[45vh] min-w-0 flex-1 lg:min-h-0">
          {view ? (
            view.canvas.nodes.length > 0 ? (
              <EchoCanvas canvas={canvas} readOnly />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">The canvas is empty.</div>
            )
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</div>
          )}
        </section>

        <aside
          aria-label="Discussion"
          className="flex min-h-0 w-full shrink-0 flex-col border-t border-zinc-200 bg-white lg:w-96 lg:border-l lg:border-t-0 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Discussion</h2>
          </div>

          <div
            ref={listRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="max-h-[40vh] min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 lg:max-h-none"
          >
            {!view ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No messages yet.</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={m.role === "assistant" ? "" : "rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-900"}>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    {m.role === "assistant" ? "Echo" : "Participant"}
                  </div>
                  {/* Text only: React escapes it, nothing from a message is ever rendered as HTML. */}
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
