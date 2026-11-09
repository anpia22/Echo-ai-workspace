"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  canManageMembers,
  decideRemoval,
  decideRoleChange,
  type InvitableRole,
} from "../../lib/invites/inviteLogic";
import type { WorkspaceMemberRole } from "../../lib/persistence/workspaceTypes";

type Member = { userId: string; displayName: string; role: WorkspaceMemberRole; color: string };
type Invite = {
  id: string;
  role: InvitableRole;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
};

type Props = { workspaceId: string; onClose: () => void };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  return body as T;
}

export function MembersDialog({ workspaceId, onClose }: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<{ userId: string; role: WorkspaceMemberRole } | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newRole, setNewRole] = useState<InvitableRole>("editor");
  const [newDays, setNewDays] = useState(7);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isManager = me ? canManageMembers(me.role) : false;

  const load = useCallback(async () => {
    try {
      const m = await api<{ members: Member[]; you: { userId: string; role: WorkspaceMemberRole } }>(
        `/api/workspace/${workspaceId}/members`
      );
      setMembers(m.members);
      setMe(m.you);
      if (canManageMembers(m.you.role)) {
        const i = await api<{ invites: Invite[] }>(`/api/workspace/${workspaceId}/invites`);
        setInvites(i.invites);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load members");
    }
  }, [workspaceId]);

  useEffect(() => {
    setMounted(true);
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const createLink = () =>
    run(async () => {
      const r = await api<{ token: string }>(`/api/workspace/${workspaceId}/invites`, {
        method: "POST",
        body: JSON.stringify({ role: newRole, expiresInDays: newDays }),
      });
      setFreshLink(`${window.location.origin}/invite/${r.token}`);
      setCopied(false);
    });

  const copyLink = async () => {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink);
      setCopied(true);
    } catch {
      setError("Could not copy automatically. Select the link and copy it.");
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id={titleId} className="text-sm font-semibold text-zinc-900 dark:text-white">
            Members
          </h2>
          <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
            Close
          </button>
        </div>

        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {members.map((m) => {
            const isMe = me?.userId === m.userId;
            const canChange =
              me &&
              decideRoleChange({
                actorRole: me.role,
                actorUserId: me.userId,
                targetUserId: m.userId,
                targetRole: m.role,
                newRole: "editor",
              }).ok;
            const canRemove =
              me &&
              decideRemoval({
                actorRole: me.role,
                actorUserId: me.userId,
                targetUserId: m.userId,
                targetRole: m.role,
              }).ok;
            return (
              <li key={m.userId} className="flex items-center gap-2 py-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                <span className="min-w-0 flex-1 truncate text-zinc-900 dark:text-zinc-100">
                  {m.displayName}
                  {isMe && <span className="text-zinc-400"> (you)</span>}
                </span>
                {canChange ? (
                  <select
                    aria-label={`Role for ${m.displayName}`}
                    disabled={busy}
                    value={m.role === "viewer" ? "viewer" : "editor"}
                    onChange={(e) =>
                      run(async () => {
                        await api(`/api/workspace/${workspaceId}/members/${m.userId}`, {
                          method: "PATCH",
                          body: JSON.stringify({ role: e.target.value }),
                        });
                      })
                    }
                    className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <span className="capitalize text-zinc-500">{m.role}</span>
                )}
                {canRemove && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      const msg = isMe ? "Leave this workspace?" : `Remove ${m.displayName}?`;
                      if (!window.confirm(msg)) return;
                      run(async () => {
                        await api(`/api/workspace/${workspaceId}/members/${m.userId}`, { method: "DELETE" });
                        if (isMe) window.location.href = "/app";
                      });
                    }}
                    className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                  >
                    {isMe ? "Leave" : "Remove"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {isManager && (
          <section className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <h3 className="mb-2 text-xs font-semibold text-zinc-900 dark:text-white">Invite people</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                aria-label="Role for invitees"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as InvitableRole)}
                className="rounded border border-zinc-200 bg-white px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <select
                aria-label="Link lifetime"
                value={newDays}
                onChange={(e) => setNewDays(Number(e.target.value))}
                className="rounded border border-zinc-200 bg-white px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value={1}>Expires in 1 day</option>
                <option value={7}>Expires in 7 days</option>
                <option value={30}>Expires in 30 days</option>
              </select>
              <button
                disabled={busy}
                onClick={createLink}
                className="rounded-lg bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Create link
              </button>
            </div>

            {freshLink && (
              <div className="mt-3">
                <p className="mb-1 text-[11px] text-zinc-500">
                  Copy this link now. For security it is not shown again.
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={freshLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                  />
                  <button onClick={copyLink} className="rounded border border-zinc-200 px-2 text-xs dark:border-zinc-700">
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            {invites.length > 0 && (
              <ul className="mt-3 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span>
                      {i.role === "editor" ? "Can edit" : "Can view"} · expires{" "}
                      {new Date(i.expiresAt).toLocaleDateString()} · used {i.useCount}
                      {i.maxUses ? `/${i.maxUses}` : ""}
                    </span>
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api(`/api/workspace/${workspaceId}/invites/${i.id}`, { method: "DELETE" });
                        })
                      }
                      className="text-red-600 hover:underline dark:text-red-400"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>,
    document.body
  );
}
