"use client";

import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import StockCard from "../../components/StockCard";
import { useSettings } from "../../context/SettingsContext";
import dynamic from 'next/dynamic';
const TradingChart = dynamic(() => import('../../components/TradingChart'), { ssr: false });
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
    history?: { time: string | number; open: number; high: number; low: number; close: number; volume?: number }[];
}

export default function NasdaqSymbolPage() {
    const params = useParams();
    const symbol = (params.symbol as string)?.toUpperCase();
    const router = useRouter();
    const [stock, setStock] = useState<Stock | null>(null);
    const [loading, setLoading] = useState(true);
    const [chartTF, setChartTF] = useState("1D");
    const { settings } = useSettings();
    // NASDAQ is a USD market — never converted to the display currency.
    const displayCurrency = 'USD';

    const [loadError, setLoadError] = useState(false);
    const [history, setHistory] = useState<NonNullable<Stock["history"]>>([]);
    const [historyState, setHistoryState] = useState<"loading" | "ok" | "unavailable">("loading");

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const res = await fetch('/api/nasdaq-stocks');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const data: Stock[] = json?.data || [];
            setStock(data.find(s => s.symbol?.toUpperCase() === symbol) ?? null);
        } catch (err) {
            console.error('Failed to load NASDAQ stock detail', err);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [symbol]);

    useEffect(() => { if (symbol) load(); }, [symbol, load]);

    // Real Yahoo candles (USD) instead of generated ones.
    useEffect(() => {
        if (!symbol) return;
        let cancelled = false;
        setHistoryState("loading");
        fetch(`/api/market-history?symbol=${encodeURIComponent(symbol)}&timeframe=${chartTF}`)
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                if (json?.success && Array.isArray(json.data) && json.data.length) {
                    setHistory(json.data);
                    setHistoryState("ok");
                } else {
                    setHistory([]);
                    setHistoryState("unavailable");
                }
            })
            .catch(() => {
                if (cancelled) return;
                setHistory([]);
                setHistoryState("unavailable");
            });
        return () => { cancelled = true; };
    }, [symbol, chartTF]);

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-app-dark flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-zinc-500 font-black uppercase text-[11px] tracking-widest">{LOADING_CAPTION}</p>
                </div>
            </div>
        );
    }
    if (!stock) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-app-dark flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl sm:text-4xl font-black text-zinc-900 dark:text-white italic uppercase mb-4">{loadError ? "Couldn't load market data" : "Symbol not found"}</h1>
                    <p className="text-zinc-500 mb-8 uppercase text-xs tracking-widest font-black">
                        {loadError ? "Check your connection and try again" : `No market data available for ${symbol}`}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        {loadError && (
                            <button onClick={load} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-500 transition-all">Retry</button>
                        )}
                        <button onClick={() => router.push('/nasdaq')} className={`px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all ${loadError ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white" : "bg-blue-600 text-white hover:bg-blue-500"}`}>Back to NASDAQ Console</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white p-6 pt-[calc(1.5rem_+_var(--sa-top))]">
            <button onClick={() => router.back()} aria-label="Back to console" className="text-blue-600 font-black tracking-widest text-[11px] uppercase hover:underline mb-8 pl-10 lg:pl-0 flex items-center gap-2"><ArrowLeft className="w-5 h-5" strokeWidth={2} /> Back to Console</button>
            <div className="max-w-4xl mx-auto space-y-6 sm:space-y-12">
                <div className="max-w-md">
                    <StockCard {...stock} exchange="NASDAQ" />
                </div>

                {(
                    <div className="card p-5 sm:p-10 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                            <span className="text-[12rem] font-black italic text-blue-500 uppercase select-none">{stock.symbol}</span>
                        </div>
                        <div className="flex justify-between items-center mb-6 sm:mb-12 relative z-10">
                            <div>
                                <h2 className="text-xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-50 uppercase italic tracking-tighter">Satellite Velocity Terminal</h2>
                                <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mt-1">Institutional Technical Feed: {stock.symbol} / {displayCurrency}</p>
                            </div>
                        </div>
                        <div className="h-[350px] sm:h-[550px] relative z-10">
                            {historyState === "unavailable" ? (
                                <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                                    <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Price history unavailable for {stock.symbol}</p>
                                    <div className="flex gap-2">
                                        {["1H", "1D", "1W"].map(tf => (
                                            <button key={tf} onClick={() => setChartTF(tf)} className={`min-h-10 px-4 rounded-xl text-xs font-black ${chartTF === tf ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-white/5 text-zinc-500"}`}>{tf}</button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <TradingChart
                                    title={`${stock.symbol} / ${displayCurrency}`}
                                    data={history}
                                    currentTimeframe={chartTF}
                                    onTimeframeChange={setChartTF}
                                    currencySymbol="$"
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
