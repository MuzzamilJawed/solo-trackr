"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from 'next/dynamic';
const TradingChart = dynamic(() => import('../../components/TradingChart'), { ssr: false });
import { useSettings } from "../../context/SettingsContext";
import StockCard from "../../components/StockCard";
import FitText from "../../components/FitText";
import { computePivotLevels, nextLevels } from "../../lib/levels";
import { circuitLimits, CIRCUIT_CAP } from "../../lib/stockSignals";
import { Radar, AlertTriangle, ArrowLeft, BarChart3, Newspaper, Star, Lock } from "lucide-react";
import { LOADING_CAPTION } from "../../lib/caption";

interface Stock {
    symbol: string;
    name: string;
    currentPrice: number;
    change: number;
    changePercent: number;
    open: number;
    high: number;
    low: number;
    volume: string;
    sector?: string;
    /** Last Day Closing Price — basis for the day's circuit limits. */
    ldcp?: number | null;
}

export default function StockDetailPage() {
    const params = useParams();
    const symbol = (params.symbol as string)?.toUpperCase();
    const router = useRouter();
    const { settings } = useSettings();
    // PSX is a PKR market — never converted to the display currency.

    const [stock, setStock] = useState<Stock | null>(null);
    const [relatedStocks, setRelatedStocks] = useState<Stock[]>([]);
    const [loading, setLoading] = useState(true);
    const [watchlists, setWatchlists] = useState<any[]>([]);
    const [candles, setCandles] = useState<any[]>([]);
    const [timeframe, setTimeframe] = useState("1D");
    const [chartLoading, setChartLoading] = useState(false);
    const [deepDetails, setDeepDetails] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const fetchWatchlists = useCallback(async () => {
        try {
            const res = await fetch('/api/watchlists');
            const json = await res.json();
            if (json.success) setWatchlists(json.data);
        } catch (err) {
            console.error('Failed to fetch watchlists', err);
        }
    }, []);

    const fetchDeepDetails = useCallback(async () => {
        if (!symbol) return;
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/psx-detail?symbol=${symbol}`);
            const json = await res.json();
            if (json.success) {
                setDeepDetails(json.data);
            }
        } catch (err) {
            console.error('Failed to fetch deep details', err);
        } finally {
            setDetailLoading(false);
        }
    }, [symbol]);

    const fetchStockData = useCallback(async () => {
        if (!symbol) return;
        setLoading(true);
        try {
            const res = await fetch('/api/psx-stocks');
            const json = await res.json();
            const data: Stock[] = json?.data || [];
            const s = data.find(st => st.symbol?.toUpperCase() === symbol);

            if (s) {
                setStock(s);
                // Get related stocks from same sector
                if (s.sector) {
                    const related = data
                        .filter(st => st.sector === s.sector && st.symbol?.toUpperCase() !== symbol)
                        .slice(0, 5);
                    setRelatedStocks(related);
                }
            }
        } catch (err) {
            // Silently handle
        } finally {
            setLoading(false);
        }
    }, [symbol]);

    const fetchHistory = useCallback(async (s: string, tf: string, currentAsset: any) => {
        setChartLoading(true);
        try {
            const res = await fetch(`/api/psx-history?symbol=${s}&timeframe=${tf}`);
            const json = await res.json();

            if (json.success && json.data) {
                let history = [...json.data];

                // Inject Live Candle from Real-time data
                if (currentAsset && currentAsset.currentPrice) {
                    const now = new Date();
                    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    let currentPrice = parseFloat(currentAsset.currentPrice);
                    let change = parseFloat(currentAsset.change || 0);

                    if (!isNaN(currentPrice)) {
                        const lastIndex = history.length - 1;
                        let lastTime = lastIndex >= 0 ? history[lastIndex].time : null;

                        // Price Discrepancy Correction
                        if (lastIndex >= 0) {
                            const lastClose = history[lastIndex].close;
                            const diffRatio = currentPrice / lastClose;
                            if (diffRatio > 8 || diffRatio < 0.12) {
                                const factor = Math.round(1 / diffRatio);
                                if (factor === 10 || factor === 100 || factor === 1000) {
                                    currentPrice *= factor;
                                    change *= factor;
                                } else {
                                    const revFactor = Math.round(diffRatio);
                                    if (revFactor === 10 || revFactor === 100 || revFactor === 1000) {
                                        currentPrice /= revFactor;
                                        change /= revFactor;
                                    }
                                }
                            }
                        }

                        // Detect if history uses timestamps (number) or date strings
                        const useTimestamp = typeof lastTime === 'number';
                        const liveTime = useTimestamp ? Math.floor(now.getTime() / 1000) : todayStr;

                        let liveCandle: any = {
                            time: liveTime,
                            open: currentAsset.open ? (parseFloat(currentAsset.open) * (currentPrice / parseFloat(currentAsset.currentPrice))) : (currentPrice - change),
                            high: currentAsset.high ? (parseFloat(currentAsset.high) * (currentPrice / parseFloat(currentAsset.currentPrice))) : Math.max(currentPrice, (currentPrice - change)),
                            low: currentAsset.low ? (parseFloat(currentAsset.low) * (currentPrice / parseFloat(currentAsset.currentPrice))) : Math.min(currentPrice, (currentPrice - change)),
                            close: currentPrice,
                            volume: parseInt((currentAsset.volume || '0').replace(/[^0-9]/g, '')) || 0
                        };

                        if (tf === '1H') {
                            if (lastIndex >= 0 && (lastTime === liveTime || lastTime === todayStr)) {
                                history.splice(lastIndex, 1);
                            }
                            const todayHours = [];
                            const startHour = 9;
                            const currentHour = now.getHours();
                            const marketCloseHour = 16;
                            for (let h = startHour; h <= Math.min(currentHour, marketCloseHour); h++) {
                                const hTime = new Date(now);
                                hTime.setHours(h, 0, 0, 0);
                                const hTimeSec = Math.floor(hTime.getTime() / 1000);
                                const progress = (h - startHour + 1) / (Math.min(currentHour, marketCloseHour) - startHour + 1);
                                const hPrice = liveCandle.open + (currentPrice - liveCandle.open) * progress;
                                todayHours.push({
                                    ...liveCandle,
                                    time: hTimeSec,
                                    open: hPrice * 0.999,
                                    high: Math.max(hPrice, hPrice * 1.001),
                                    low: Math.min(hPrice, hPrice * 0.998),
                                    close: hPrice,
                                    volume: Math.floor(liveCandle.volume / 8)
                                });
                            }
                            if (todayHours.length > 0) history.push(...todayHours);
                        } else {
                            if (lastIndex >= 0) {
                                if (lastTime === liveTime || lastTime === todayStr) {
                                    history[lastIndex] = { ...history[lastIndex], ...liveCandle };
                                } else if ((!useTimestamp && todayStr > (lastTime as string)) ||
                                    (useTimestamp && (liveTime as number) > (lastTime as number))) {
                                    history.push(liveCandle);
                                }
                            } else {
                                history = [liveCandle];
                            }
                        }
                    }
                }
                setCandles(history);
            } else {
                const currentPrice = parseFloat(currentAsset?.currentPrice);
                if (currentAsset && !isNaN(currentPrice)) {
                    const now = new Date();
                    const change = parseFloat(currentAsset.change || 0);
                    const liveTime = tf === '1H'
                        ? Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime() / 1000)
                        : Math.floor(now.getTime() / 1000);
                    setCandles([{
                        time: liveTime,
                        open: currentAsset.open ? parseFloat(currentAsset.open) : (currentPrice - change),
                        high: currentAsset.high ? parseFloat(currentAsset.high) : Math.max(currentPrice, (currentPrice - change)),
                        low: currentAsset.low ? parseFloat(currentAsset.low) : Math.min(currentPrice, (currentPrice - change)),
                        close: currentPrice,
                        volume: 0
                    }]);
                }
            }
        } catch (err) {
            console.error('Failed to fetch history', err);
        } finally {
            setChartLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStockData();
        fetchWatchlists();
        fetchDeepDetails();
    }, [fetchStockData, fetchWatchlists, fetchDeepDetails]);

    useEffect(() => {
        if (symbol && stock) {
            fetchHistory(symbol, timeframe, stock);
        }
    }, [symbol, timeframe, fetchHistory, stock]);

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-app-dark flex items-center justify-center relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full"></div>
                <div className="flex flex-col items-center gap-8 relative z-10">
                    <div className="relative">
                        <div className="w-20 h-20 border-4 border-blue-600/20 rounded-full"></div>
                        <div className="w-20 h-20 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                        <div className="absolute inset-0 flex items-center justify-center text-blue-600"><Radar className="w-8 h-8" strokeWidth={2} /></div>
                    </div>
                    <div className="text-center">
                        <p className="text-zinc-900 dark:text-white font-black uppercase text-xs tracking-[0.4em] animate-pulse">{LOADING_CAPTION}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!stock) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-app-dark flex items-center justify-center relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-600/10 blur-[120px] rounded-full"></div>
                <div className="flex flex-col items-center gap-8 relative z-10 p-8 text-center bg-white/40 dark:bg-white/[0.02] backdrop-blur-3xl rounded-[3rem] border border-white/10 shadow-2xl">
                    <div className="w-20 h-20 bg-red-600/10 rounded-full flex items-center justify-center mb-4"><AlertTriangle className="w-8 h-8 text-red-500" strokeWidth={2} /></div>
                    <h1 className="text-3xl font-black text-zinc-900 dark:text-white italic uppercase tracking-tighter mb-2">Terminal Error</h1>
                    <p className="text-zinc-500 mb-8 uppercase text-[11px] tracking-[0.2em] font-black">No market data footprint for {symbol}</p>
                    <button onClick={() => router.push('/stocks')} className="bg-blue-600 text-white px-10 py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.3em] hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20 active:scale-95">Back to Market Explorer</button>
                </div>
            </div>
        );
    }

    const isPositive = stock.change >= 0;

    // Support / resistance (pivot points) from the session high/low/close
    const srLevels = computePivotLevels(stock.high, stock.low, stock.currentPrice);
    const srNext = (srLevels && typeof stock.currentPrice === 'number')
        ? nextLevels(stock.currentPrice, srLevels)
        : { nextResistance: null as number | null, nextSupport: null as number | null };
    const fmtSR = (v: number | null | undefined) =>
        v == null ? '—' : `Rs.${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const srPriceLines = [
        ...(srNext.nextResistance != null ? [{ price: srNext.nextResistance, color: '#ef4444', title: 'Resistance' }] : []),
        ...(srNext.nextSupport != null ? [{ price: srNext.nextSupport, color: '#22c55e', title: 'Support' }] : []),
    ];

    // The day's upper / lower lock prices — fixed for the session off LDCP.
    const circuit = circuitLimits(stock.ldcp, stock.currentPrice, stock.change);
    const fmtLock = (v: number) => `Rs.${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark selection:bg-blue-500/30">
            {/* Header */}
            <header className="safe-top sticky top-0 z-50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
                <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6 flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
                        <button onClick={() => router.push('/stocks')} className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center group shrink-0">
                            <ArrowLeft className="w-5 h-5 text-zinc-500 group-hover:text-blue-500 transition-colors" strokeWidth={2} />
                        </button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl sm:text-3xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter leading-none truncate">{stock.symbol}</h1>
                                <span className="text-[10px] sm:text-[11px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0">PSX</span>
                            </div>
                            <p className="text-zinc-500 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] mt-1 sm:mt-2 flex items-center gap-2 truncate">
                                {stock.name}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                        <button
                            onClick={() => router.push(`/stocks/report/${symbol}?exchange=PSX&from=stock`)}
                            className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] sm:text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95 shrink-0"
                            title="View full equity research report"
                        >
                            <BarChart3 className="w-4 h-4" strokeWidth={2} />
                            <span className="hidden sm:inline">Full Report</span>
                        </button>
                        <div className="text-right shrink-0 max-w-[45vw] sm:max-w-none">
                            <FitText className="text-xl sm:text-3xl font-black text-zinc-900 dark:text-white font-mono tracking-tighter leading-none">
                                Rs.{stock.currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </FitText>
                            <p className={`text-[11px] sm:text-sm font-black flex items-center justify-end gap-1 mt-1 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                                {isPositive ? '▲' : '▼'}{Math.abs(stock.change).toFixed(2)} ({Math.abs(stock.changePercent).toFixed(2)}%)
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="page-shell mx-auto px-4 sm:px-8 py-8 sm:py-12 space-y-8 sm:space-y-12">
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-8">
                    {[
                        { label: "Execution High", value: `Rs.${stock.high?.toFixed(1)}`, sub: "Daily Range High", color: 'text-green-500' },
                        { label: "Execution Low", value: `Rs.${stock.low?.toFixed(1)}`, sub: "Daily Range Low", color: 'text-red-500' },
                        { label: "Market Volume", value: stock.volume, sub: "Traded Shares", color: 'text-blue-500' },
                        { label: "Settle Price", value: `Rs.${stock.open?.toFixed(1)}`, sub: "Session Opening", color: 'text-zinc-500' },
                    ].map((stat, i) => (
                        <div key={i} className="card p-4 sm:p-8">
                            <p className="text-[7px] sm:text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 sm:mb-2">{stat.label}</p>
                            <div className="text-sm sm:text-2xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter mb-0.5 sm:mb-1">{stat.value}</div>
                            <div className={`text-[10px] sm:text-[11px] font-black ${stat.color}`}>{stat.sub}</div>
                        </div>
                    ))}
                </div>

                {/* Daily circuit limits — the prices PSX will halt trading at today */}
                {circuit && (
                    <div className="card p-4 sm:p-8">
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="min-w-0">
                                <h2 className="text-base sm:text-xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter">Circuit Limits</h2>
                                <p className="text-zinc-500 text-[10px] sm:text-[11px] font-black uppercase tracking-widest mt-0.5">
                                    ±{CIRCUIT_CAP}% of LDCP {fmtLock(circuit.ldcp)} · Today
                                </p>
                            </div>
                            {(circuit.status === 'upper-lock' || circuit.status === 'lower-lock') && (
                                <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${circuit.status === 'upper-lock'
                                    ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                    : 'bg-red-500/15 text-red-600 dark:text-red-400'}`}>
                                    <Lock className="w-3 h-3 shrink-0" strokeWidth={2.5} />
                                    {circuit.status === 'upper-lock' ? 'Upper lock' : 'Lower lock'}
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                            <div className="min-w-0 rounded-xl sm:rounded-2xl bg-red-500/[0.06] border border-red-500/15 p-2.5 sm:p-4">
                                <p className="text-[10px] font-black text-red-600/80 dark:text-red-400/80 uppercase tracking-widest mb-1">Lower Lock</p>
                                <FitText className="text-sm sm:text-xl font-black font-mono tabular-nums text-red-600 dark:text-red-400">
                                    {fmtLock(circuit.lower)}
                                </FitText>
                                <p className="text-[10px] font-bold text-zinc-400 mt-1">{circuit.toLowerPct.toFixed(2)}% below</p>
                            </div>
                            <div className="min-w-0 rounded-xl sm:rounded-2xl bg-green-500/[0.06] border border-green-500/15 p-2.5 sm:p-4">
                                <p className="text-[10px] font-black text-green-600/80 dark:text-green-400/80 uppercase tracking-widest mb-1">Upper Lock</p>
                                <FitText className="text-sm sm:text-xl font-black font-mono tabular-nums text-green-600 dark:text-green-400">
                                    {fmtLock(circuit.upper)}
                                </FitText>
                                <p className="text-[10px] font-bold text-zinc-400 mt-1">{circuit.toUpperPct.toFixed(2)}% to go</p>
                            </div>
                        </div>

                        {/* Where the price currently sits inside the allowed band */}
                        <div className="mt-4">
                            <div className="relative h-2 rounded-full bg-gradient-to-r from-red-500/40 via-zinc-200 dark:via-zinc-700 to-green-500/40">
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white dark:border-zinc-900 shadow"
                                    style={{ left: `${circuit.position}%` }}
                                    title={`Trading at ${fmtLock(stock.currentPrice)}`}
                                />
                            </div>
                            <div className="flex justify-between mt-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                <span>{fmtLock(circuit.lower)}</span>
                                <span className="text-zinc-500 dark:text-zinc-300">Now {fmtLock(stock.currentPrice)}</span>
                                <span>{fmtLock(circuit.upper)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Support / Resistance */}
                {srLevels && (
                    <div className="card p-4 sm:p-8">
                        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                            <div>
                                <h2 className="text-base sm:text-xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter">Support &amp; Resistance</h2>
                                <p className="text-zinc-500 text-[10px] sm:text-[11px] font-black uppercase tracking-widest mt-0.5">Pivot Levels · Session High / Low</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
                                    <span className="text-[10px] font-black text-green-600/80 dark:text-green-400/80 uppercase tracking-widest">Next Support</span>
                                    <span className="text-xs sm:text-sm font-black font-mono text-green-600 dark:text-green-400 tabular-nums">{fmtSR(srNext.nextSupport)}</span>
                                </div>
                                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                                    <span className="text-[10px] font-black text-red-600/80 dark:text-red-400/80 uppercase tracking-widest">Next Resistance</span>
                                    <span className="text-xs sm:text-sm font-black font-mono text-red-600 dark:text-red-400 tabular-nums">{fmtSR(srNext.nextResistance)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-3">
                            {[
                                { label: 'S3', val: srLevels.s3, tone: 'text-green-600 dark:text-green-400' },
                                { label: 'S2', val: srLevels.s2, tone: 'text-green-600 dark:text-green-400' },
                                { label: 'S1', val: srLevels.s1, tone: 'text-green-600 dark:text-green-400' },
                                { label: 'PIVOT', val: srLevels.pivot, tone: 'text-zinc-900 dark:text-white' },
                                { label: 'R1', val: srLevels.r1, tone: 'text-red-600 dark:text-red-400' },
                                { label: 'R2', val: srLevels.r2, tone: 'text-red-600 dark:text-red-400' },
                                { label: 'R3', val: srLevels.r3, tone: 'text-red-600 dark:text-red-400' },
                            ].map((lvl) => (
                                <div key={lvl.label} className="card-inset px-2 py-2.5 text-center">
                                    <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-0.5">{lvl.label}</p>
                                    <p className={`text-[11px] sm:text-xs font-black font-mono tabular-nums truncate ${lvl.tone}`}>{fmtSR(lvl.val)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Main Technical Terminal */}
                <div className="card p-4 sm:p-10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity hidden sm:block">
                        <span className="text-[12rem] font-black italic text-blue-500 uppercase select-none">{stock.symbol}</span>
                    </div>

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 sm:gap-8 mb-6 sm:mb-12 relative z-10">
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter">Performance Terminal</h2>
                            <p className="text-zinc-500 text-[10px] sm:text-[11px] font-black uppercase tracking-widest mt-1">High-Precision Candlestick Feed / SMA (20)</p>
                        </div>
                    </div>

                    <div className="h-[400px] sm:h-[600px] w-full relative z-10">
                        {chartLoading && (
                            <div className="absolute inset-0 z-20 bg-white/50 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center rounded-[3.5rem]">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-[11px] font-black uppercase text-blue-600 tracking-[0.3em]">Querying Global History...</p>
                                </div>
                            </div>
                        )}
                        <TradingChart
                            title={`${stock.symbol} Technical Roadmap`}
                            data={candles}
                            currentTimeframe={timeframe}
                            onTimeframeChange={setTimeframe}
                            currencySymbol="Rs."
                            seamless={true}
                            priceLines={srPriceLines}
                        />
                    </div>
                </div>

                {/* Deep Analytics & Fundamentals */}
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <BarChart3 className="w-6 h-6 text-blue-500" strokeWidth={2} />
                            <h3 className="text-xl font-black uppercase italic tracking-tighter dark:text-white">Market Depth & Fundamentals</h3>
                        </div>
                        {(detailLoading || deepDetails) && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-blue-600/10 border border-blue-600/20 rounded-full">
                                <div className={`w-1.5 h-1.5 bg-blue-600 rounded-full ${detailLoading ? 'animate-bounce' : 'animate-pulse'}`}></div>
                                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{detailLoading ? 'Querying DPS...' : 'Live Terminal Feed'}</span>
                            </div>
                        )}
                    </div>

                    {!deepDetails && detailLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 animate-pulse">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="h-48 bg-zinc-100 dark:bg-white/5 rounded-[2rem] border border-zinc-200 dark:border-white/5"></div>
                            ))}
                        </div>
                    ) : deepDetails ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                                {/* Trading Limits */}
                                <div className="card p-6 space-y-6">
                                    <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-white/5 pb-3">Execution Bounds</p>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-zinc-500 uppercase">Circuit Breaker</span>
                                            <span className="text-xs font-black text-zinc-900 dark:text-white font-mono">{deepDetails.limits.circuitBreaker}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-zinc-500 uppercase">Day Range</span>
                                            <span className="text-xs font-black text-zinc-900 dark:text-white font-mono">{deepDetails.performance.dayRange}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-zinc-500 uppercase">52-Week Range</span>
                                            <span className="text-xs font-black text-zinc-900 dark:text-white font-mono">{deepDetails.performance.yearRange}</span>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-zinc-50 dark:border-white/5 pt-4">
                                            <span className="text-[11px] font-bold text-zinc-500 uppercase font-black">LDCP (Ref)</span>
                                            <span className="text-xs font-black text-zinc-900 dark:text-white font-mono">Rs.{deepDetails.limits.ldcp}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Order Book */}
                                <div className="card p-6 space-y-6">
                                    <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-white/5 pb-3">Order Imbalance</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-green-500/5 p-4 rounded-2xl border border-green-500/10">
                                            <p className="text-[10px] font-black text-green-600 uppercase mb-1">Bid Price</p>
                                            <p className="text-lg font-black text-green-600 font-mono italic">{deepDetails.orderBook.bid}</p>
                                            <p className="text-[10px] font-bold text-zinc-500 uppercase mt-1 flex items-center gap-1.5 truncate">
                                                <span className="w-1 h-1 bg-green-500 rounded-full"></span>
                                                Vol: {deepDetails.orderBook.bidVol}
                                            </p>
                                        </div>
                                        <div className="bg-red-500/5 p-4 rounded-2xl border border-red-500/10">
                                            <p className="text-[10px] font-black text-red-600 uppercase mb-1">Ask Price</p>
                                            <p className="text-lg font-black text-red-600 font-mono italic">{deepDetails.orderBook.ask}</p>
                                            <p className="text-[10px] font-bold text-zinc-500 uppercase mt-1 flex items-center gap-1.5 truncate">
                                                <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                                                Vol: {deepDetails.orderBook.askVol}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center px-1">
                                        <span className="text-[11px] font-bold text-zinc-500 uppercase">Haircut / VAR</span>
                                        <span className="text-[11px] font-black text-zinc-900 dark:text-white font-mono">{deepDetails.limits.haircut}% / {deepDetails.limits.var}%</span>
                                    </div>
                                </div>

                                {/* Valuation Matrix */}
                                <div className="card p-6 space-y-6">
                                    <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-white/5 pb-3">Valuation Matrix</p>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-zinc-500 uppercase">P/E Ratio (TTM)</span>
                                            <span className="text-xs font-black text-blue-600 font-mono">{deepDetails.ratios.pe}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-zinc-500 uppercase">EPS (TTM)</span>
                                            <span className="text-xs font-black text-zinc-900 dark:text-white font-mono">{deepDetails.ratios.eps}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-zinc-500 uppercase">Dividend Yield</span>
                                            <span className="text-xs font-black text-green-500 font-mono">{deepDetails.ratios.divYield}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-zinc-500 uppercase">Beta 1Y</span>
                                            <span className="text-xs font-black text-zinc-900 dark:text-white font-mono">{deepDetails.ratios.beta}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Performance & Profile */}
                                <div className="card p-6 space-y-6">
                                    <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-white/5 pb-3">Market Performance</p>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center p-3 bg-zinc-50 dark:bg-white/[0.03] rounded-xl">
                                            <span className="text-[11px] font-bold text-zinc-500 uppercase">YTD Change</span>
                                            <span className={`text-xs font-black font-mono ${deepDetails.performance.ytd.includes('-') ? 'text-red-500' : 'text-green-500'}`}>{deepDetails.performance.ytd}</span>
                                        </div>
                                        <div className="flex justify-between items-center p-3 bg-zinc-50 dark:bg-white/[0.03] rounded-xl">
                                            <span className="text-[11px] font-bold text-zinc-500 uppercase">1-Year Return</span>
                                            <span className={`text-xs font-black font-mono ${deepDetails.performance.oneYear.includes('-') ? 'text-red-500' : 'text-green-500'}`}>{deepDetails.performance.oneYear}</span>
                                        </div>
                                        <div className="pt-2">
                                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Market Cap</p>
                                            <p className="text-sm font-black text-zinc-900 dark:text-white italic tracking-tighter truncate">{deepDetails.ratios.marketCap}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Financial Performance Matrix */}
                            {deepDetails.financialHistory && deepDetails.financialHistory.years.length > 0 && (
                                <div className="card p-6 sm:p-10 space-y-8">
                                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-white/5 pb-6">
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-black text-blue-500 uppercase tracking-widest">Performance Matrix</p>
                                            <h4 className="text-xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter">Financial History</h4>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Currency: PKR (Millions)</p>
                                            <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">Reporting: Annualized</p>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr>
                                                    <th className="text-left py-4 pr-4 text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em] sticky left-0 z-10 bg-white dark:bg-zinc-900">Key Metric</th>
                                                    {deepDetails.financialHistory.years.map((year: string) => (
                                                        <th key={year} className="text-right py-4 px-6 text-[11px] font-black text-zinc-900 dark:text-white uppercase tracking-[0.2em] bg-zinc-50 dark:bg-white/[0.02] first:rounded-l-xl last:rounded-r-xl">
                                                            FY {year}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-50 dark:divide-white/5">
                                                {deepDetails.financialHistory.data.map((row: any, i: number) => (
                                                    <tr key={i} className="group hover:bg-zinc-50 dark:hover:bg-white/[0.01] transition-colors">
                                                        <td className="py-5 text-xs font-black text-zinc-500 uppercase group-hover:text-blue-500 transition-colors italic pr-4 sticky left-0 z-10 bg-white dark:bg-zinc-900">
                                                            {row.metric}
                                                        </td>
                                                        {row.values.map((val: string, j: number) => (
                                                            <td key={j} className={`text-right py-5 px-6 font-mono text-xs font-bold ${val.includes('(') || val.includes('-') ? 'text-red-500' : 'text-zinc-900 dark:text-white'}`}>
                                                                {val}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Company Profile (Full-Width Detail) */}
                            <div className="bg-blue-600/[0.02] dark:bg-blue-600/[0.02] p-6 sm:p-10 rounded-[2.5rem] border border-blue-600/10 flex flex-col xl:flex-row gap-8 items-start xl:items-center justify-between relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-8 opacity-[0.03] grayscale pointer-events-none group-hover:opacity-10 transition-opacity">
                                    <span className="text-7xl sm:text-9xl font-black italic uppercase leading-none">{stock.symbol}</span>
                                </div>
                                <div className="space-y-2 relative z-10">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] bg-blue-600/10 px-2 py-1 rounded-md">Equity Profile</span>
                                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em]">{deepDetails.profile.registration}</span>
                                    </div>
                                    <h4 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter">{stock.name}</h4>
                                    <p className="text-xs font-black text-zinc-500 uppercase tracking-widest">{stock.sector} Segment / Specialized Board</p>
                                    <div className="flex flex-wrap gap-x-6 sm:gap-x-12 gap-y-6 relative z-10 mt-6">
                                        <div>
                                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1 shadow-sm">Shares Outstanding</p>
                                            <p className="text-sm font-black text-zinc-900 dark:text-white font-mono">{deepDetails.profile.shares}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1 shadow-sm">Free Float</p>
                                            <p className="text-sm font-black text-zinc-900 dark:text-white font-mono">{deepDetails.profile.freeFloat}</p>
                                            <p className="text-[10px] font-bold text-blue-500 uppercase mt-1">{deepDetails.profile.freeFloatPercentage} Liquidity</p>
                                        </div>
                                        <div className="hidden sm:block">
                                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Mkt Cap (000's)</p>
                                            <p className="text-sm font-black text-zinc-900 dark:text-white font-mono">Rs.{deepDetails.profile.marketCapDetailed}</p>
                                        </div>
                                        <div className="hidden md:block">
                                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Incorporation</p>
                                            <p className="text-sm font-black text-zinc-900 dark:text-white font-mono">{deepDetails.profile.incorporation}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="card-empty p-6 sm:p-12 text-center">
                            <p className="text-zinc-500 text-[11px] font-black uppercase tracking-[0.2em]">Detailed Analytics for {symbol} currently offline</p>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12">
                    {/* Intelligence Section */}
                    <div className="space-y-4 sm:space-y-8">
                        <div className="flex items-center gap-3">
                            <Newspaper className="w-6 h-6 sm:w-7 sm:h-7 text-blue-500" strokeWidth={2} />
                            <h3 className="text-lg sm:text-xl font-black uppercase italic tracking-tighter dark:text-white">Equity Intelligence</h3>
                        </div>
                        <div className="card p-6 sm:p-8 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-6 opacity-10 font-black text-3xl sm:text-5xl italic uppercase select-none">BULL</div>
                            <div className="relative z-10">
                                <p className="text-[10px] sm:text-[10px] font-black text-blue-500 mb-2 uppercase tracking-widest">LATEST UPDATE</p>
                                <h4 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tight mb-3 sm:mb-4">{stock.symbol} Liquidity Profile</h4>
                                <p className="text-xs sm:text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 font-medium line-clamp-3">Automated sentiment analysis suggest that {stock.name} is showing high relative strength compared to the KSE100 index. Volume profile indicates institutional accumulation at current execution levels.</p>
                            </div>
                        </div>
                    </div>

                    {/* Stock Card Quick Actions */}
                    <div className="space-y-4 sm:space-y-8">
                        <div className="flex items-center gap-3">
                            <Star className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400" strokeWidth={2} />
                            <h3 className="text-lg sm:text-xl font-black uppercase italic tracking-tighter dark:text-white">Quick Actions</h3>
                        </div>
                        <div className="w-full">
                            <StockCard
                                {...stock}
                                exchange="PSX"
                                watchlists={watchlists}
                            />
                        </div>
                    </div>
                </div>

                {/* Related Stocks Section */}
                {relatedStocks.length > 0 && (
                    <section className="space-y-6 pt-6 sm:pt-12 border-t border-zinc-200 dark:border-white/5">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                            <h2 className="text-lg sm:text-2xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter">Sector Corollaries: {stock.sector}</h2>
                            <p className="text-zinc-500 text-[11px] font-black uppercase tracking-widest">Comparison Analytics</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                            {relatedStocks.map(s => (
                                <button
                                    key={s.symbol}
                                    onClick={() => router.push(`/stocks/${s.symbol.toLowerCase()}`)}
                                    className="card text-left p-6 hover:border-blue-500/50 transition-all group"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <h3 className="font-black text-zinc-900 dark:text-white group-hover:text-blue-500 transition-colors">{s.symbol}</h3>
                                        <span className={`text-[11px] font-black ${s.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(1)}%
                                        </span>
                                    </div>
                                    <p className="text-[11px] font-bold text-zinc-500 uppercase truncate mb-4">{s.name}</p>
                                    <p className="text-lg font-black font-mono text-zinc-900 dark:text-white">Rs.{s.currentPrice?.toLocaleString()}</p>
                                </button>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
