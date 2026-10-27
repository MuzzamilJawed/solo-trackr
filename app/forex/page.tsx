"use client";

import PageSkeleton from "../components/PageSkeleton";
import { ArrowRightLeft, AlertTriangle, Zap, BarChart3, Droplet, Search, X } from "lucide-react";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSettings } from "../context/SettingsContext";
import { useCurrency } from "../context/CurrencyContext";
import CurrencyToggle from "../components/CurrencyToggle";
import FitText from "../components/FitText";
import dynamic from 'next/dynamic';
const TradingChart = dynamic(() => import('../components/TradingChart'), { ssr: false });
import { LOADING_CAPTION } from "../lib/caption";

const PER_PAGE = 24;

export default function ForexPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [forexRates, setForexRates] = useState<any[]>([]);
    const [selectedPair, setSelectedPair] = useState<any>(null);
    const [trendData, setTrendData] = useState<any[]>([]);
    const [chartTF, setChartTF] = useState("1H");
    const { settings } = useSettings();
    const { currency, sym, conv } = useCurrency();

    // Market Watch: every currency the feed publishes, pulled a page at a time
    // from the server as you reach the bottom of the list.
    const [search, setSearch] = useState("");
    const [query, setQuery] = useState("");        // debounced -> sent to the server
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const pageRef = useRef(1);
    const hasMoreRef = useRef(true);
    const loadingMoreRef = useRef(false);
    const queryRef = useRef("");
    const listRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // mode: 'initial' (new query / first load) | 'more' (next page) | 'refresh' (live prices)
    const loadPage = useCallback(async (pageNum: number, mode: 'initial' | 'more' | 'refresh', q: string) => {
        if (mode === 'more') { setLoadingMore(true); loadingMoreRef.current = true; }
        else if (mode === 'initial') setLoading(true);
        try {
            const res = await fetch(`/api/forex/all?page=${pageNum}&per_page=${PER_PAGE}&q=${encodeURIComponent(q)}`);
            if (!res.ok) throw new Error("Failed to fetch rates");
            const json = await res.json();
            if (!json?.success) throw new Error(json?.error || "Bad response");
            // A slower response for a stale query must not overwrite the current one.
            if (queryRef.current !== q) return;

            const rows: any[] = json.data || [];
            setTotal(json.total ?? rows.length);
            setHasMore(!!json.hasMore); hasMoreRef.current = !!json.hasMore;
            setError("");

            setForexRates(prev => {
                if (mode === 'initial') return rows;
                if (mode === 'refresh') {
                    const fresh = new Map(rows.map(r => [r.code, r]));
                    return prev.map(r => fresh.get(r.code) || r);   // keep scroll position + appended pages
                }
                const seen = new Set(prev.map(r => r.code));
                return [...prev, ...rows.filter(r => !seen.has(r.code))];
            });

            if (mode === 'initial') {
                setSelectedPair(rows[1] ?? rows[0] ?? null);        // default to the first pair after USD
            } else if (mode === 'refresh') {
                setSelectedPair((prev: any) => prev ? (rows.find(r => r.code === prev.code) || prev) : prev);
            }
        } catch {
            if (mode !== 'more') setError("Unable to load exchange rates");
        } finally {
            if (mode === 'initial') setLoading(false);
            if (mode === 'more') { setLoadingMore(false); loadingMoreRef.current = false; }
        }
    }, []);

    // Debounce typing before hitting the server.
    useEffect(() => {
        const t = setTimeout(() => setQuery(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);

    // New query (and first load) => start over at page 1.
    useEffect(() => {
        queryRef.current = query;
        pageRef.current = 1;
        hasMoreRef.current = true;
        listRef.current?.scrollTo({ top: 0 });
        loadPage(1, 'initial', query);
    }, [query, loadPage]);

    // Infinite scroll: pull the next page when the sentinel enters the list.
    // Re-runs once `loading` flips false so it binds after the real list mounts.
    useEffect(() => {
        if (loading) return;
        const root = listRef.current;
        const target = sentinelRef.current;
        if (!root || !target) return;
        const io = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting && hasMoreRef.current && !loadingMoreRef.current) {
                const next = pageRef.current + 1;
                pageRef.current = next;
                loadPage(next, 'more', queryRef.current);
            }
        }, { root, rootMargin: "160px" });
        io.observe(target);
        return () => io.disconnect();
    }, [loadPage, loading]);

    // Auto-refresh keeps the visible prices live without disturbing the scroll.
    useEffect(() => {
        if (!settings.refreshInterval || settings.refreshInterval <= 0) return;
        const interval = setInterval(() => loadPage(1, 'refresh', queryRef.current), settings.refreshInterval * 1000);
        return () => clearInterval(interval);
    }, [settings.refreshInterval, loadPage]);

    useEffect(() => {
        if (!selectedPair) return;
        const count = 100;
        const basePrice = conv(selectedPair.usdPrice, selectedPair.pkrPrice) ?? 0;
        if (!basePrice) { setTrendData([]); return; }
        const data = [];
        const nowSec = Math.floor(Date.now() / 1000);
        const interval = chartTF === '1H' ? 3600 : 86400;

        let lastClose = basePrice;
        const volatility = chartTF === '1H' ? 0.001 : 0.003;
        const dp = basePrice >= 10 ? 2 : 4;

        for (let i = 0; i < count; i++) {
            const time = nowSec - i * interval;
            const change = (Math.random() - 0.5) * volatility;

            const close = lastClose;
            const open = close / (1 + change);
            const high = Math.max(open, close) * (1 + Math.random() * (volatility * 0.2));
            const low = Math.min(open, close) * (1 - Math.random() * (volatility * 0.2));

            data.unshift({
                time,
                open: parseFloat(open.toFixed(dp)),
                high: parseFloat(high.toFixed(dp)),
                low: parseFloat(low.toFixed(dp)),
                close: parseFloat(close.toFixed(dp)),
                volume: Math.floor(Math.random() * 10000) + 1000
            });
            lastClose = open;
        }
        setTrendData(data);
    }, [selectedPair, currency, chartTF]);

    if (loading && forexRates.length === 0) return <PageSkeleton variant="table" />;

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white selection:bg-blue-500/30">
            {/* Dynamic Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 dark:bg-blue-600/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/5 dark:bg-blue-600/10 blur-[120px] rounded-full"></div>
            </div>

            <div className="page-shell mx-auto p-4 sm:p-8 pt-[calc(1rem_+_var(--sa-top))] sm:pt-[calc(2rem_+_var(--sa-top))] relative z-10">
                <header className="safe-top sticky top-0 z-50 mb-8 sm:mb-12 -mx-4 sm:-mx-8 px-4 sm:px-8 pl-16 lg:pl-8 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5 flex flex-row justify-between items-start md:items-center gap-3 sm:gap-8">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2 min-w-0">
                            <h1 className="text-lg sm:text-4xl font-black text-zinc-900 dark:text-white italic uppercase tracking-tighter leading-none inline-flex items-center gap-2 min-w-0">
                                <ArrowRightLeft className="w-5 h-5 sm:w-8 sm:h-8 text-blue-600 dark:text-blue-400 shrink-0" strokeWidth={2} />
                                <FitText className="min-w-0 flex-1">Forex Terminal</FitText>
                            </h1>
                            <div className="hidden sm:block px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
                                <span className="text-[11px] text-green-500 font-black uppercase tracking-widest animate-pulse">Syncing</span>
                            </div>
                        </div>
                        <p className="text-zinc-500 dark:text-zinc-500 text-[11px] sm:text-sm font-bold tracking-tight">Real-time cross-currency velocity & volatility synthesis</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <span className="hidden sm:block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Quoted in</span>
                        <CurrencyToggle />
                    </div>
                </header>

                {error && (
                    <div className="mb-6 sm:mb-12 p-6 bg-red-500/10 border border-red-500/20 rounded-[2.5rem] flex items-center gap-4 animate-in fade-in slide-in-from-top-4">
                        <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" strokeWidth={2} />
                        <p className="text-red-500 font-black uppercase text-xs tracking-widest">{error}</p>
                    </div>
                )}

                {/* Primary Intelligence Section */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 sm:gap-8 mb-6 sm:mb-12">
                    {/* Market Watch Table Sidebar — matches the chart column height, scrolls inside */}
                    <div className="lg:col-span-1 lg:relative">
                        <div className="card max-h-[400px] lg:max-h-none lg:absolute lg:inset-0 overflow-hidden flex flex-col">
                            <div className="p-3 sm:p-4 border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-zinc-900/50 shrink-0 space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Market Watch</h2>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 tabular-nums">
                                        {forexRates.length}{total ? `/${total}` : ''}
                                    </span>
                                </div>
                                {/* Searches every currency on the server, not just the loaded pages */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" strokeWidth={2.5} />
                                    <input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search currency…"
                                        aria-label="Search currency"
                                        autoComplete="off"
                                        className="w-full bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl pl-8 pr-8 py-2 text-[11px] font-black uppercase tracking-widest text-zinc-900 dark:text-white placeholder:text-zinc-400 placeholder:normal-case placeholder:tracking-normal outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    />
                                    {search && (
                                        <button
                                            onClick={() => setSearch("")}
                                            aria-label="Clear search"
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" strokeWidth={3} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 z-20 bg-zinc-50/90 dark:bg-zinc-900/90 backdrop-blur-md">
                                        <tr className="border-b border-zinc-200 dark:border-white/5">
                                            <th className="pl-4 pr-2 py-3 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Asset</th>
                                            <th className="px-2 py-3 text-[10px] font-black uppercase text-zinc-400 tracking-widest text-right">Price</th>
                                            <th className="pl-2 pr-4 py-3 text-[10px] font-black uppercase text-zinc-400 tracking-widest text-right">24h%</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                        {loading && forexRates.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-6 py-16 text-center">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                                        <p className="text-zinc-500 font-black uppercase text-[10px] tracking-widest">{LOADING_CAPTION}</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {!loading && forexRates.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-6 py-16 text-center">
                                                    <p className="text-zinc-500 font-black uppercase text-[10px] tracking-widest">
                                                        {search ? `No currency matches “${search}”` : 'No currencies available'}
                                                    </p>
                                                </td>
                                            </tr>
                                        )}
                                        {forexRates.map((rate) => (
                                            <tr
                                                key={rate.code}
                                                onClick={() => setSelectedPair(rate)}
                                                className={`group cursor-pointer transition-colors duration-200 ${selectedPair?.code === rate.code
                                                    ? 'bg-blue-600/10 dark:bg-blue-600/20'
                                                    : 'hover:bg-zinc-50 dark:hover:bg-white/5'
                                                    }`}
                                            >
                                                <td className="pl-4 pr-2 py-3.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-1 h-1 shrink-0 rounded-full ${selectedPair?.code === rate.code ? 'bg-blue-500 animate-pulse' : 'bg-transparent'}`}></div>
                                                        <div className="min-w-0">
                                                            <div className={`text-xs sm:text-sm font-black tracking-tighter uppercase italic ${selectedPair?.code === rate.code ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-900 dark:text-white'}`}>{rate.code}</div>
                                                            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider truncate max-w-[58px]" title={rate.name}>{rate.name}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className={`px-2 py-3.5 text-right font-mono text-xs font-black tracking-tighter tabular-nums whitespace-nowrap ${selectedPair?.code === rate.code ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-900 dark:text-white'}`}>
                                                    {(conv(rate.usdPrice, rate.pkrPrice) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: (conv(rate.usdPrice, rate.pkrPrice) ?? 0) >= 10 ? 2 : 4 })}
                                                </td>
                                                <td className={`pl-2 pr-4 py-3.5 text-right text-[10px] font-black tabular-nums whitespace-nowrap ${rate.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {rate.changePercent >= 0 ? '▲' : '▼'}{Math.abs(rate.changePercent).toFixed(2)}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* Infinite-scroll trigger + status */}
                                <div ref={sentinelRef} className="h-1"></div>
                                {loadingMore && (
                                    <div className="py-4 flex items-center justify-center gap-2">
                                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Loading more…</span>
                                    </div>
                                )}
                                {!hasMore && forexRates.length > 0 && (
                                    <div className="py-4 text-center text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                        — All {forexRates.length} currencies —
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Main Chart Terminal */}
                    <div className="lg:col-span-3 space-y-8">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-[3rem] blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                            <div className="relative">
                                <TradingChart
                                    title={`${selectedPair?.code || 'Market'} Intelligence`}
                                    data={trendData}
                                    currentTimeframe={chartTF}
                                    onTimeframeChange={setChartTF}
                                    currencySymbol={sym}
                                />
                            </div>
                        </div>

                        {/* Tactical Stats Overlay */}
                        <div className="grid grid-cols-3 gap-3 sm:gap-6">
                            {[
                                { label: 'Volatility', val: (Math.random() * 0.5 + 0.1).toFixed(2) + '%', color: 'text-blue-500', icon: Zap },
                                { label: 'Spread', val: '0.0001 pts', color: 'text-indigo-500', icon: BarChart3 },
                                { label: 'Liquidity', val: '99.9% Depth', color: 'text-purple-500', icon: Droplet },
                            ].map(item => (
                                <div key={item.label} className="card p-4 sm:p-6 flex items-center gap-3 sm:gap-4 hover:shadow-xl transition-all duration-500">
                                    <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-zinc-50 dark:bg-white/5 flex items-center justify-center"><item.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${item.color}`} strokeWidth={2} /></div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-0.5 sm:mb-1 truncate">{item.label}</p>
                                        <p className={`text-[11px] sm:text-xs font-black uppercase tracking-tighter ${item.color} truncate`}>{item.val}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
