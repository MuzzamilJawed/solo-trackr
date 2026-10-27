"use client";

import { Bitcoin, AlertTriangle, TrendingDown } from "lucide-react";

import PageSkeleton from "../components/PageSkeleton";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSettings } from "../context/SettingsContext";
import { useCurrency } from "../context/CurrencyContext";
import CurrencyToggle from "../components/CurrencyToggle";
import FitText from "../components/FitText";
import { rateOf } from "../lib/currency";
import { computePivotLevels, nextLevels } from "../lib/levels";
import dynamic from 'next/dynamic';
const TradingChart = dynamic(() => import('../components/TradingChart'), { ssr: false });
import { LOADING_CAPTION } from "../lib/caption";

const PER_PAGE = 20;

export default function CryptoPage() {
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState("");
    const [cryptoData, setCryptoData] = useState<any[]>([]);
    const [selectedCoin, setSelectedCoin] = useState<any>(null);
    const [trendData, setTrendData] = useState<any[]>([]);   // raw USD candles
    const [chartLoading, setChartLoading] = useState(false);
    const [chartTF, setChartTF] = useState("1W");
    const { settings } = useSettings();
    const { currency: displayCurrency, sym, rates, conv } = useCurrency();

    const pageRef = useRef(1);
    const hasMoreRef = useRef(true);
    const loadingMoreRef = useRef(false);
    const listRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Fetch one page of coins. mode: 'initial' | 'refresh' | 'more'
    const loadPage = useCallback(async (pageNum: number, mode: 'initial' | 'refresh' | 'more') => {
        if (mode === 'more') { setLoadingMore(true); loadingMoreRef.current = true; }
        else if (mode === 'initial') setLoading(true);
        try {
            const res = await fetch(`/api/crypto?page=${pageNum}&per_page=${PER_PAGE}`);
            if (!res.ok) throw new Error("Failed to fetch crypto prices");
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error("Bad crypto response");
            setError("");
            const more = data.length === PER_PAGE;
            setHasMore(more); hasMoreRef.current = more;

            setCryptoData(prev => {
                if (mode === 'refresh') {
                    // update prices in place, keep any already-appended coins
                    const map = new Map(prev.map((c: any) => [c.id, c]));
                    data.forEach((c: any) => map.set(c.id, c));
                    return Array.from(map.values());
                }
                if (mode === 'initial') return data;
                const ids = new Set(prev.map((c: any) => c.id));
                return [...prev, ...data.filter((c: any) => !ids.has(c.id))];
            });
            setSelectedCoin((prev: any) => prev ? (data.find((c: any) => c.id === prev.id) || prev) : (data[0] || null));
        } catch {
            if (mode !== 'more') setError("Unable to load crypto market data");
        } finally {
            setLoading(false);
            setLoadingMore(false); loadingMoreRef.current = false;
        }
    }, []);

    useEffect(() => { loadPage(1, 'initial'); }, [loadPage]);

    // Auto-refresh keeps the first page's prices live without disturbing scroll.
    useEffect(() => {
        if (!settings.refreshInterval || settings.refreshInterval <= 0) return;
        const interval = setInterval(() => loadPage(1, 'refresh'), settings.refreshInterval * 1000);
        return () => clearInterval(interval);
    }, [settings.refreshInterval, loadPage]);

    // Infinite scroll: load the next page when the sentinel enters the list.
    // Re-runs once `loading` flips false so it attaches after the real list
    // (and its refs) mount — the initial render shows a skeleton with null refs.
    useEffect(() => {
        if (loading) return;
        const root = listRef.current;
        const target = sentinelRef.current;
        if (!root || !target) return;
        const io = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting && hasMoreRef.current && !loadingMoreRef.current) {
                const next = pageRef.current + 1;
                pageRef.current = next;
                loadPage(next, 'more');
            }
        }, { root, rootMargin: "150px" });
        io.observe(target);
        return () => io.disconnect();
    }, [loadPage, loading]);

    // Real OHLC candles for the selected coin + timeframe.
    useEffect(() => {
        if (!selectedCoin?.id) { setTrendData([]); return; }
        let cancelled = false;
        setChartLoading(true);
        (async () => {
            try {
                const res = await fetch(`/api/crypto-history?id=${encodeURIComponent(selectedCoin.id)}&timeframe=${chartTF}`);
                const json = await res.json();
                if (cancelled) return;
                setTrendData(Array.isArray(json?.data) ? json.data : []);
            } catch {
                if (!cancelled) setTrendData([]);
            } finally {
                if (!cancelled) setChartLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedCoin?.id, chartTF]);

    // USD -> display-currency factor. PKR uses the feed's own implied rate so it
    // matches the pkrPrice the API returns; every other currency uses live FX.
    const impliedPkr = selectedCoin?.usdPrice ? (selectedCoin.pkrPrice / selectedCoin.usdPrice) : rateOf(rates, 'PKR');
    const fx = displayCurrency === 'USD' ? 1 : displayCurrency === 'PKR' ? impliedPkr : rateOf(rates, displayCurrency);
    const inDisplay = (usd: number) => usd * fx;
    const fmtLevel = (usd: number | null | undefined) =>
        usd == null ? '—' : `${sym}${inDisplay(usd).toLocaleString(undefined, { maximumFractionDigits: inDisplay(usd) > 1 ? 2 : 6 })}`;
    // Compact form for the tight 7-column pivot ladder (e.g. Rs.18.33M, $65.9K)
    const fmtCompact = (usd: number | null | undefined) => {
        if (usd == null) return '—';
        const v = inDisplay(usd);
        if (v >= 1000) return `${sym}${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(v)}`;
        return `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: v > 1 ? 2 : 5 })}`;
    };

    // Pivot support/resistance from real 24h high/low/close
    const levels = selectedCoin ? computePivotLevels(selectedCoin.high24h, selectedCoin.low24h, selectedCoin.usdPrice) : null;
    const nl = (levels && typeof selectedCoin?.usdPrice === 'number')
        ? nextLevels(selectedCoin.usdPrice, levels)
        : { nextResistance: null, nextSupport: null };

    // Candles converted to display currency + S/R price lines in the same units
    const displayTrend = useMemo(() => {
        if (fx === 1) return trendData;
        return trendData.map((c: any) => ({ ...c, open: c.open * fx, high: c.high * fx, low: c.low * fx, close: c.close * fx }));
    }, [trendData, fx]);

    const priceLines = useMemo(() => {
        const lines: { price: number; color: string; title: string }[] = [];
        if (nl.nextResistance != null) lines.push({ price: inDisplay(nl.nextResistance), color: '#ef4444', title: 'Resistance' });
        if (nl.nextSupport != null) lines.push({ price: inDisplay(nl.nextSupport), color: '#22c55e', title: 'Support' });
        return lines;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nl.nextResistance, nl.nextSupport, displayCurrency, fx]);

    const getCoinColor = (symbol: string) => {
        const colors: any = {
            BTC: '#f7931a', ETH: '#627eea', BNB: '#f3ba2f', SOL: '#14f195',
            XRP: '#23292f', ADA: '#0033ad', DOGE: '#c2a633', TRX: '#ef0027',
            DOT: '#e6007a', AVAX: '#e84142'
        };
        return colors[symbol] || '#3b82f6';
    };

    if (loading && cryptoData.length === 0) return <PageSkeleton variant="cards" />;

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white selection:bg-blue-500/30">
            {/* Dynamic Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-600/5 dark:bg-orange-600/8 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/5 dark:bg-blue-600/8 blur-[120px] rounded-full"></div>
            </div>

            {/* Sticky Header */}
            <header className="safe-top sticky top-0 z-50 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
                <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6 flex flex-row justify-between items-center gap-3">
                    <div className="min-w-0">
                        <h1 className="text-lg sm:text-3xl font-black tracking-tighter italic uppercase text-zinc-900 dark:text-white leading-none flex items-center gap-2 min-w-0">
                            <Bitcoin className="w-5 h-5 sm:w-7 sm:h-7 text-orange-500 shrink-0" strokeWidth={2} />
                            <FitText className="min-w-0 flex-1">Crypto <span className="text-orange-500">Hub</span></FitText>
                            <span className="hidden sm:inline-block bg-orange-500 text-white text-[11px] font-black px-2 py-0.5 rounded uppercase tracking-widest animate-pulse shrink-0">Live</span>
                        </h1>
                        <p className="text-zinc-500 dark:text-zinc-400 text-[11px] sm:text-xs font-black uppercase tracking-[0.2em] mt-1">Global Digital Asset Pulse</p>
                    </div>
                    <div className="shrink-0"><CurrencyToggle /></div>
                </div>
            </header>

            <div className="page-shell mx-auto p-4 sm:p-8 relative z-10">

                {error && (
                    <div className="mb-8 p-6 bg-red-500/10 border border-red-500/20 rounded-[2.5rem] flex items-center gap-4 animate-in fade-in slide-in-from-top-4">
                        <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" strokeWidth={2} />
                        <p className="text-red-500 font-black uppercase text-xs tracking-widest">{error}</p>
                    </div>
                )}

                {loading && cryptoData.length === 0 && (
                    <div className="py-24 flex flex-col items-center justify-center gap-4">
                        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-zinc-500 font-black uppercase text-[11px] tracking-widest">{LOADING_CAPTION}</p>
                    </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 mb-8">
                    {cryptoData.slice(0, 5).map((coin) => (
                        <div key={coin.id} onClick={() => setSelectedCoin(coin)} className="cursor-pointer group">
                            <div className={`card p-4 sm:p-5 transition-all ${selectedCoin?.id === coin.id ? 'border-orange-500/50 shadow-xl' : 'hover:border-zinc-400 dark:hover:border-white/20'}`}>
                                <div className="flex justify-between items-center mb-2 sm:mb-3">
                                    <span className="font-black text-zinc-900 dark:text-zinc-50 text-xs sm:text-sm tracking-tighter uppercase italic">{coin.symbol}</span>
                                    <span className={`text-[11px] font-black ${coin.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {coin.changePercent >= 0 ? '+' : ''}{(coin.changePercent ?? 0).toFixed(1)}%
                                    </span>
                                </div>
                                <div className="text-lg sm:text-2xl font-mono font-black text-zinc-900 dark:text-white tracking-tighter italic">
                                    {sym}{(conv(coin.usdPrice, coin.pkrPrice) ?? 0).toLocaleString(undefined, { maximumFractionDigits: (coin.usdPrice ?? 0) > 1 ? 2 : 4 })}
                                </div>
                                <div className="text-[11px] sm:text-xs font-black text-zinc-500 uppercase tracking-widest mt-1 sm:mt-2 truncate">{coin.name}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-8">
                    <div className="card lg:col-span-3 p-6 sm:p-10 relative overflow-hidden">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                            <div>
                                <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-50 uppercase italic tracking-tighter">
                                    {selectedCoin?.name} <span className="text-zinc-400 font-normal">Pulse</span>
                                </h2>
                                <div className="flex flex-wrap items-center gap-4 mt-2">
                                    <span className="text-xl sm:text-4xl font-mono font-black text-zinc-900 dark:text-white tracking-tighter italic">
                                        {sym}{conv(selectedCoin?.usdPrice, selectedCoin?.pkrPrice)?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </span>
                                    <span className={`text-xs sm:text-base font-black ${selectedCoin?.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {selectedCoin?.changePercent >= 0 ? '▲' : '▼'} {Math.abs(selectedCoin?.changePercent || 0).toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                            {/* Next support / resistance (pivot levels from real 24h H/L/C) */}
                            <div className="flex items-center gap-2 sm:gap-3">
                                <div className="px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-left min-w-[92px]">
                                    <div className="text-[10px] font-black text-green-600/80 dark:text-green-400/80 uppercase tracking-[0.15em] mb-0.5">Next Support</div>
                                    <div className="text-sm font-mono font-black text-green-600 dark:text-green-400 leading-none tabular-nums">{fmtLevel(nl.nextSupport)}</div>
                                </div>
                                <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-left min-w-[92px]">
                                    <div className="text-[10px] font-black text-red-600/80 dark:text-red-400/80 uppercase tracking-[0.15em] mb-0.5">Next Resistance</div>
                                    <div className="text-sm font-mono font-black text-red-600 dark:text-red-400 leading-none tabular-nums">{fmtLevel(nl.nextResistance)}</div>
                                </div>
                            </div>
                        </div>

                        <div className="h-[400px] sm:h-[520px] w-full relative">
                            {chartLoading && (
                                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/40 dark:bg-black/40 backdrop-blur-sm rounded-2xl">
                                    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            )}
                            {!chartLoading && displayTrend.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                                    <TrendingDown className="w-8 h-8 text-zinc-400" strokeWidth={2} />
                                    <p className="text-zinc-500 font-black uppercase text-[11px] tracking-widest">No chart data for this coin</p>
                                </div>
                            ) : (
                                <TradingChart
                                    title={`${selectedCoin?.name || ''} Price`}
                                    data={displayTrend}
                                    currentTimeframe={chartTF}
                                    onTimeframeChange={setChartTF}
                                    currencySymbol={sym}
                                    priceLines={priceLines}
                                    seamless
                                />
                            )}
                        </div>

                        {/* Full pivot level ladder */}
                        {levels && (
                            <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-white/5">
                                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-3">Pivot Levels · Support / Resistance (24h)</div>
                                <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                                    {[
                                        { label: 'S3', val: levels.s3, tone: 'text-green-600 dark:text-green-400' },
                                        { label: 'S2', val: levels.s2, tone: 'text-green-600 dark:text-green-400' },
                                        { label: 'S1', val: levels.s1, tone: 'text-green-600 dark:text-green-400' },
                                        { label: 'PIVOT', val: levels.pivot, tone: 'text-zinc-900 dark:text-white' },
                                        { label: 'R1', val: levels.r1, tone: 'text-red-600 dark:text-red-400' },
                                        { label: 'R2', val: levels.r2, tone: 'text-red-600 dark:text-red-400' },
                                        { label: 'R3', val: levels.r3, tone: 'text-red-600 dark:text-red-400' },
                                    ].map(lvl => (
                                        <div key={lvl.label} title={fmtLevel(lvl.val)} className="card-inset px-2 py-2 text-center">
                                            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">{lvl.label}</div>
                                            <div className={`text-[11px] sm:text-xs font-mono font-black tabular-nums ${lvl.tone}`}>{fmtCompact(lvl.val)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="card overflow-hidden h-fit">
                        <div className="p-5 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between gap-2">
                            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Market Surveillance</h2>
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 tabular-nums">{cryptoData.length} coins</span>
                        </div>
                        <div ref={listRef} className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[520px] lg:max-h-[760px] overflow-y-auto custom-scrollbar">
                            {cryptoData.map((coin) => (
                                <div
                                    key={coin.id}
                                    onClick={() => setSelectedCoin(coin)}
                                    className={`p-4 sm:p-5 cursor-pointer hover:bg-white/[0.02] transition-all flex justify-between items-center gap-2 ${selectedCoin?.id === coin.id ? 'bg-orange-500/5 dark:bg-orange-900/10' : ''}`}
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl flex items-center justify-center font-black text-white text-[11px] sm:text-xs tracking-tighter" style={{ backgroundColor: getCoinColor(coin.symbol) }}>
                                            {coin.symbol[0]}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-black text-zinc-900 dark:text-zinc-50 uppercase italic text-xs sm:text-sm tracking-tighter truncate">{coin.symbol}</div>
                                            <div className="text-[10px] sm:text-[11px] text-zinc-500 uppercase font-black tracking-widest truncate">{coin.name}</div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-mono font-black text-zinc-900 dark:text-white text-xs sm:text-sm tracking-tighter tabular-nums">
                                            {sym}{(conv(coin.usdPrice, coin.pkrPrice) ?? 0).toLocaleString(undefined, { maximumFractionDigits: (coin.usdPrice ?? 0) > 1 ? 2 : 4 })}
                                        </div>
                                        <div className={`text-[11px] sm:text-xs font-black ${coin.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            {coin.changePercent >= 0 ? '+' : ''}{(coin.changePercent ?? 0).toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Infinite-scroll sentinel + status */}
                            <div ref={sentinelRef} className="h-1"></div>
                            {loadingMore && (
                                <div className="py-4 flex items-center justify-center gap-2">
                                    <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Loading more…</span>
                                </div>
                            )}
                            {!hasMore && cryptoData.length > 0 && (
                                <div className="py-4 text-center text-[10px] font-black uppercase tracking-widest text-zinc-400">— End of market —</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
