"use client";

import { dayRangePosition, circuitStatus } from "../lib/stockSignals";
import { useSidebar } from "../context/SidebarContext";
import { Scale, Award, Lock, X } from "lucide-react";

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
}

interface CompareTrayProps {
    stocks: Stock[];       // currently selected (max ~4)
    onRemove: (symbol: string) => void;
    onClear: () => void;
    onOpen: (symbol: string) => void;
}

const MAX = 4;

// Column count matches the number of selected stocks so cards always fill the
// row evenly instead of leaving empty grid tracks.
const COLS: Record<number, string> = {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-4",
};

const Metric = ({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "up" | "down" }) => (
    <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold text-zinc-400 uppercase tracking-widest">{label}</span>
        <span
            className={`font-mono font-black tabular-nums ${
                tone === "up" ? "text-green-600 dark:text-green-400" : tone === "down" ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-white"
            }`}
        >
            {children}
        </span>
    </div>
);

export default function CompareTray({ stocks, onRemove, onClear, onOpen }: CompareTrayProps) {
    const { collapsed } = useSidebar();
    if (stocks.length === 0) return null;

    const multi = stocks.length > 1;
    // Best / worst performer of the selection for winner / laggard accents.
    const best = stocks.reduce((a, b) => ((b.changePercent || 0) > (a.changePercent || 0) ? b : a), stocks[0]);
    const worst = stocks.reduce((a, b) => ((b.changePercent || 0) < (a.changePercent || 0) ? b : a), stocks[0]);
    const gridCols = COLS[Math.min(stocks.length, MAX)] || "sm:grid-cols-4";

    return (
        <div
            className={`fixed bottom-[var(--tabbar-h)] left-0 right-0 ${collapsed ? "lg:left-20" : "lg:left-64"} z-[80] px-3 sm:px-6 pb-3 sm:pb-6 pb-safe pointer-events-none transition-[left] duration-300 ease-in-out`}
        >
            <div className="card-float page-shell mx-auto pointer-events-auto backdrop-blur-xl shadow-black/10 dark:shadow-black/40 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 sm:py-3 border-b border-zinc-100 dark:border-white/5 bg-gradient-to-r from-blue-500/[0.04] to-transparent">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="shrink-0 w-7 h-7 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center"><Scale className="w-4 h-4" strokeWidth={2} /></span>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white leading-none">Compare</span>
                                <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-600/10 px-1.5 py-0.5 rounded-md tabular-nums">{stocks.length}/{MAX}</span>
                            </div>
                            <p className="hidden sm:block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1 truncate">
                                {multi ? "Side-by-side snapshot" : "Select more stocks to compare"}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClear}
                        className="shrink-0 flex items-center gap-1.5 min-h-10 text-[10px] font-black text-zinc-400 hover:text-red-500 bg-zinc-100 dark:bg-white/5 hover:bg-red-500/10 uppercase tracking-widest transition-colors px-2.5 py-1.5 rounded-lg"
                    >
                        Clear all <X className="w-3 h-3" strokeWidth={2.5} />
                    </button>
                </div>

                {/* Cards */}
                <div className={`grid grid-cols-2 ${gridCols} divide-x divide-y sm:divide-y-0 divide-zinc-100 dark:divide-white/5`}>
                    {stocks.map((s) => {
                        const isPos = (s.changePercent || 0) >= 0;
                        const pos = dayRangePosition(s.low, s.high, s.currentPrice);
                        const cs = circuitStatus(s.changePercent);
                        const isBest = multi && s.symbol === best.symbol;
                        const isWorst = multi && !isBest && s.symbol === worst.symbol;

                        return (
                            <div
                                key={s.symbol}
                                className={`relative p-3 sm:p-4 space-y-2.5 transition-colors ${
                                    isBest ? "bg-green-500/[0.06]" : isWorst ? "bg-red-500/[0.04]" : ""
                                }`}
                            >
                                {/* Winner / laggard accent strip */}
                                {(isBest || isWorst) && (
                                    <span className={`absolute top-0 left-0 right-0 h-0.5 ${isBest ? "bg-green-500" : "bg-red-500/60"}`} />
                                )}

                                <div className="flex items-start justify-between gap-1">
                                    <button onClick={() => onOpen(s.symbol)} className="min-w-0 text-left group">
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{s.symbol}</span>
                                            {isBest && <span title="Top performer" className="text-amber-500"><Award className="w-3 h-3" strokeWidth={2.5} /></span>}
                                        </div>
                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest truncate">{s.sector || "—"}</p>
                                    </button>
                                    <button
                                        onClick={() => onRemove(s.symbol)}
                                        className="shrink-0 w-5 h-5 -mt-0.5 -mr-0.5 rounded-md flex items-center justify-center text-zinc-300 dark:text-zinc-600 hover:text-red-500 hover:bg-red-500/10 text-[11px] transition-colors"
                                        title="Remove"
                                    >
                                        <X className="w-3 h-3" strokeWidth={2.5} />
                                    </button>
                                </div>

                                <div>
                                    <p className="text-base sm:text-lg font-black font-mono tabular-nums text-zinc-900 dark:text-white leading-none">
                                        {s.currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </p>
                                    <p className={`text-[11px] font-black mt-0.5 flex items-center gap-1 ${isPos ? "text-green-500" : "text-red-500"}`}>
                                        <span>{isPos ? "▲" : "▼"}{Math.abs(s.change || 0).toFixed(2)}</span>
                                        <span className="opacity-70">({Math.abs(s.changePercent || 0).toFixed(2)}%)</span>
                                        {cs?.includes("lock") && <span title="Circuit locked" className="inline-flex"><Lock className="w-2.5 h-2.5" strokeWidth={2.5} /></span>}
                                    </p>
                                </div>

                                <div className="space-y-1 pt-2 border-t border-zinc-100 dark:border-white/5">
                                    <Metric label="Open">{s.open?.toFixed(1)}</Metric>
                                    <Metric label="High" tone="up">{s.high?.toFixed(1)}</Metric>
                                    <Metric label="Low" tone="down">{s.low?.toFixed(1)}</Metric>
                                    <Metric label="Vol">{s.volume}</Metric>
                                </div>

                                {/* Day-range position bar */}
                                {pos != null && (
                                    <div className="pt-0.5">
                                        <div className="flex items-center justify-between text-[7px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                                            <span>Low</span>
                                            <span className="text-zinc-500 dark:text-zinc-400">{pos.toFixed(0)}% of range</span>
                                            <span>High</span>
                                        </div>
                                        <div className="relative h-1.5 rounded-full bg-gradient-to-r from-red-500/30 via-zinc-200 dark:via-zinc-700 to-green-500/30">
                                            <div
                                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-white dark:border-zinc-900 shadow"
                                                style={{ left: `${pos}%` }}
                                                title={`${pos.toFixed(0)}% of today's range`}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
