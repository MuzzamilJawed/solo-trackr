"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, Check, ChevronDown, Clock3, Filter, ListFilter, Loader2, Plus, RefreshCw, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "../../context/ToastContext";

interface Stock {
    symbol: string;
    name: string;
    currentPrice: number;
    change: number;
    changePercent: number;
    high: number;
    low: number;
    volume: string;
    sector?: string;
}

interface Index {
    name: string;
    value: number;
    change: number;
    changePercent: number;
}

interface Opportunity {
    stock: Stock;
    score: number;
    reasons: string[];
    metrics: { label: string; value: string }[];
}

interface MonthlyResult {
    symbol: string;
    monthlyChangePercent: number | null;
    monthlyHigh: number | null;
    monthlyLow: number | null;
    averageVolume: number | null;
    volumeRatio: number | null;
    positiveDays: number;
    tradingDays: number;
    score: number;
    reasons: string[];
}

interface Watchlist {
    _id: string;
    name: string;
    symbols?: string[];
    type?: string;
}

const parseVolume = (value: string | number | null | undefined) => {
    const parsed = Number(String(value ?? "").replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
};

const compactNumber = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

const shariahSectors = ["technology", "cement", "oil & gas", "fertilizer", "pharmaceuticals", "chemical", "power", "engineering", "food", "textile", "automobile", "refinery"];

function isIndexMember(stock: Stock, indexName: string, liquidityRank: number) {
    const index = indexName.toUpperCase();
    if (index === "ALLSHR" || index.includes("ALL SHARES")) return true;
    if (index.includes("KMI")) return shariahSectors.some(sector => (stock.sector || "").toLowerCase().includes(sector)) || stock.symbol.toUpperCase() === "MEBL";
    if (index.includes("KSE30")) return liquidityRank <= 30;
    if (index.includes("KSE100")) return liquidityRank <= 100;
    return true;
}

function scoreDaily(stocks: Stock[]): Opportunity[] {
    const volumes = stocks.map(stock => parseVolume(stock.volume)).filter(Boolean);
    const averageVolume = volumes.length ? volumes.reduce((sum, value) => sum + value, 0) / volumes.length : 1;

    return stocks.map(stock => {
        const volume = parseVolume(stock.volume);
        const range = Math.max(0, stock.high - stock.low);
        const rangePosition = range > 0 ? Math.max(0, Math.min(1, (stock.currentPrice - stock.low) / range)) : 0.5;
        const changeScore = Math.min(40, Math.max(0, stock.changePercent) * 5);
        const volumeScore = Math.min(25, Math.max(0, (volume / averageVolume) * 10));
        const rangeScore = rangePosition * 20;
        const liquidityScore = volume > 0 ? 15 : 0;
        const score = changeScore + volumeScore + rangeScore + liquidityScore;
        const reasons: string[] = [];

        if (stock.changePercent >= 2) reasons.push(`${stock.changePercent.toFixed(1)}% daily momentum`);
        else if (stock.changePercent > 0) reasons.push(`${stock.changePercent.toFixed(1)}% daily gain`);
        if (rangePosition >= 0.7) reasons.push(`near day high (${Math.round(rangePosition * 100)}% of range)`);
        if (volume / averageVolume >= 1.25) reasons.push(`${(volume / averageVolume).toFixed(1)}x market-average volume`);
        if (reasons.length === 0) reasons.push("Liquid stock for closer review");

        return {
            stock,
            score,
            reasons,
            metrics: [
                { label: "Move", value: `${stock.changePercent >= 0 ? "+" : ""}${stock.changePercent.toFixed(2)}%` },
                { label: "Volume", value: compactNumber(volume) },
                { label: "Range", value: `${Math.round(rangePosition * 100)}%` },
            ],
        };
    });
}

export default function OpportunitiesPage() {
    const router = useRouter();
    const { success, error } = useToast();
    const [stocks, setStocks] = useState<Stock[]>([]);
    const [indices, setIndices] = useState<Index[]>([]);
    const [sectors, setSectors] = useState<string[]>([]);
    const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
    const [watchlistId, setWatchlistId] = useState("");
    const [horizon, setHorizon] = useState<"daily" | "monthly">("daily");
    const [sector, setSector] = useState("all");
    const [index, setIndex] = useState("all");
    const [importantOnly, setImportantOnly] = useState(true);
    const [monthlyData, setMonthlyData] = useState<Record<string, MonthlyResult>>({});
    const [loading, setLoading] = useState(true);
    const [monthlyLoading, setMonthlyLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState("");

    const loadStocks = useCallback(async () => {
        setLoading(true);
        try {
            const [stockResponse, watchlistResponse] = await Promise.all([fetch("/api/psx-stocks"), fetch("/api/watchlists")]);
            const stockJson = await stockResponse.json();
            const watchlistJson = await watchlistResponse.json();
            const data: Stock[] = (stockJson?.data || []).filter((stock: Stock) => stock?.symbol);
            setStocks(data);
            setIndices(stockJson?.indices || []);
            setSectors(Array.from(new Set(data.map(stock => stock.sector || "Other"))).sort());
            if (watchlistJson?.success) {
                const psxLists = (watchlistJson.data || []).filter((list: Watchlist) => !list.type || list.type === "PSX");
                setWatchlists(psxLists);
                setWatchlistId(current => current || psxLists[0]?._id || "");
            }
            setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        } catch {
            error("Unable to load PSX opportunity data");
        } finally {
            setLoading(false);
        }
    }, [error]);

    useEffect(() => { loadStocks(); }, [loadStocks]);

    useEffect(() => {
        if (horizon !== "monthly" || stocks.length === 0) return;
        let cancelled = false;
        const loadMonthly = async () => {
            setMonthlyLoading(true);
            try {
                const response = await fetch("/api/psx-opportunities", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ stocks: stocks.map(stock => ({ symbol: stock.symbol })) }),
                });
                const json = await response.json();
                if (!cancelled && json.success) {
                    setMonthlyData(Object.fromEntries((json.data || []).map((item: MonthlyResult) => [item.symbol, item])));
                }
            } catch {
                if (!cancelled) error("Monthly history could not be loaded");
            } finally {
                if (!cancelled) setMonthlyLoading(false);
            }
        };
        loadMonthly();
        return () => { cancelled = true; };
    }, [horizon, stocks, error]);

    const liquidityRanks = useMemo(() => {
        const ranked = [...stocks].sort((a, b) => parseVolume(b.volume) - parseVolume(a.volume));
        return new Map(ranked.map((stock, position) => [stock.symbol, position + 1]));
    }, [stocks]);

    const filteredUniverse = useMemo(() => stocks.filter(stock => {
        const sectorMatches = sector === "all" || (stock.sector || "Other") === sector;
        const indexMatches = index === "all" || isIndexMember(stock, index, liquidityRanks.get(stock.symbol) || Number.MAX_SAFE_INTEGER);
        return sectorMatches && indexMatches;
    }), [stocks, sector, index, liquidityRanks]);

    const opportunities = useMemo(() => {
        const daily = scoreDaily(filteredUniverse);
        if (horizon === "daily") return daily.sort((a, b) => b.score - a.score);
        return filteredUniverse.map(stock => {
            const monthly = monthlyData[stock.symbol];
            return {
                stock,
                score: monthly?.score || 0,
                reasons: monthly?.reasons || ["Monthly history unavailable"],
                metrics: monthly ? [
                    { label: "Month", value: `${monthly.monthlyChangePercent?.toFixed(2) || "0.00"}%` },
                    { label: "Sessions", value: `${monthly.positiveDays}/${monthly.tradingDays}` },
                    { label: "Volume", value: monthly.volumeRatio ? `${monthly.volumeRatio.toFixed(1)}x avg` : "—" },
                ] : [],
            };
        }).sort((a, b) => b.score - a.score);
    }, [filteredUniverse, horizon, monthlyData]);

    const visibleOpportunities = importantOnly ? opportunities.filter(item => item.score >= (horizon === "daily" ? 30 : 35)) : opportunities;

    const addToWatchlist = async (symbol: string) => {
        const list = watchlists.find(item => item._id === watchlistId);
        if (!list) {
            error("Create or select a PSX watchlist first");
            return;
        }
        const symbols = Array.from(new Set([...(list.symbols || []), symbol.toUpperCase()]));
        try {
            const response = await fetch(`/api/watchlists/${list._id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbols }),
            });
            const json = await response.json();
            if (!json.success) throw new Error(json.error);
            setWatchlists(current => current.map(item => item._id === list._id ? json.data : item));
            success(`${symbol.toUpperCase()} added to ${list.name}`);
        } catch {
            error("Unable to update watchlist");
        }
    };

    return (
        <main className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white px-3 sm:px-6 lg:px-10 py-6 sm:py-10">
            <div className="max-w-7xl mx-auto space-y-5">
                <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
                    <div>
                        <button onClick={() => router.push("/stocks")} className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600 hover:text-blue-500 mb-3">PSX Stocks / Market Opportunities</button>
                        <h1 className="text-3xl sm:text-5xl font-black italic uppercase tracking-tighter leading-none">Opportunity Desk</h1>
                        <p className="mt-3 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">A focused shortlist from the full PSX universe. Daily mode uses the live session; monthly mode checks roughly 22 trading sessions and ranks sustained strength.</p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-400">
                        <Clock3 className="w-4 h-4" strokeWidth={2} /> Updated {lastUpdated || "—"}
                        <button onClick={loadStocks} className="ml-2 w-10 h-10 inline-flex items-center justify-center rounded-xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 hover:text-blue-600" title="Refresh PSX data" aria-label="Refresh PSX data"><RefreshCw className="w-4 h-4" strokeWidth={2.5} /></button>
                    </div>
                </header>

                <section className="card p-3 sm:p-5 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="inline-flex p-1 rounded-2xl bg-zinc-100 dark:bg-white/5 w-fit">
                            <button onClick={() => setHorizon("daily")} className={`min-h-11 px-4 rounded-xl inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest ${horizon === "daily" ? "bg-blue-600 text-white shadow" : "text-zinc-500"}`}><Activity className="w-4 h-4" /> Daily</button>
                            <button onClick={() => setHorizon("monthly")} className={`min-h-11 px-4 rounded-xl inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest ${horizon === "monthly" ? "bg-blue-600 text-white shadow" : "text-zinc-500"}`}><CalendarDays className="w-4 h-4" /> Monthly</button>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-500"><ListFilter className="w-4 h-4" /> Showing {visibleOpportunities.length} of {opportunities.length} matches</div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <label className="relative"><span className="sr-only">Index filter</span><select value={index} onChange={event => setIndex(event.target.value)} className="w-full appearance-none rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3 pr-9 text-xs font-black uppercase tracking-widest"><option value="all">Index: All Market</option>{indices.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-zinc-400" /></label>
                        <label className="relative"><span className="sr-only">Sector filter</span><select value={sector} onChange={event => setSector(event.target.value)} className="w-full appearance-none rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3 pr-9 text-xs font-black uppercase tracking-widest"><option value="all">Sector: All</option>{sectors.map(item => <option key={item} value={item}>{item}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-zinc-400" /></label>
                        <label className="relative"><span className="sr-only">Watchlist</span><select value={watchlistId} onChange={event => setWatchlistId(event.target.value)} className="w-full appearance-none rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3 pr-9 text-xs font-black uppercase tracking-widest"><option value="">Select watchlist</option>{watchlists.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-zinc-400" /></label>
                        <button onClick={() => setImportantOnly(value => !value)} className={`min-h-11 rounded-xl border px-4 py-3 inline-flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest ${importantOnly ? "border-blue-500 bg-blue-500/10 text-blue-600" : "border-zinc-200 dark:border-white/10 text-zinc-500"}`}><Filter className="w-4 h-4" /> {importantOnly ? "Important only" : "All ranked stocks"}</button>
                    </div>
                    {horizon === "monthly" && <p className="text-[11px] font-bold text-zinc-400">Monthly ranking uses price history, positive-session consistency, and current volume against the recent average. Index membership uses the available PSX feed; KSE30/KSE100 use liquidity ranking where constituents are not supplied.</p>}
                </section>

                {monthlyLoading && <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center gap-3 text-xs font-bold text-blue-600"><Loader2 className="w-4 h-4 animate-spin" /> Loading monthly history for the PSX universe. This can take a moment.</div>}

                <section className="card overflow-hidden">
                    <div className="px-4 sm:px-6 py-4 border-b border-zinc-100 dark:border-white/10 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-600" /><h2 className="text-sm font-black uppercase tracking-widest">Priority list</h2></div><span className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Score / 100</span></div>
                    {loading ? <div className="p-12 flex justify-center"><Loader2 className="w-7 h-7 text-blue-600 animate-spin" /></div> : visibleOpportunities.length === 0 ? <div className="p-12 text-center text-xs font-bold text-zinc-400">No important matches for these filters yet.</div> : <div className="divide-y divide-zinc-100 dark:divide-white/5">
                        {visibleOpportunities.slice(0, 100).map(item => {
                            const saved = watchlists.some(list => list._id === watchlistId && (list.symbols || []).includes(item.stock.symbol.toUpperCase()));
                            return <article key={item.stock.symbol} className="grid grid-cols-1 lg:grid-cols-[minmax(180px,1.4fr)_100px_minmax(190px,1.6fr)_repeat(3,minmax(75px,0.5fr))_auto] gap-3 lg:gap-5 items-center px-4 sm:px-6 py-4 hover:bg-blue-500/[0.03]">
                                <button onClick={() => router.push(`/stocks/${item.stock.symbol.toLowerCase()}`)} className="text-left min-w-0"><div className="flex items-center gap-2"><span className="font-black tracking-tight">{item.stock.symbol}</span><span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 truncate">{item.stock.sector || "Other"}</span></div><span className="block text-[11px] font-bold text-zinc-500 truncate mt-1">{item.stock.name}</span></button>
                                <div className="flex lg:block items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Score</span><span className="block text-xl font-black font-mono text-blue-600 tabular-nums">{item.score.toFixed(1)}</span></div>
                                <div className="min-w-0"><p className="text-[11px] font-black text-zinc-700 dark:text-zinc-200 leading-tight">{item.reasons[0]}</p><p className="text-[10px] text-zinc-400 mt-1 truncate">{item.reasons.slice(1).join(" · ")}</p></div>
                                {item.metrics.map(metric => <div key={metric.label} className="flex lg:block items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{metric.label}</span><span className="block text-xs font-black font-mono tabular-nums">{metric.value}</span></div>)}
                                <div className="flex justify-end"><button onClick={() => addToWatchlist(item.stock.symbol)} disabled={saved || !watchlistId} className={`min-h-10 px-3 rounded-xl inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${saved ? "text-green-600 bg-green-500/10" : "text-blue-600 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-40"}`} title={saved ? "Already in selected watchlist" : "Add to selected watchlist"}>{saved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}{saved ? "Saved" : "Watch"}</button></div>
                            </article>;
                        })}
                    </div>}
                </section>
            </div>
        </main>
    );
}
