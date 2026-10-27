"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Star, Target } from "lucide-react";
import { computeSignals, toneClasses, type Signal } from "../lib/stockSignals";
import { getTargets } from "../lib/stockPrefs";

interface Stock {
    symbol: string;
    name: string;
    currentPrice: number;
    change?: number;
    changePercent: number;
    volume: string;
    open?: number;
    high?: number;
    low?: number;
}

interface WatchlistAlertsProps {
    stocks: Stock[];
    watchlists?: any[];
    onSelect: (symbol: string) => void;
}

interface Row {
    stock: Stock;
    signals: Signal[];
    alerting: boolean;
}

export default function WatchlistAlerts({ stocks, watchlists = [], onSelect }: WatchlistAlertsProps) {
    const [targets, setTargetsState] = useState<Record<string, number>>({});

    useEffect(() => {
        const load = () => setTargetsState(getTargets());
        load();
        window.addEventListener("stockprefs", load);
        return () => window.removeEventListener("stockprefs", load);
    }, []);

    const { rows, alertCount, total } = useMemo(() => {
        const symbols = new Set<string>();
        (watchlists || []).forEach(wl => (wl?.symbols || []).forEach((s: string) => symbols.add(s.toUpperCase())));
        // Also surface any scrip the user set a price target on, even if it isn't
        // in a watchlist — otherwise setting a target wouldn't reflect here.
        Object.keys(targets || {}).forEach(sym => symbols.add(sym.toUpperCase()));

        const bySymbol = new Map<string, Stock>();
        (stocks || []).forEach(s => { if (s?.symbol) bySymbol.set(s.symbol.toUpperCase(), s); });

        const rows: Row[] = [];
        symbols.forEach(sym => {
            const stock = bySymbol.get(sym);
            if (!stock) return;
            const signals = computeSignals(
                { changePercent: stock.changePercent, currentPrice: stock.currentPrice, open: stock.open, high: stock.high, low: stock.low },
                targets[sym] ?? null,
            );
            const alerting = signals.some(s => ["upper-lock", "lower-lock", "target-hit", "target-near", "near-upper", "near-lower"].includes(s.key));
            rows.push({ stock, signals, alerting });
        });

        rows.sort((a, b) => {
            if (a.alerting !== b.alerting) return a.alerting ? -1 : 1;
            return Math.abs(b.stock.changePercent || 0) - Math.abs(a.stock.changePercent || 0);
        });

        return { rows, alertCount: rows.filter(r => r.alerting).length, total: rows.length };
    }, [stocks, watchlists, targets]);

    return (
        <div className="card backdrop-blur-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-2.5 border-b border-zinc-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500 shrink-0" strokeWidth={2.25} />
                    <h3 className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white">Watchlist &amp; Alerts</h3>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                    {total > 0 && (
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${alertCount > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}>
                            {alertCount > 0 ? `${alertCount} alert${alertCount > 1 ? 's' : ''}` : `${total} tracked`}
                        </span>
                    )}
                    <Link href="/watchlist" className="min-h-10 inline-flex items-center text-[11px] font-black text-blue-500 hover:text-blue-400 uppercase tracking-widest transition-colors">Manage →</Link>
                </div>
            </div>

            <div className="p-1.5">
                {total === 0 ? (
                    <div className="py-16 px-4 text-center">
                        <Target className="w-8 h-8 mx-auto mb-3 text-zinc-300 dark:text-zinc-600" strokeWidth={2} />
                        <p className="text-zinc-500 font-black uppercase tracking-widest text-[11px] mb-1">No watchlist symbols</p>
                        <p className="text-zinc-400 text-[11px] leading-relaxed mb-4">Add scrips to a watchlist and set price targets to get circuit &amp; target alerts here.</p>
                        <a href="/stocks" className="inline-block text-[10px] font-black text-blue-500 hover:text-blue-400 uppercase tracking-widest border-b border-blue-500/40">Build a watchlist →</a>
                    </div>
                ) : (
                    rows.slice(0, 4).map(({ stock, signals, alerting }) => {
                        const isPos = (stock.changePercent || 0) >= 0;
                        const target = targets[stock.symbol.toUpperCase()];
                        const hasTarget = typeof target === "number" && target > 0;
                        const awayPct = hasTarget && stock.currentPrice
                            ? ((target - stock.currentPrice) / stock.currentPrice) * 100
                            : null;
                        return (
                            <button
                                key={stock.symbol}
                                onClick={() => onSelect(stock.symbol)}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left ${alerting ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-zinc-100 dark:hover:bg-white/5'}`}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-[11px] sm:text-xs font-black text-zinc-900 dark:text-white tracking-tight truncate">{stock.symbol}</p>
                                        {hasTarget && (
                                            <span
                                                title={awayPct != null ? `Your target: ${target.toLocaleString()} (${awayPct >= 0 ? awayPct.toFixed(1) + '% to go' : Math.abs(awayPct).toFixed(1) + '% above target'})` : `Your target: ${target.toLocaleString()}`}
                                                className="inline-flex items-center gap-0.5 text-[7px] font-black uppercase tracking-wide px-1 py-0.5 rounded border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 shrink-0"
                                            >
                                                <Target className="w-2 h-2 shrink-0" strokeWidth={2} /> {target.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                            </span>
                                        )}
                                        {signals.filter(s => s.key !== 'target-hit' && s.key !== 'target-near').slice(0, 2).map(sig => (
                                            <span key={sig.key} title={sig.title} className={`hidden sm:inline-flex items-center gap-0.5 text-[7px] font-black uppercase tracking-wide px-1 py-0.5 rounded border ${toneClasses(sig.tone)}`}>
                                                <sig.icon className="w-2 h-2" strokeWidth={2.5} /> {sig.label}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide truncate">{stock.name}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[11px] sm:text-xs font-mono font-black text-zinc-900 dark:text-zinc-100 tabular-nums leading-tight">
                                        {stock.currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                    <p className={`text-[10px] sm:text-[11px] font-black tabular-nums leading-tight ${isPos ? 'text-green-500' : 'text-red-500'}`}>
                                        {isPos ? '▲' : '▼'}{Math.abs(stock.changePercent || 0).toFixed(2)}%
                                    </p>
                                    {hasTarget && awayPct != null && (
                                        <p className="inline-flex items-center gap-0.5 text-[10px] font-black text-blue-600 dark:text-blue-400 tabular-nums leading-tight mt-0.5">
                                            <Target className="w-2 h-2 shrink-0" strokeWidth={2} /> {awayPct >= 0 ? `${awayPct.toFixed(1)}% to go` : 'hit'}
                                        </p>
                                    )}
                                </div>
                            </button>
                        );
                    })
                )}
                {total > 4 && (
                    <a href="/watchlist" className="block text-center py-1.5 text-[10px] font-black text-blue-500 hover:text-blue-400 uppercase tracking-widest">
                        + {total - 4} more · View all →
                    </a>
                )}
            </div>
        </div>
    );
}
