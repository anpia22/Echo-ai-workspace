import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerSupabaseClient } from "../lib/persistence/server/db";
import { isAdmin } from "../lib/admin/adminAuth";
import { loadAdminStats, type AdminStats, type DayCount } from "../lib/admin/adminStats";

// Always fresh, never cached, never indexed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

async function requireAdmin() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (
      !user ||
      !isAdmin(
        { id: user.id, email: user.email, emailConfirmed: Boolean(user.email_confirmed_at) },
        { ADMIN_USER_IDS: process.env.ADMIN_USER_IDS, ADMIN_EMAILS: process.env.ADMIN_EMAILS }
      )
    ) {
      notFound();
    }
  } catch (error) {
    // notFound() signals by throwing; let it through. Anything else also looks like a 404.
    if (error && typeof error === "object" && "digest" in error) throw error;
    notFound();
  }
}

const fmtMs = (ms: number | null) => (ms === null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

const LEVEL_STYLE: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  idle: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  degraded: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  down: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
};

function Pill({ level, children }: { level: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_STYLE[level] ?? LEVEL_STYLE.idle}`}>
      {children}
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white">{value}</div>
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      {hint && <div className="text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</div>}
    </div>
  );
}

/** Accessible bar series: each bar carries its date and value as text. */
function Bars({ data, label }: { data: DayCount[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <figure>
      <div className="flex h-24 items-end gap-1" role="img" aria-label={`${label}, last ${data.length} days`}>
        {data.map((d) => (
          <div key={d.day} className="flex h-full flex-1 items-end" title={`${d.day}: ${d.count}`}>
            <div
              className="w-full rounded-t bg-blue-500/80 dark:bg-blue-400/80"
              style={{ height: `${Math.max(d.count > 0 ? 6 : 2, (d.count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>{data[0]?.day.slice(5)}</span>
        <span>
          {label} · peak {max === 1 && data.every((d) => d.count === 0) ? 0 : max}
        </span>
        <span>{data[data.length - 1]?.day.slice(5)}</span>
      </figcaption>
    </figure>
  );
}

function Dashboard({ s }: { s: AdminStats }) {
  const total14d = s.ai.requestsPerDay.reduce((a, d) => a + d.count, 0);
  const newUsers14d = s.users.newPerDay.reduce((a, d) => a + d.count, 0);
  const newWs14d = s.workspaces.newPerDay.reduce((a, d) => a + d.count, 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Health">
        <div className="flex flex-wrap gap-2">
          <Pill level={s.health.database ? "ok" : "down"}>Database {s.health.database ? "reachable" : "down"}</Pill>
          <Pill level={s.health.aiKeyConfigured ? "ok" : "down"}>
            AI key {s.health.aiKeyConfigured ? "configured" : "missing"}
          </Pill>
          <Pill level={s.health.ai15m.level}>AI last 15 min: {s.health.ai15m.level}</Pill>
        </div>
        {s.health.ai15m.reasons.length > 0 && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{s.health.ai15m.reasons.join("; ")}</p>
        )}
      </Card>

      <Card title="Users">
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Total" value={s.users.total} hint={s.users.truncated ? "first 10,000 only" : undefined} />
          <Stat label="Signed in, last 7 days" value={s.users.active7d} />
          <Stat label="New, last 14 days" value={newUsers14d} />
        </div>
        <Bars data={s.users.newPerDay} label="New users per day" />
      </Card>

      <Card title="Workspaces">
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Workspaces" value={s.workspaces.total} />
          <Stat label="Active, last 7 days" value={s.workspaces.active7d} />
          <Stat label="New, last 14 days" value={newWs14d} />
          <Stat label="Memberships" value={s.workspaces.members} />
          <Stat label="Conversations" value={s.workspaces.conversations} />
          <Stat label="Meetings / rooms" value={`${s.workspaces.meetings} / ${s.workspaces.rooms}`} />
        </div>
        <Bars data={s.workspaces.newPerDay} label="New workspaces per day" />
      </Card>

      <Card title="AI requests">
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Last 24 h" value={s.ai.last24h.total} />
          <Stat label="Failure rate (24 h)" value={fmtPct(s.ai.last24h.failureRate)} />
          <Stat label="Last 14 days" value={total14d} hint={s.ai.truncated ? "capped at 20,000" : undefined} />
          <Stat label="Average latency" value={fmtMs(s.ai.avgLatencyMs)} />
          <Stat label="p95 latency (24 h)" value={fmtMs(s.ai.last24h.p95LatencyMs)} />
          <Stat label="Slowest (24 h)" value={fmtMs(s.ai.last24h.maxLatencyMs)} />
        </div>
        <Bars data={s.ai.requestsPerDay} label="AI requests per day" />
        {s.ai.last24h.topErrorCodes.length > 0 && (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Top error codes (24 h):{" "}
            {s.ai.last24h.topErrorCodes.map((e) => `${e.code} ×${e.count}`).join(", ")}
          </p>
        )}
      </Card>

      <div className="md:col-span-2">
        <Card title="Heaviest AI users, last 7 days">
          {s.ai.topActors.length === 0 ? (
            <p className="text-sm text-zinc-500">No AI requests yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="pb-1 font-medium">Who (short id)</th>
                  <th className="pb-1 font-medium">Type</th>
                  <th className="pb-1 text-right font-medium">Requests</th>
                  <th className="pb-1 text-right font-medium">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {s.ai.topActors.map((a) => (
                  <tr key={`${a.kind}-${a.label}`}>
                    <td className="py-1.5 font-mono text-xs">{a.label}</td>
                    <td className="py-1.5">{a.kind === "user" ? "Signed-in user" : "Visitor (IP hash)"}</td>
                    <td className="py-1.5 text-right tabular-nums">{a.requests}</td>
                    <td className="py-1.5 text-right tabular-nums">{a.failures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

export default async function AdminPage() {
  await requireAdmin();

  let stats: AdminStats | null = null;
  let failure: string | null = null;
  try {
    stats = await loadAdminStats(getServerSupabaseClient());
  } catch (error) {
    failure = error instanceof Error ? error.message : "Could not load admin data";
  }

  return (
    <main className="min-h-dvh bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-zinc-950 dark:text-white">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold">Echo admin</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Read-only · counts and metadata only, never conversation, canvas or transcript content
            {stats && ` · updated ${new Date(stats.generatedAt).toLocaleTimeString()}`}
          </p>
        </header>

        {stats ? (
          <Dashboard s={stats} />
        ) : (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            Could not load admin data: {failure}
          </div>
        )}
      </div>
    </main>
  );
}
