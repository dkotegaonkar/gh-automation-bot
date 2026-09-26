"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, Delivery, Me, UnauthorizedError } from "@/lib/api";

const STATUS_STYLES: Record<Delivery["status"], string> = {
  RECEIVED: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  QUEUED: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  PROCESSING: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  PROCESSED: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  FAILED: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  IGNORED: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

export default function DashboardPage() {
  const router = useRouter();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });
  const deliveries = useQuery({
    queryKey: ["deliveries"],
    queryFn: () => api<Delivery[]>("/deliveries"),
    refetchInterval: 3000, // live log
  });

  const unauthorized = me.error instanceof UnauthorizedError || deliveries.error instanceof UnauthorizedError;
  useEffect(() => {
    if (unauthorized) router.replace("/");
  }, [unauthorized, router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/");
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">GitHub Automation Bot</h1>
        {me.data && (
          <div className="flex items-center gap-3 text-sm">
            {me.data.user.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.data.user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
            )}
            <span>{me.data.user.login}</span>
            <button onClick={logout} className="text-neutral-500 underline-offset-2 hover:underline">
              Sign out
            </button>
          </div>
        )}
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Connected repositories</h2>
          <a href="/api/auth/github/install" className="text-sm font-medium text-blue-600 hover:underline">
            + Connect repositories
          </a>
        </div>
        {me.isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : me.data?.repositories.length ? (
          <ul className="flex flex-wrap gap-2">
            {me.data.repositories.map((r) => (
              <li key={r.id} className="rounded-md border border-neutral-200 px-3 py-1 text-sm dark:border-neutral-800">
                {r.fullName}
                {r.private && <span className="ml-2 text-xs text-neutral-500">private</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">
            No repositories yet. Use “Connect repositories” to install the app on one.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Activity</h2>
          <span className="text-xs text-neutral-500">{deliveries.isFetching ? "refreshing…" : "live · every 3s"}</span>
        </div>
        {deliveries.error && !unauthorized && (
          <p role="alert" className="text-sm text-red-600">Could not load activity. Retrying…</p>
        )}
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Details</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Bot actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {deliveries.data?.length ? (
                deliveries.data.map((d) => <DeliveryRow key={d.id} d={d} />)
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                    {deliveries.isLoading ? "Loading…" : "No events yet. Open an issue on a connected repository."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function DeliveryRow({ d }: { d: Delivery }) {
  return (
    <tr className="align-top">
      <td className="whitespace-nowrap px-3 py-2 text-neutral-500">{new Date(d.receivedAt).toLocaleString()}</td>
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
        {d.event}
        {d.action ? `.${d.action}` : ""}
      </td>
      <td className="px-3 py-2">
        <div className="text-xs text-neutral-500">{d.repository}</div>
        {d.summary.url ? (
          <a href={d.summary.url} target="_blank" rel="noreferrer" className="hover:underline">
            {d.summary.number ? `#${d.summary.number} ` : ""}
            {d.summary.title}
          </a>
        ) : (
          d.summary.title
        )}
        {d.lastError && <div className="mt-1 text-xs text-red-600">{d.lastError}</div>}
      </td>
      <td className="px-3 py-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[d.status]}`}>{d.status}</span>
        {d.attempts > 1 && <div className="mt-1 text-xs text-neutral-500">{d.attempts} attempts</div>}
      </td>
      <td className="px-3 py-2 text-xs">
        {d.actions.length ? (
          <ul className="space-y-1">
            {d.actions.map((a) => (
              <li key={a.id}>
                {a.type} · <span className={a.status === "FAILED" ? "text-red-600" : ""}>{a.status}</span>
                {a.lastError && <div className="text-red-600">{a.lastError}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>
    </tr>
  );
}
