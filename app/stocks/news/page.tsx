"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Newspaper, RefreshCw, Search } from "lucide-react";
import FreshnessBadge from "../../components/FreshnessBadge";
import LoadErrorBanner from "../../components/LoadErrorBanner";
import { usePullRefresh } from "../../lib/pullRefresh";
import { fetchNews, matchSymbols, timeAgo, type NewsItem, type StockRef } from "../../lib/news";
import { computeHoldings, fetchTxns } from "../../lib/portfolio";

type Filter = "all" | "holdings" | "announcements";
const RANGES = [
    { days: 1, label: "Today" },
    { days: 3, label: "3 days" },
    { days: 7, label: "7 days" },
];

export default function PsxNewsPage() {
    const [days, setDays] = useState(1);
    const [filter, setFilter] = useState<Filter>("all");
    const [query, setQuery] = useState("");
    const [items, setItems] = useState<NewsItem[]>([]);
    const [stocks, setStocks] = useState<StockRef[]>([]);
    const [held, setHeld] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [fetchedAt, setFetchedAt] = useState<number | null>(null);

    const load = useCallback(async () => {
        const res = await fetchNews(days);
        setFailed(res.failed);
        if (!res.failed) {
            setItems(res.items);
            setFetchedAt(res.fetchedAt);
        }
        setLoading(false);
    }, [days]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        load();
    }, [load]);
    usePullRefresh(load);

    // Stock names (to tag headlines) and your holdings (to filter by them).
    useEffect(() => {
        let cancelled = false;
        fetch("/api/psx-stocks")
            .then(r => r.json())
            .then(j => { if (!cancelled && Array.isArray(j?.data)) setStocks(j.data.map((s: StockRef) => ({ symbol: s.symbol, name: s.name }))); })
            .catch(() => { /* headlines still show, just untagged */ });
        fetchTxns().then(t => {
            if (!cancelled) setHeld(computeHoldings(t).holdings.filter(h => h.assetType === "PSX").map(h => h.symbol.toUpperCase()));
        });
        return () => { cancelled = true; };
    }, []);

    const tagged = useMemo(() => items.map(i => ({ ...i, symbols: matchSymbols(i, stocks) })), [items, stocks]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return tagged.filter(i => {
            if (filter === "announcements" && !i.announcement) return false;
            if (filter === "holdings" && !i.symbols.some(s => held.includes(s))) return false;
            return !q || i.title.toLowerCase().includes(q) || i.symbols.some(s => s.toLowerCase() === q);
        });
    }, [tagged, filter, query, held]);

    const counts = useMemo(() => ({
        holdings: tagged.filter(i => i.symbols.some(s => held.includes(s))).length,
        announcements: tagged.filter(i => i.announcement).length,
    }), [tagged, held]);

    const chip = (active: boolean) =>
        `min-h-10 px-4 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-white/5 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-white/10"}`;

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white">
            <header className="safe-top sticky top-0 z-40 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
                <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-3xl font-black tracking-tighter italic uppercase leading-none flex items-center gap-2.5">
                            <Newspaper className="w-6 h-6 sm:w-7 sm:h-7 text-blue-500 shrink-0" strokeWidth={2} aria-hidden /> PSX <span className="text-blue-500">News</span>
                        </h1>
                        <p className="text-zinc-500 text-xs mt-1.5">
                            <FreshnessBadge fetchedAt={fetchedAt} failed={failed} loading={loading} onRetry={load} />
                        </p>
                    </div>
                    <button type="button" onClick={() => { setLoading(true); load(); }} aria-label="Refresh news" className="shrink-0 w-11 h-11 rounded-xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center text-zinc-600 dark:text-zinc-300 active:scale-95 transition-transform">
                        <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} strokeWidth={2} />
                    </button>
                </div>
            </header>

            <main className="page-shell mx-auto p-4 sm:p-8 space-y-5">
                {failed && <LoadErrorBanner hasData={items.length > 0} what="the news" onRetry={load} />}

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Filter news">
                        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={chip(filter === "all")}>All ({tagged.length})</button>
                        <button type="button" aria-pressed={filter === "holdings"} onClick={() => setFilter("holdings")} className={chip(filter === "holdings")}>My holdings ({counts.holdings})</button>
                        <button type="button" aria-pressed={filter === "announcements"} onClick={() => setFilter("announcements")} className={chip(filter === "announcements")}>Dividends &amp; results ({counts.announcements})</button>
                    </div>
                    <div className="flex gap-2 items-center">
                        <div className="relative flex-1 lg:w-64">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden />
                            <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                aria-label="Search headlines or a symbol"
                                placeholder="Search or symbol"
                                className="w-full min-h-10 rounded-xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 pl-9 pr-3 text-base outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="flex rounded-xl bg-zinc-100 dark:bg-white/5 p-1" role="group" aria-label="Time range">
                            {RANGES.map(r => (
                                <button key={r.days} type="button" aria-pressed={days === r.days} onClick={() => setDays(r.days)} className={`min-h-9 px-3 rounded-lg text-xs font-bold ${days === r.days ? "bg-white dark:bg-zinc-700 shadow text-blue-600 dark:text-blue-400" : "text-zinc-500"}`}>{r.label}</button>
                            ))}
                        </div>
                    </div>
                </div>

                {loading && items.length === 0 ? (
                    <ul className="space-y-3" aria-busy="true">
                        {[0, 1, 2, 3].map(i => <li key={i} className="h-24 rounded-2xl bg-zinc-200/60 dark:bg-white/5 animate-pulse" />)}
                    </ul>
                ) : visible.length === 0 ? (
                    <div className="py-16 text-center text-sm text-zinc-500">
                        {failed ? "No news to show." : filter === "holdings" && held.length === 0
                            ? "You don't hold any PSX stocks yet, so there's nothing to match."
                            : days === 1 ? "No matching stories yet today. Try 3 days." : "No matching stories in this range."}
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {visible.map(i => (
                            <li key={i.id} className="card p-4 sm:p-5">
                                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1.5 flex-wrap">
                                    <span className="font-bold text-zinc-700 dark:text-zinc-300">{i.source}</span>
                                    <span aria-hidden>·</span>
                                    <time dateTime={new Date(i.publishedAt).toISOString()}>{timeAgo(i.publishedAt)}</time>
                                    {i.announcement && <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">Dividend / results</span>}
                                </div>
                                <a href={i.url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-start gap-2 text-base sm:text-lg font-bold leading-snug text-zinc-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400">
                                    <span>{i.title}</span>
                                    <ExternalLink className="w-4 h-4 mt-1 shrink-0 opacity-50 group-hover:opacity-100" aria-label="Opens the publisher's site" />
                                </a>
                                {i.summary && <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1.5 line-clamp-2">{i.summary}</p>}
                                {i.symbols.length > 0 && (
                                    <div className="flex gap-1.5 flex-wrap mt-3">
                                        {i.symbols.slice(0, 6).map(s => (
                                            <Link key={s} href={`/stocks/${s.toLowerCase()}`} className={`min-h-8 px-2.5 inline-flex items-center rounded-lg text-xs font-black ${held.includes(s) ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-200"}`}>
                                                {s}{held.includes(s) ? " · held" : ""}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                <p className="text-xs text-zinc-500 text-center pt-2">
                    Headlines from Business Recorder, Dawn, The Express Tribune and Google News. Stock tags are matched automatically from the text and can be wrong — always read the story.
                </p>
            </main>
        </div>
    );
}
