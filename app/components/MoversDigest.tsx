"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Flame, Star, X, ArrowUpRight, Activity, type LucideIcon } from "lucide-react";

interface Stock {
    symbol: string;
    name: string;
    currentPrice: number;
    change: number;
    changePercent: number;
    volume: string;
    sector?: string;
    open?: number;
    high?: number;
    low?: number;
}

interface MoversDigestProps {
    stocks: Stock[];
    watchlists?: { symbols?: string[] }[];
    loading?: boolean;
    onSelect: (symbol: string) => void;
}

const parseVol = (v: string | number | undefined): number => {
    if (typeof v === "number") return v;
    if (!v) return 0;
    const n = parseInt(v.toString().replace(/,/g, ""), 10);
    return isNaN(n) ? 0 : n;
};

const fmtVol = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
};

function MoverRow({ stock, rank, meta, onPreview }: { stock: Stock; rank: number; meta?: string; onPreview: (stock: Stock) => void }) {
    const isPos = (stock.changePercent || 0) >= 0;
    return (
        <button
            onClick={() => onPreview(stock)}
            aria-label={`Preview ${stock.symbol}`}
            className="w-full min-h-11 flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 active:scale-[0.99] transition-all group text-left"
        >
            <span className="w-5 shrink-0 text-[11px] font-black text-zinc-300 dark:text-zinc-600 tabular-nums">{rank}</span>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] sm:text-xs font-black text-zinc-900 dark:text-white tracking-tight group-hover:text-blue-600 transition-colors truncate">{stock.symbol}</p>
                <p className="text-[10px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-wide truncate">{meta || stock.name}</p>
            </div>
            <div className="text-right shrink-0">
                <p className="text-[11px] sm:text-xs font-mono font-black text-zinc-900 dark:text-zinc-100 tabular-nums leading-tight">
                    {stock.currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className={`text-[10px] sm:text-[11px] font-black tabular-nums leading-tight ${isPos ? "text-green-500" : "text-red-500"}`}>
                    {isPos ? "▲" : "▼"}{Math.abs(stock.changePercent || 0).toFixed(2)}%
                </p>
            </div>
        </button>
    );
}

function DigestColumn({ title, icon: Icon, tone, accent, children, empty, className = "" }: { title: string; icon: LucideIcon; tone: string; accent: string; children: React.ReactNode; empty?: boolean; className?: string }) {
    return (
        <div className={`card backdrop-blur-sm overflow-hidden flex flex-col ${className}`}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-white/5">
                <Icon className={`w-4 h-4 shrink-0 ${tone}`} strokeWidth={2.25} />
                <h3 className="text-[11px] sm:text-[11px] font-black uppercase tracking-widest text-zinc-900 dark:text-white">{title}</h3>
                <span className={`ml-auto w-1.5 h-1.5 rounded-full ${accent}`}></span>
            </div>
            <div className="p-1.5 flex-1">
                {empty ? (
                    <div className="py-10 text-center">
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">No data</p>
                    </div>
                ) : children}
            </div>
        </div>
    );
}

export default function MoversDigest({ stocks, watchlists = [], loading = false, onSelect }: MoversDigestProps) {
    const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

    useEffect(() => {
        if (!selectedStock) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setSelectedStock(null);
        };
        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [selectedStock]);

    const { gainers, losers, active, watchMovers } = useMemo(() => {
        const valid = (stocks || []).filter(s => s && s.symbol && typeof s.changePercent === "number");

        const gainers = [...valid].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0)).slice(0, 3);
        const losers = [...valid].sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0)).slice(0, 3);
        const active = [...valid].sort((a, b) => parseVol(b.volume) - parseVol(a.volume)).slice(0, 3);

        const watchSymbols = new Set<string>();
        (watchlists || []).forEach(wl => (wl?.symbols || []).forEach((s: string) => watchSymbols.add(s.toUpperCase())));
        const watchMovers = valid
            .filter(s => watchSymbols.has(s.symbol.toUpperCase()))
            .sort((a, b) => Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0))
            .slice(0, 3);

        return { gainers, losers, active, watchMovers };
    }, [stocks, watchlists]);

    const hasWatch = watchMovers.length > 0;

    const previewRange = selectedStock?.high && selectedStock.low && selectedStock.high > selectedStock.low
        ? Math.min(100, Math.max(0, ((selectedStock.currentPrice - selectedStock.low) / (selectedStock.high - selectedStock.low)) * 100))
        : null;

    const openDetail = () => {
        if (!selectedStock) return;
        setSelectedStock(null);
        onSelect(selectedStock.symbol);
    };

    if (loading) {
        return (
            <div className={`grid grid-cols-2 ${hasWatch ? "xl:grid-cols-4" : "xl:grid-cols-3"} gap-3 sm:gap-6`}>
                {Array.from({ length: hasWatch ? 4 : 3 }).map((_, i) => (
                    <div key={i} className="card p-4 animate-pulse">
                        <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-24 mb-4"></div>
                        {Array.from({ length: 5 }).map((_, j) => (
                            <div key={j} className="flex justify-between py-2.5">
                                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-16"></div>
                                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-10"></div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className={`grid grid-cols-2 ${hasWatch ? "xl:grid-cols-4" : "xl:grid-cols-3"} gap-3 sm:gap-6`}>
            <DigestColumn title="Top Gainers" icon={TrendingUp} tone="text-green-500" accent="bg-green-500" empty={gainers.length === 0}>
                {gainers.map((s, i) => <MoverRow key={s.symbol} stock={s} rank={i + 1} onPreview={setSelectedStock} />)}
            </DigestColumn>

            <DigestColumn title="Top Losers" icon={TrendingDown} tone="text-red-500" accent="bg-red-500" empty={losers.length === 0}>
                {losers.map((s, i) => <MoverRow key={s.symbol} stock={s} rank={i + 1} onPreview={setSelectedStock} />)}
            </DigestColumn>

            <DigestColumn title="Most Active" icon={Flame} tone="text-orange-500" accent="bg-blue-500" empty={active.length === 0} className={hasWatch ? "" : "col-span-2 xl:col-span-1"}>
                {active.map((s, i) => <MoverRow key={s.symbol} stock={s} rank={i + 1} meta={`Vol ${fmtVol(parseVol(s.volume))}`} onPreview={setSelectedStock} />)}
            </DigestColumn>

            {hasWatch && (
                <DigestColumn title="Your Watchlist" icon={Star} tone="text-amber-500" accent="bg-amber-500">
                    {watchMovers.map((s, i) => <MoverRow key={s.symbol} stock={s} rank={i + 1} onPreview={setSelectedStock} />)}
                </DigestColumn>
            )}

            {selectedStock && (
                <div
                    className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="mover-preview-title"
                >
                    <button
                        type="button"
                        aria-label="Close stock preview"
                        onClick={() => setSelectedStock(null)}
                        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
                    />
                    <div
                        className="card relative w-full sm:max-w-md rounded-t-[1.75rem] p-5 sm:p-6 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] sm:pb-6"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-blue-500 shrink-0" strokeWidth={2.5} />
                                    <h3 id="mover-preview-title" className="text-lg font-black uppercase italic tracking-tight text-zinc-900 dark:text-white truncate">{selectedStock.symbol}</h3>
                                </div>
                                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest truncate mt-1">{selectedStock.name}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedStock(null)}
                                aria-label="Close stock preview"
                                className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5" strokeWidth={2.5} />
                            </button>
                        </div>

                        <div className="mt-6 flex items-end justify-between gap-4">
                            <div>
                                <p className="text-3xl font-black font-mono tabular-nums tracking-tighter text-zinc-900 dark:text-white">{selectedStock.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <p className={`mt-1 text-xs font-black tabular-nums ${isPositive(selectedStock.changePercent) ? "text-green-500" : "text-red-500"}`}>
                                    {isPositive(selectedStock.changePercent) ? "UP" : "DOWN"} {Math.abs(selectedStock.changePercent).toFixed(2)}% <span className="text-zinc-400 font-bold">today</span>
                                </p>
                            </div>
                            <div className="text-right text-[11px] font-black uppercase tracking-widest text-zinc-400">
                                <p>Volume</p>
                                <p className="mt-1 text-sm font-mono text-zinc-900 dark:text-white">{fmtVol(parseVol(selectedStock.volume))}</p>
                            </div>
                        </div>

                        <div className="mt-6 grid grid-cols-3 gap-2 text-[11px] font-black uppercase tracking-widest">
                            {[
                                ["Open", selectedStock.open],
                                ["Low", selectedStock.low],
                                ["High", selectedStock.high],
                            ].map(([label, value]) => (
                                <div key={label as string} className="rounded-xl bg-zinc-100 dark:bg-white/5 p-3">
                                    <p className="text-zinc-400">{label as string}</p>
                                    <p className="mt-1 font-mono text-zinc-900 dark:text-white">{typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "N/A"}</p>
                                </div>
                            ))}
                        </div>

                        {previewRange != null && (
                            <div className="mt-5">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                    <span>Day low</span><span>Day high</span>
                                </div>
                                <div className="relative mt-2 h-1.5 rounded-full bg-gradient-to-r from-red-500/50 via-zinc-300 dark:via-zinc-700 to-green-500/50">
                                    <span className="absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white dark:border-zinc-900 bg-blue-500" style={{ left: `${previewRange}%` }} />
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={openDetail}
                            className="mt-6 w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-[0.99] transition-all"
                        >
                            Open full chart <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

const isPositive = (value: number) => value >= 0;
