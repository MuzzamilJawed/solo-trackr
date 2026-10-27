"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Users, ShieldCheck, Search, X, Star, Briefcase, Globe, Layers,
    CalendarDays, Clock, Mail, Phone, ArrowUpDown,
} from "lucide-react";
import PageSkeleton from "../../components/PageSkeleton";
import { useBackHandler } from "../../lib/backStack";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

interface DirectoryUser {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    image: string | null;
    role: "admin" | "user";
    providers: string[];
    createdAt: string;
    lastLoginAt: string | null;
    watching: number;
    watchlists: number;
    trackedSymbols: number;
    trades: number;
}

interface WatchlistSummary {
    id: string;
    name: string;
    type: string;
    symbols: number;
    createdAt: string;
}

// Not an extension of DirectoryUser: there `watchlists` is a count, here it's
// the actual list.
interface UserDetail {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    image: string | null;
    role: "admin" | "user";
    providers: string[];
    createdAt: string;
    lastLoginAt: string | null;
    watching: number;
    stats: {
        watchlists: number;
        trackedSymbols: number;
        trades: number;
        openPositions: number;
        firstTrade: string | null;
        lastTrade: string | null;
    };
    watchlists: WatchlistSummary[];
}

type SortKey = "createdAt" | "lastLoginAt" | "name" | "trades";

const fmtDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";

const initials = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

export default function AdminUsersPage() {
    const { success, error } = useToast();
    const { user: me } = useAuth();

    const [users, setUsers] = useState<DirectoryUser[]>([]);
    const [summary, setSummary] = useState({ total: 0, admins: 0, withGoogle: 0 });
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("createdAt");

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<UserDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [savingRole, setSavingRole] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/users", { cache: "no-store" });
            const json = await res.json();
            if (json?.success) {
                setUsers(json.data);
                setSummary(json.summary);
            } else {
                error(json?.error || "Couldn't load users");
            }
        } catch {
            error("Network error — couldn't load users");
        } finally {
            setLoading(false);
        }
    }, [error]);

    useEffect(() => { load(); }, [load]);

    // Android Back closes the detail drawer.
    useBackHandler(!!selectedId, () => setSelectedId(null));

    // Escape closes the detail drawer.
    useEffect(() => {
        if (!selectedId) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedId(null); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selectedId]);

    // Fetch the full record whenever a row is opened.
    useEffect(() => {
        if (!selectedId) { setDetail(null); return; }
        let active = true;
        setDetailLoading(true);
        (async () => {
            try {
                const res = await fetch(`/api/admin/users/${selectedId}`, { cache: "no-store" });
                const json = await res.json();
                if (active && json?.success) setDetail(json.data);
            } finally {
                if (active) setDetailLoading(false);
            }
        })();
        return () => { active = false; };
    }, [selectedId]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = q
            ? users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
            : users;
        return [...filtered].sort((a, b) => {
            if (sortKey === "name") return a.name.localeCompare(b.name);
            if (sortKey === "trades") return b.trades - a.trades;
            const av = a[sortKey] ? new Date(a[sortKey] as string).getTime() : 0;
            const bv = b[sortKey] ? new Date(b[sortKey] as string).getTime() : 0;
            return bv - av;
        });
    }, [users, query, sortKey]);

    const changeRole = async (id: string, role: "admin" | "user") => {
        setSavingRole(true);
        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role }),
            });
            const json = await res.json();
            if (json?.success) {
                setUsers(us => us.map(u => (u.id === id ? { ...u, role } : u)));
                setDetail(d => (d && d.id === id ? { ...d, role } : d));
                setSummary(s => ({ ...s, admins: s.admins + (role === "admin" ? 1 : -1) }));
                success(`Role updated to ${role}`);
            } else {
                error(json?.error || "Couldn't update the role");
            }
        } catch {
            error("Network error — couldn't update the role");
        } finally {
            setSavingRole(false);
        }
    };

    if (loading) return <PageSkeleton variant="table" />;

    const labelCls = "text-[10px] font-black text-zinc-400 uppercase tracking-widest";
    const avatar = (u: { image: string | null; name: string }, size: string) =>
        u.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.image} alt="" referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700`} />
        ) : (
            <div className={`${size} shrink-0 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center`}>
                <span className="text-white font-black text-[11px] leading-none">{initials(u.name)}</span>
            </div>
        );

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white">
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 dark:bg-blue-600/10 blur-[120px] rounded-full" />
            </div>

            <header className="safe-top sticky top-0 z-50 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
                <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-3 sm:py-6 flex flex-col sm:flex-row sm:flex-wrap justify-between items-start sm:items-center gap-3">
                    <div className="min-w-0 sm:shrink-0">
                        <h1 className="text-xl sm:text-3xl font-black tracking-tighter italic uppercase leading-none flex items-center gap-2">
                            <Users className="w-6 h-6 sm:w-7 sm:h-7 text-blue-500 shrink-0" strokeWidth={2} /> User <span className="text-blue-500">Management</span>
                        </h1>
                        <p className="text-zinc-500 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] mt-1">Registered Accounts · Roles · Activity</p>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1 sm:min-w-[280px]">
                        <div className="relative flex-1 sm:min-w-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" strokeWidth={2.5} />
                            <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search name or email…"
                                className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <select
                            value={sortKey}
                            onChange={e => setSortKey(e.target.value as SortKey)}
                            title="Sort by"
                            className="px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-black outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                        >
                            <option value="createdAt">Newest</option>
                            <option value="lastLoginAt">Recently active</option>
                            <option value="name">Name</option>
                            <option value="trades">Most trades</option>
                        </select>
                    </div>
                </div>
            </header>

            <main className="page-shell mx-auto p-4 sm:p-8 relative z-10 space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    {[
                        { label: "Registered Users", val: summary.total },
                        { label: "Administrators", val: summary.admins },
                        { label: "Google Linked", val: summary.withGoogle },
                    ].map(c => (
                        <div key={c.label} className="card p-4 sm:p-5">
                            <p className="text-[10px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{c.label}</p>
                            <p className="text-xl sm:text-2xl font-black font-mono tabular-nums tracking-tighter">{c.val}</p>
                        </div>
                    ))}
                </div>

                {/* Directory */}
                <div className="card overflow-hidden">
                    <div className="px-4 sm:px-6 py-4 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between gap-2">
                        <h2 className="text-sm font-black uppercase tracking-tighter italic">All Users <span className="text-zinc-400">· {visible.length}</span></h2>
                    </div>

                    {visible.length === 0 ? (
                        <div className="py-16 text-center text-[11px] font-black text-zinc-400 uppercase tracking-widest">No users match “{query}”</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-[10px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-white/5">
                                        <th className="px-3 sm:px-6 py-3">User</th>
                                        <th className="px-3 sm:px-4 py-3">Role</th>
                                        <th className="px-3 sm:px-4 py-3 hidden lg:table-cell">Sign-in</th>
                                        <th className="px-3 sm:px-4 py-3 text-right hidden md:table-cell">Watchlists</th>
                                        <th className="px-3 sm:px-4 py-3 text-right hidden md:table-cell">Symbols</th>
                                        <th className="px-3 sm:px-4 py-3 text-right">Trades</th>
                                        <th className="px-3 sm:px-4 py-3 hidden sm:table-cell">Joined</th>
                                        <th className="px-3 sm:px-6 py-3 hidden lg:table-cell">Last Active</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                    {visible.map(u => (
                                        <tr
                                            key={u.id}
                                            onClick={() => setSelectedId(u.id)}
                                            className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] cursor-pointer"
                                        >
                                            <td className="px-3 sm:px-6 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    {avatar(u, "w-8 h-8")}
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-black tracking-tight truncate flex items-center gap-1">
                                                            {u.name}
                                                            {me?.id === u.id && <span className="text-[7px] font-black uppercase tracking-widest px-1 py-0.5 rounded bg-blue-500/10 text-blue-500">You</span>}
                                                        </div>
                                                        <div className="text-[11px] text-zinc-400 font-bold truncate max-w-[200px]">{u.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 sm:px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${u.role === "admin" ? "bg-blue-500/10 text-blue-500" : "bg-zinc-500/10 text-zinc-500"}`}>
                                                    {u.role === "admin" && <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />} {u.role}
                                                </span>
                                            </td>
                                            <td className="px-3 sm:px-4 py-3 hidden lg:table-cell">
                                                <div className="flex gap-1">
                                                    {u.providers.map(p => (
                                                        <span key={p} className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                                                            {p === "credentials" ? "Password" : "Google"}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-3 sm:px-4 py-3 text-right font-mono text-xs tabular-nums hidden md:table-cell">{u.watchlists}</td>
                                            <td className="px-3 sm:px-4 py-3 text-right font-mono text-xs tabular-nums text-zinc-500 hidden md:table-cell">{u.trackedSymbols}</td>
                                            <td className="px-3 sm:px-4 py-3 text-right font-mono text-xs tabular-nums font-black">{u.trades}</td>
                                            <td className="px-3 sm:px-4 py-3 font-mono text-[11px] tabular-nums text-zinc-500 hidden sm:table-cell">{fmtDate(u.createdAt)}</td>
                                            <td className="px-3 sm:px-6 py-3 font-mono text-[11px] tabular-nums text-zinc-500 hidden lg:table-cell">{fmtDateTime(u.lastLoginAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            {/* Detail drawer */}
            {selectedId && (
                <>
                    <div onClick={() => setSelectedId(null)} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110]" />
                    <aside role="dialog" aria-modal="true" aria-label="User details" className="fixed right-0 top-0 h-screen h-dvh w-[min(30rem,100vw)] bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-[115] overflow-y-auto">
                        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-5 py-4 pt-[calc(1rem_+_var(--sa-top))] flex items-center justify-between gap-2">
                            <h2 className="text-sm font-black uppercase tracking-tighter italic">User Details</h2>
                            <button onClick={() => setSelectedId(null)} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                <X className="w-4 h-4" strokeWidth={2.5} />
                            </button>
                        </div>

                        {detailLoading || !detail ? (
                            <div className="py-20 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                            </div>
                        ) : (
                            <div className="p-5 space-y-6">
                                <div className="flex items-center gap-4">
                                    {avatar(detail, "w-16 h-16 !rounded-2xl")}
                                    <div className="min-w-0">
                                        <p className="text-lg font-black tracking-tighter italic uppercase truncate">{detail.name}</p>
                                        <p className="text-[11px] font-bold text-zinc-500 flex items-center gap-1.5 truncate"><Mail className="w-3 h-3 shrink-0" strokeWidth={2.5} /> {detail.email}</p>
                                        <p className="text-[11px] font-bold text-zinc-500 flex items-center gap-1.5 truncate"><Phone className="w-3 h-3 shrink-0" strokeWidth={2.5} /> {detail.phone || "No phone number"}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-zinc-50 dark:bg-white/5 rounded-xl px-3 py-2.5 border border-zinc-200 dark:border-white/5">
                                        <p className={`${labelCls} flex items-center gap-1 mb-0.5`}><CalendarDays className="w-3 h-3" strokeWidth={2.5} /> Joined</p>
                                        <p className="text-xs font-black">{fmtDate(detail.createdAt)}</p>
                                    </div>
                                    <div className="bg-zinc-50 dark:bg-white/5 rounded-xl px-3 py-2.5 border border-zinc-200 dark:border-white/5">
                                        <p className={`${labelCls} flex items-center gap-1 mb-0.5`}><Clock className="w-3 h-3" strokeWidth={2.5} /> Last sign-in</p>
                                        <p className="text-xs font-black">{fmtDateTime(detail.lastLoginAt)}</p>
                                    </div>
                                </div>

                                <div>
                                    <p className={`${labelCls} mb-2`}>Activity</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { label: "Watchlists", val: detail.stats.watchlists, icon: Star },
                                            { label: "Symbols Tracked", val: detail.stats.trackedSymbols, icon: Layers },
                                            { label: "Trades Recorded", val: detail.stats.trades, icon: Briefcase },
                                            { label: "Assets Watched", val: detail.watching, icon: Globe },
                                        ].map(s => (
                                            <div key={s.label} className="bg-zinc-50 dark:bg-white/5 rounded-xl px-3 py-2.5 border border-zinc-200 dark:border-white/5">
                                                <s.icon className="w-3.5 h-3.5 text-blue-500 mb-1" strokeWidth={2} />
                                                <p className="text-lg font-black font-mono tabular-nums leading-none">{s.val}</p>
                                                <p className={`${labelCls} mt-1`}>{s.label}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {detail.stats.trades > 0 && (
                                        <p className={`${labelCls} mt-2`}>Trading {fmtDate(detail.stats.firstTrade)} → {fmtDate(detail.stats.lastTrade)}</p>
                                    )}
                                </div>

                                <div>
                                    <p className={`${labelCls} mb-2`}>Watchlists</p>
                                    {detail.watchlists.length === 0 ? (
                                        <p className="text-[11px] font-bold text-zinc-400">No watchlists yet.</p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {detail.watchlists.map(l => (
                                                <div key={l.id} className="flex items-center justify-between gap-2 bg-zinc-50 dark:bg-white/5 rounded-xl px-3 py-2 border border-zinc-200 dark:border-white/5">
                                                    <span className="text-xs font-black truncate">{l.name}</span>
                                                    <span className="flex items-center gap-2 shrink-0">
                                                        <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">{l.type}</span>
                                                        <span className="text-[11px] font-black text-zinc-400 tabular-nums">{l.symbols}</span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Role management */}
                                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-5">
                                    <p className={`${labelCls} mb-2`}>Role</p>
                                    <div className="flex bg-zinc-100 dark:bg-white/5 p-1 rounded-xl border border-zinc-200 dark:border-white/10">
                                        {(["user", "admin"] as const).map(r => (
                                            <button
                                                key={r}
                                                onClick={() => detail.role !== r && changeRole(detail.id, r)}
                                                disabled={savingRole || detail.role === r}
                                                className={`flex-1 px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all disabled:cursor-default ${detail.role === r ? "bg-white dark:bg-zinc-800 text-blue-600 shadow" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-zinc-400 font-bold mt-2 leading-relaxed">
                                        {me?.id === detail.id
                                            ? "This is your own account — you can't remove your administrator access."
                                            : "Administrators can view this directory and manage roles. A user's watchlists and portfolio stay private either way."}
                                    </p>
                                </div>
                            </div>
                        )}
                    </aside>
                </>
            )}
        </div>
    );
}
