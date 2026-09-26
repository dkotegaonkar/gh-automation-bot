"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, Me, UnauthorizedError } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Activity" },
  { href: "/dashboard/rules", label: "Rules" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });

  useEffect(() => {
    if (me.error instanceof UnauthorizedError) router.replace("/");
  }, [me.error, router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/");
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">GitHub Automation Bot</h1>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-3 py-1.5 ${
                  pathname === n.href
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
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
      {children}
    </div>
  );
}
