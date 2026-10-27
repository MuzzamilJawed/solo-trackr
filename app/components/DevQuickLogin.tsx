"use client";

import { useEffect, useState } from "react";
import { TerminalSquare } from "lucide-react";

interface DevAccount {
    label: string;
    email: string;
    password: string;
    role?: string;
}

/**
 * One-click credential fill for local development.
 *
 * Guarded twice on purpose: the fetch is skipped unless this is a dev build AND
 * the page is being served from a loopback host, and the route it calls 404s in
 * production. So a dev build accidentally deployed somewhere still shows nothing.
 */
export default function DevQuickLogin({ onPick }: { onPick: (email: string, password: string) => void }) {
    const [accounts, setAccounts] = useState<DevAccount[]>([]);

    useEffect(() => {
        if (process.env.NODE_ENV === "production") return;
        const host = window.location.hostname;
        if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) return;

        let cancelled = false;
        fetch("/api/dev/accounts")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (!cancelled && Array.isArray(j?.accounts)) setAccounts(j.accounts); })
            .catch(() => { /* helper only — never block sign-in */ });
        return () => { cancelled = true; };
    }, []);

    if (accounts.length === 0) return null;

    return (
        <div className="mt-6 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/[0.06] p-3.5">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2.5">
                <TerminalSquare className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                Local development only
            </p>

            <div className="space-y-1.5">
                {accounts.map((a) => (
                    <button
                        key={a.email}
                        type="button"
                        onClick={() => onPick(a.email, a.password)}
                        title={`Fill the form with ${a.email}`}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 min-h-[40px] rounded-xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 hover:border-amber-500/50 active:scale-[0.99] transition-all text-left"
                    >
                        <span className="min-w-0">
                            <span className="block text-[11px] font-black text-zinc-900 dark:text-white truncate">
                                {a.label}
                                {a.role && (
                                    <span className="ml-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                                        {a.role}
                                    </span>
                                )}
                            </span>
                            <span className="block text-[11px] font-bold text-zinc-500 truncate">{a.email}</span>
                        </span>
                        <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-zinc-400">Fill</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
