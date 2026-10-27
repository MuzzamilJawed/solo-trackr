"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { useSettings } from "../context/SettingsContext";
import { useCurrency } from "../context/CurrencyContext";
import { fetchOilPrices } from "../lib/api";

const TradingChart = dynamic(() => import("./TradingChart"), { ssr: false });
import { LOADING_CAPTION } from "../lib/caption";
import LoadErrorBanner from "./LoadErrorBanner";

const COMPARE_METRICS: { key: 'changePercent' | 'weekly' | 'monthly' | 'yearly'; label: string }[] = [
    { key: 'changePercent', label: '24h' },
    { key: 'weekly', label: '7D' },
    { key: 'monthly', label: '30D' },
    { key: 'yearly', label: '52W' },
];

type Candle = { time: string | number; open: number; high: number; low: number; close: number; volume?: number };

// Real USD futures candles from /api/market-history for one contract/timeframe.
function useOilHistory(key: string, timeframe: string) {
    // Tagged with the request it answers, so a stale result reads as "loading"
    // for the new key/timeframe without setting state inside the effect.
    const [state, setState] = useState<{ req: string; data: Candle[]; status: "ok" | "unavailable" }>({ req: "", data: [], status: "unavailable" });
    const req = `${key}|${timeframe}`;

    useEffect(() => {
        if (!key) return;
        let cancelled = false;
        fetch(`/api/market-history?oil=${encodeURIComponent(key)}&timeframe=${timeframe}`)
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                const ok = json?.success && Array.isArray(json.data) && json.data.length;
                setState({ req, data: ok ? json.data : [], status: ok ? "ok" : "unavailable" });
            })
            .catch(() => { if (!cancelled) setState({ req, data: [], status: "unavailable" }); });
        return () => { cancelled = true; };
    }, [key, timeframe, req]);

    return state.req === req ? state : { ...state, data: [], status: "loading" as const };
}

// Interactive candlestick + momentum trend + head-to-head matrix for energy
// contracts. Moved off the main Energy Markets screen into its own route.
export default function OilGraphAnalysis() {
    const { settings } = useSettings();
    const { sym, conv } = useCurrency();
    const { currency: tableCurrency } = useCurrency();
    const router = useRouter();

    const [allEnergy, setAllEnergy] = useState<any[]>([]);
    const [selected, setSelected] = useState("crudeOil");
    const [candleTimeframe, setCandleTimeframe] = useState("1D"); // 1H | 1D | 1W | 1M
    const [trendTimeframe, setTrendTimeframe] = useState("Daily"); // Daily | Weekly | Monthly | Yearly
    const [compareMetric, setCompareMetric] = useState<'changePercent' | 'weekly' | 'monthly' | 'yearly'>('changePercent');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    const loadPrices = useCallback(async (isManual = true) => {
        try {
            if (isManual) setLoading(true);
            const data = await fetchOilPrices();
            if (!data) {
                setLoadError(true);
                return;
            }
            setLoadError(false);
            const list: any[] = data.allEnergy || [];
            setAllEnergy(list);
            // Default to the first available contract if the current one is gone.
            if (list.length && !list.some((i) => i.key === selected)) {
                setSelected(list[0].key);
            }
        } catch (err) {
            console.error("Failed to fetch energy data:", err);
            setLoadError(true);
        } finally {
            if (isManual) setLoading(false);
        }
    }, [selected]);

    useEffect(() => {
        loadPrices(true);
    }, []);

    useEffect(() => {
        if (!settings.refreshInterval || settings.refreshInterval <= 0) return;
        const interval = setInterval(() => loadPrices(false), settings.refreshInterval * 1000);
        return () => clearInterval(interval);
    }, [settings.refreshInterval, loadPrices]);

    const selectedItem = useMemo(
        () => allEnergy.find((i) => i.key === selected) || allEnergy[0],
        [allEnergy, selected]
    );
    const activeName = selectedItem?.name || "Markets";

    // USD -> display currency, using the same factor as the live price.
    const scale = useMemo(() => {
        if (!selectedItem?.price) return 0;
        return (conv(selectedItem.price, selectedItem.pkrPrice) ?? 0) / selectedItem.price;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedItem, tableCurrency, conv]);

    // ── Real candlestick series (OHLC) for the selected contract ─────────────────
    const candleHistory = useOilHistory(selected, candleTimeframe);
    const candles = useMemo(() => {
        if (!scale) return [];
        const s = (n: number) => parseFloat((n * scale).toFixed(4));
        return candleHistory.data.map((c) => ({ ...c, open: s(c.open), high: s(c.high), low: s(c.low), close: s(c.close) }));
    }, [candleHistory.data, scale]);

    // ── Momentum trend (area): closes of the matching real candle series ─────────
    const TREND_SOURCE: Record<string, { tf: string; points: number }> = {
        Daily: { tf: "1H", points: 24 },
        Weekly: { tf: "1D", points: 7 },
        Monthly: { tf: "1D", points: 30 },
        Yearly: { tf: "1W", points: 52 },
    };
    const trendSrc = TREND_SOURCE[trendTimeframe];
    const trendHistory = useOilHistory(selected, trendSrc.tf);
    const trendData = useMemo(() => {
        if (!scale) return [];
        const coarse = (selectedItem?.price ?? 0) * scale >= 1000;
        return trendHistory.data.slice(-trendSrc.points).map((c) => {
            const label = typeof c.time === "number"
                ? new Date(c.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : new Date(c.time + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" });
            const price = c.close * scale;
            return { name: label, price: coarse ? Math.round(price) : parseFloat(price.toFixed(2)) };
        });
    }, [trendHistory.data, trendSrc.points, scale, selectedItem]);

    // ── Cross-market comparison ranked by the selected timeframe ─────────────────
    const comparison = useMemo(() => {
        const rows = allEnergy
            .map((i) => ({ key: i.key, name: i.name, value: Number(i[compareMetric] ?? 0) }))
            .sort((a, b) => b.value - a.value);
        const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
        return { rows, maxAbs };
    }, [allEnergy, compareMetric]);

    if (loading && allEnergy.length === 0) {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-zinc-500 font-black uppercase text-[11px] tracking-widest">{LOADING_CAPTION}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 sm:space-y-12">
            {loadError && <LoadErrorBanner hasData={allEnergy.length > 0} what="energy prices" onRetry={() => loadPrices(true)} />}
            {/* Contract selector */}
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em]">Contract</span>
                <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    className="bg-zinc-100 dark:bg-zinc-800/50 rounded-xl px-4 py-2.5 text-[11px] sm:text-xs font-black uppercase tracking-widest border-none outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-zinc-200 cursor-pointer"
                >
                    {allEnergy.map((item) => (
                        <option key={item.key} value={item.key}>{item.name}</option>
                    ))}
                </select>
            </div>

            {/* ── Interactive candlestick ── */}
            <div className="bg-white dark:bg-app-dark rounded-2xl sm:rounded-[3rem] shadow-sm p-4 sm:p-8 border border-zinc-200 dark:border-white/5">
                <div className="mb-4 sm:mb-6">
                    <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter">Candlestick Analysis</h2>
                    <p className="text-zinc-500 text-[11px] font-black uppercase tracking-widest mt-1">Interactive OHLC · SMA · Volume — <span className="text-blue-500">{activeName}</span></p>
                </div>
                <div className="h-[380px] sm:h-[600px] w-full">
                    {candleHistory.status === "unavailable" ? (
                        <div className="h-full flex items-center justify-center text-center">
                            <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Price history unavailable for {activeName}</p>
                        </div>
                    ) : (
                        <TradingChart
                            title={`${activeName} Market Analysis`}
                            data={candles}
                            currentTimeframe={candleTimeframe}
                            onTimeframeChange={setCandleTimeframe}
                            currencySymbol={sym}
                            seamless
                        />
                    )}
                </div>
            </div>

            {/* Momentum + matrix sit side by side from xl up, stacked below it */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 sm:gap-8">
                {/* ── Market Momentum (area trend) ── */}
                <div className="card p-5 sm:p-8 relative overflow-hidden flex flex-col">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] -translate-y-1/2 translate-x-1/2"></div>

                    {/* The card is half-width, so the header always stacks — a side-by-side
                    header would wrap the title however wide the viewport is. */}
                    <div className="relative z-10 flex flex-col items-start mb-6 sm:mb-8 gap-4">
                        <div className="min-w-0 w-full">
                            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-50 uppercase italic tracking-tighter">Market Momentum</h2>
                            <p className="text-zinc-500 text-[11px] font-black uppercase tracking-widest mt-1 truncate">Velocity Trace: <span className="text-blue-500">{activeName}</span></p>
                        </div>

                        <div className="flex bg-zinc-100 dark:bg-zinc-800/50 rounded-xl p-1 w-full shrink-0">
                            {['Daily', 'Weekly', 'Monthly', 'Yearly'].map((tf) => (
                                <button
                                    key={tf}
                                    onClick={() => setTrendTimeframe(tf)}
                                    className={`flex-1 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-black rounded-lg transition-all uppercase tracking-widest ${trendTimeframe === tf ? 'bg-white dark:bg-zinc-700 shadow text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-900'}`}
                                >
                                    {tf}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="h-[320px] sm:h-[380px] w-full relative z-10 mt-auto">
                        {trendHistory.status === "unavailable" ? (
                            <div className="h-full flex items-center justify-center text-center">
                                <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Trend unavailable for {activeName}</p>
                            </div>
                        ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData}>
                                <defs>
                                    <linearGradient id="colorOilAnalysis" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                {/* minTickGap keeps the labels readable at half width */}
                                <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} tick={{ fontWeight: 800 }} minTickGap={24} />
                                <YAxis
                                    stroke="#52525b"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    domain={['auto', 'auto']}
                                    tickFormatter={(v) => v >= 1000 ? `${sym}${(v / 1000).toFixed(1)}k` : `${sym}${v}`}
                                    tick={{ fontWeight: 800 }}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '24px', color: '#fff', padding: '16px' }}
                                    itemStyle={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '10px' }}
                                    labelStyle={{ fontWeight: 900, marginBottom: '8px', color: '#71717a' }}
                                    formatter={(v: any) => [`${sym}${Number(v).toLocaleString()}`, 'Execution Price']}
                                />
                                <Area type="monotone" dataKey="price" stroke="#3b82f6" fillOpacity={1} fill="url(#colorOilAnalysis)" strokeWidth={4} animationDuration={1500} />
                            </AreaChart>
                        </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* ── Cross-Market Performance Matrix ── */}
                <div className="card p-5 sm:p-8 flex flex-col">
                    <div className="flex flex-col items-start gap-4 mb-6 sm:mb-8">
                        <div className="min-w-0 w-full">
                            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-50 uppercase italic tracking-tighter">Performance Matrix</h2>
                            <p className="text-zinc-500 text-[11px] font-black uppercase tracking-widest mt-1">Every energy contract, ranked head-to-head</p>
                        </div>
                        <div className="flex bg-zinc-100 dark:bg-zinc-800/50 rounded-xl p-1 w-full shrink-0">
                            {COMPARE_METRICS.map((m) => (
                                <button
                                    key={m.key}
                                    onClick={() => setCompareMetric(m.key)}
                                    className={`flex-1 px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs font-black rounded-lg transition-all uppercase tracking-widest ${compareMetric === m.key ? 'bg-white dark:bg-zinc-700 shadow text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-900'}`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2.5 my-auto">
                        {comparison.rows.map((row) => {
                            const pos = row.value >= 0;
                            const widthPct = (Math.abs(row.value) / comparison.maxAbs) * 50;
                            return (
                                <button
                                    key={row.key}
                                    onClick={() => router.push(`/oil/${row.key}`)}
                                    className="w-full group flex items-center gap-2 sm:gap-4 text-left"
                                >
                                    <span className="w-24 sm:w-32 shrink-0 text-[11px] sm:text-xs font-black uppercase italic tracking-tight text-zinc-700 dark:text-zinc-300 group-hover:text-blue-500 transition-colors truncate" title={row.name}>
                                        {row.name}
                                    </span>
                                    <div className="flex-1 flex items-center h-6 relative">
                                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-200 dark:bg-zinc-700" />
                                        <div className="w-1/2 flex justify-end">
                                            {!pos && (
                                                <div className="h-3 sm:h-3.5 rounded-l-md bg-gradient-to-l from-red-500 to-red-500/60" style={{ width: `${widthPct * 2}%` }} />
                                            )}
                                        </div>
                                        <div className="w-1/2 flex justify-start">
                                            {pos && (
                                                <div className="h-3 sm:h-3.5 rounded-r-md bg-gradient-to-r from-green-500 to-green-500/60" style={{ width: `${widthPct * 2}%` }} />
                                            )}
                                        </div>
                                    </div>
                                    <span className={`w-14 sm:w-[70px] shrink-0 text-right text-[11px] sm:text-xs font-black font-mono tabular-nums ${pos ? 'text-green-500' : 'text-red-500'}`}>
                                        {pos ? '+' : ''}{row.value.toFixed(2)}%
                                    </span>
                                </button>
                            );
                        })}
                        {comparison.rows.length === 0 && (
                            <p className="py-10 text-center text-zinc-400 font-black uppercase tracking-widest text-[11px]">No comparison data available</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
