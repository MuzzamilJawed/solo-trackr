"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, AlertTriangle, Minus, Search, TrendingDown, TrendingUp } from "lucide-react";
import {
    Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import LoadErrorBanner from "../../components/LoadErrorBanner";
import { analyze, type Analysis, type Lean, type Signal, type VerdictLabel } from "../../lib/analysis";
import type { Candle } from "../../lib/indicators";

const TradingChart = dynamic(() => import("../../components/TradingChart"), { ssr: false });

interface StockRef { symbol: string; name: string }

const TIMEFRAMES = [
    { id: "1D", label: "Daily · 1 year" },
    { id: "1W", label: "Weekly · 5 years" },
] as const;

const VERDICT_STYLE: Record<VerdictLabel, { text: string; bg: string; ring: string }> = {
    "Strong Buy": { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", ring: "border-emerald-500/30" },
    "Buy": { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", ring: "border-emerald-500/30" },
    "Hold": { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", ring: "border-amber-500/30" },
    "Sell": { text: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", ring: "border-red-500/30" },
    "Strong Sell": { text: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", ring: "border-red-500/30" },
};

const num = (n: number | null | undefined, d = 2) => (n == null ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const sgn = (n: number, d = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;

function LeanChip({ lean }: { lean: Lean }) {
    const map = {
        bullish: { cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", icon: <TrendingUp className="w-3.5 h-3.5" aria-hidden />, label: "Bullish" },
        bearish: { cls: "bg-red-500/10 text-red-700 dark:text-red-400", icon: <TrendingDown className="w-3.5 h-3.5" aria-hidden />, label: "Bearish" },
        neutral: { cls: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300", icon: <Minus className="w-3.5 h-3.5" aria-hidden />, label: "Neutral" },
    }[lean];
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${map.cls}`}>{map.icon}{map.label}</span>;
}

function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
    return (
        <section className="card p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-black text-zinc-900 dark:text-white">{title}</h2>
                {aside}
            </div>
            {children}
        </section>
    );
}

function AnalysisInner() {
    const router = useRouter();
    const params = useSearchParams();
    const symbol = (params.get("symbol") || "").toUpperCase();
    const [tf, setTf] = useState<"1D" | "1W">("1D");

    const [stocks, setStocks] = useState<StockRef[]>([]);
    const [query, setQuery] = useState(symbol);
    const [open, setOpen] = useState(false);

    const [candles, setCandles] = useState<Candle[] | null>(null);
    const [state, setState] = useState<"idle" | "loading" | "ok" | "no-data" | "error">("idle");

    // Stock list for name/symbol search.
    useEffect(() => {
        let cancelled = false;
        fetch("/api/psx-stocks")
            .then(r => r.json())
            .then(j => { if (!cancelled && Array.isArray(j?.data)) setStocks(j.data.map((s: StockRef) => ({ symbol: s.symbol, name: s.name || "" }))); })
            .catch(() => { /* typing a symbol directly still works */ });
        return () => { cancelled = true; };
    }, []);

    const load = useCallback(async () => {
        if (!symbol) { setState("idle"); setCandles(null); return; }
        setState("loading");
        try {
            const res = await fetch(`/api/psx-history?symbol=${encodeURIComponent(symbol)}&timeframe=${tf}`);
            const json = await res.json();
            if (json?.success && Array.isArray(json.data) && json.data.length >= 30) {
                setCandles(json.data.map((d: Candle) => ({ ...d, volume: Number(d.volume) || 0 })));
                setState("ok");
            } else {
                setCandles(null);
                setState(json?.success === false && json?.error && !/not found|no data|history/i.test(String(json.error)) ? "error" : "no-data");
            }
        } catch {
            setCandles(null);
            setState("error");
        }
    }, [symbol, tf]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);
    useEffect(() => { setQuery(symbol); }, [symbol]);

    const analysis: Analysis | null = useMemo(() => (candles ? analyze(candles) : null), [candles]);

    const suggestions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return stocks
            .filter(s => s.symbol.toLowerCase().startsWith(q) || s.name.toLowerCase().includes(q))
            .sort((a, b) => Number(b.symbol.toLowerCase() === q) - Number(a.symbol.toLowerCase() === q) || a.symbol.localeCompare(b.symbol))
            .slice(0, 8);
    }, [query, stocks]);

    const go = (sym: string) => {
        const s = sym.trim().toUpperCase();
        if (!s) return;
        setOpen(false);
        router.push(`/stocks/analysis?symbol=${encodeURIComponent(s)}`);
    };
    const submit = () => go(suggestions[0]?.symbol ?? query);

    const name = stocks.find(s => s.symbol === symbol)?.name;
    const wrapRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    // Chart overlays: Fibonacci retracements + nearest support/resistance.
    const priceLines = useMemo(() => {
        if (!analysis) return [];
        const lines: { price: number; color: string; title: string }[] = [];
        analysis.fib?.retracements.filter(l => l.ratio > 0 && l.ratio < 1).forEach(l => lines.push({ price: l.price, color: "#a855f7", title: `Fib ${l.label}` }));
        analysis.support.slice(0, 2).forEach(l => lines.push({ price: l.price, color: "#22c55e", title: "Support" }));
        analysis.resistance.slice(0, 2).forEach(l => lines.push({ price: l.price, color: "#ef4444", title: "Resistance" }));
        return lines;
    }, [analysis]);

    const sub = useMemo(() => {
        if (!analysis) return { rsi: [], macd: [] };
        const start = Math.max(0, analysis.bars - 90);
        const t = (candles ?? []).slice(start).map(c => String(c.time));
        return {
            rsi: t.map((time, i) => ({ time, rsi: analysis.series.rsi[start + i] })),
            macd: t.map((time, i) => ({ time, hist: analysis.series.macdHist[start + i], macd: analysis.series.macd[start + i], signal: analysis.series.macdSignal[start + i] })),
        };
    }, [analysis, candles]);

    const grouped = useMemo(() => {
        const g = new Map<string, Signal[]>();
        analysis?.signals.forEach(s => { if (!g.has(s.group)) g.set(s.group, []); g.get(s.group)!.push(s); });
        return [...g.entries()];
    }, [analysis]);

    const reasons = useMemo(() => {
        const s = analysis?.signals ?? [];
        const by = (sign: number) => [...s].filter(x => Math.sign(x.score) === sign).sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight)).slice(0, 3);
        return { bull: by(1), bear: by(-1) };
    }, [analysis]);

    const tick = { fontSize: 11, fill: "#71717a" };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white">
            <header className="safe-top sticky top-0 z-40 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
                <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-5">
                    <h1 className="text-xl sm:text-3xl font-black tracking-tighter italic uppercase leading-none flex items-center gap-2.5">
                        <Activity className="w-6 h-6 sm:w-7 sm:h-7 text-blue-500 shrink-0" strokeWidth={2} aria-hidden /> Technical <span className="text-blue-500">Analysis</span>
                    </h1>
                    <p className="text-zinc-500 text-xs mt-1.5">RSI, MACD, Fibonacci, moving averages and more — with a buy / hold / sell lean</p>
                </div>
            </header>

            <main className="page-shell mx-auto p-4 sm:p-8 space-y-5">
                {/* Search */}
                <div ref={wrapRef} className="relative max-w-xl">
                    <form onSubmit={e => { e.preventDefault(); submit(); }} role="search" className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden />
                            <input
                                value={query}
                                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                                onFocus={() => setOpen(true)}
                                role="combobox"
                                aria-expanded={open && suggestions.length > 0}
                                aria-controls="an-list"
                                aria-label="PSX stock name or symbol"
                                autoCapitalize="characters"
                                autoComplete="off"
                                enterKeyHint="search"
                                placeholder="Stock name or symbol, e.g. OGDC or Lucky"
                                className="w-full min-h-12 rounded-xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 pl-10 pr-3 text-base outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <button type="submit" className="min-h-12 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold">Analyse</button>
                    </form>
                    {open && suggestions.length > 0 && (
                        <ul id="an-list" role="listbox" className="absolute z-30 mt-2 w-full rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-xl overflow-hidden">
                            {suggestions.map(s => (
                                <li key={s.symbol} role="option" aria-selected={false}>
                                    <button type="button" onClick={() => go(s.symbol)} className="w-full text-left min-h-12 px-4 flex items-baseline gap-3 hover:bg-zinc-100 dark:hover:bg-white/5">
                                        <span className="font-black">{s.symbol}</span>
                                        <span className="text-sm text-zinc-500 truncate">{s.name}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {state === "idle" && (
                    <div className="py-16 text-center text-sm text-zinc-500 max-w-md mx-auto">
                        Enter a PSX stock&apos;s name or symbol to see its indicators, Fibonacci levels and a buy / hold / sell lean based on the last year of daily prices.
                    </div>
                )}

                {state === "loading" && (
                    <div className="space-y-4" aria-busy="true">
                        <div className="h-48 rounded-2xl bg-zinc-200/60 dark:bg-white/5 animate-pulse" />
                        <div className="h-96 rounded-2xl bg-zinc-200/60 dark:bg-white/5 animate-pulse" />
                    </div>
                )}

                {state === "error" && <LoadErrorBanner hasData={false} what={`price history for ${symbol}`} onRetry={load} />}

                {state === "no-data" && (
                    <div role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-800 dark:text-amber-200 max-w-2xl">
                        <p className="font-bold mb-1">No price history available for {symbol}.</p>
                        <p>Check the symbol, or note the history provider doesn&apos;t cover every PSX stock (some listings simply have no data there). Try another stock — I won&apos;t guess a signal without real prices.</p>
                    </div>
                )}

                {state === "ok" && analysis && (
                    <>
                        {/* Verdict */}
                        <section className={`rounded-2xl sm:rounded-[1.75rem] border p-5 sm:p-7 ${VERDICT_STYLE[analysis.verdict.label].bg} ${VERDICT_STYLE[analysis.verdict.label].ring}`}>
                            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-zinc-500">{symbol}{name ? ` · ${name}` : ""}</p>
                                    <p className="text-2xl sm:text-3xl font-black tabular-nums mt-0.5">
                                        Rs {num(analysis.price)}
                                        {analysis.changePct != null && <span className={`ml-2 text-base font-bold ${analysis.changePct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{analysis.changePct >= 0 ? "▲" : "▼"} {sgn(analysis.changePct, 2)}</span>}
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-1">Last close {String(analysis.asOf).length > 10 ? new Date(Number(analysis.asOf) * 1000).toLocaleDateString() : String(analysis.asOf)} · {analysis.bars} {tf === "1D" ? "days" : "weeks"} of data</p>
                                </div>
                                <div className="sm:text-right">
                                    <p className="text-xs font-bold text-zinc-500">Indicator lean</p>
                                    <p className={`text-3xl sm:text-4xl font-black ${VERDICT_STYLE[analysis.verdict.label].text}`}>{analysis.verdict.label}</p>
                                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">Confidence: <span className="font-bold">{analysis.verdict.confidence}</span> · score {analysis.verdict.score > 0 ? "+" : ""}{analysis.verdict.score}</p>
                                </div>
                            </div>

                            {/* Score meter */}
                            <div className="mt-5" role="img" aria-label={`Score ${analysis.verdict.score} on a scale from -100 sell to +100 buy`}>
                                <div className="relative h-3 rounded-full" style={{ background: "linear-gradient(90deg,#ef4444,#f59e0b 50%,#22c55e)" }}>
                                    <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white dark:bg-zinc-900 border-4 border-zinc-900 dark:border-white shadow" style={{ left: `${(analysis.verdict.score + 100) / 2}%` }} />
                                </div>
                                <div className="flex justify-between text-[11px] font-bold text-zinc-500 mt-1.5"><span>Sell</span><span>Hold</span><span>Buy</span></div>
                            </div>

                            <p className="text-sm mt-4 text-zinc-700 dark:text-zinc-300">
                                <span className="font-bold">{analysis.verdict.bullish}</span> of {analysis.signals.length} indicators lean bullish, <span className="font-bold">{analysis.verdict.bearish}</span> bearish, {analysis.verdict.neutral} neutral.
                            </p>

                            <div className="grid sm:grid-cols-2 gap-3 mt-4">
                                <div className="rounded-xl bg-white/60 dark:bg-black/20 p-3">
                                    <p className="text-xs font-black text-emerald-700 dark:text-emerald-400 mb-1.5 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" aria-hidden /> Supports buying</p>
                                    {reasons.bull.length ? <ul className="space-y-1.5">{reasons.bull.map(r => <li key={r.id} className="text-xs text-zinc-700 dark:text-zinc-300"><span className="font-bold">{r.name}:</span> {r.note}</li>)}</ul> : <p className="text-xs text-zinc-500">Nothing notable.</p>}
                                </div>
                                <div className="rounded-xl bg-white/60 dark:bg-black/20 p-3">
                                    <p className="text-xs font-black text-red-700 dark:text-red-400 mb-1.5 flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" aria-hidden /> Supports selling</p>
                                    {reasons.bear.length ? <ul className="space-y-1.5">{reasons.bear.map(r => <li key={r.id} className="text-xs text-zinc-700 dark:text-zinc-300"><span className="font-bold">{r.name}:</span> {r.note}</li>)}</ul> : <p className="text-xs text-zinc-500">Nothing notable.</p>}
                                </div>
                            </div>

                            {analysis.caveats.length > 0 && (
                                <ul className="mt-4 space-y-1">
                                    {analysis.caveats.map((c, i) => <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" aria-hidden />{c}</li>)}
                                </ul>
                            )}
                        </section>

                        {/* Timeframe + chart */}
                        <Card
                            title="Price chart with Fibonacci & key levels"
                            aside={
                                <div className="flex rounded-xl bg-zinc-100 dark:bg-white/5 p-1" role="group" aria-label="Timeframe">
                                    {TIMEFRAMES.map(t => (
                                        <button key={t.id} type="button" aria-pressed={tf === t.id} onClick={() => setTf(t.id)} className={`min-h-9 px-3 rounded-lg text-xs font-bold ${tf === t.id ? "bg-white dark:bg-zinc-700 shadow text-blue-600 dark:text-blue-400" : "text-zinc-500"}`}>{t.label}</button>
                                    ))}
                                </div>
                            }
                        >
                            <div className="h-[360px] sm:h-[520px] w-full">
                                <TradingChart title={`${symbol} analysis`} data={candles ?? []} currencySymbol="Rs " seamless priceLines={priceLines} currentTimeframe={tf} />
                            </div>
                            <p className="text-xs text-zinc-500 mt-3"><span className="text-purple-500 font-bold">Purple</span> = Fibonacci retracements · <span className="text-emerald-500 font-bold">green</span> support · <span className="text-red-500 font-bold">red</span> resistance.</p>
                        </Card>

                        {/* Reference levels */}
                        {analysis.plan && (
                            <Card title={analysis.plan.side === "long" ? "Reference levels (if buying)" : "Reference levels (if holding)"}>
                                <div className="grid sm:grid-cols-3 gap-3 text-center">
                                    <div className="rounded-xl bg-red-500/5 border border-red-500/15 p-3">
                                        <p className="text-xs font-bold text-zinc-500">Volatility stop (2 × ATR)</p>
                                        <p className="text-lg font-black tabular-nums text-red-600 dark:text-red-400">Rs {num(analysis.plan.stop)}</p>
                                        <p className="text-xs text-zinc-500">{sgn(analysis.plan.stopPct)} from price</p>
                                    </div>
                                    {analysis.plan.targets.slice(0, 2).map(t => (
                                        <div key={t.label} className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3">
                                            <p className="text-xs font-bold text-zinc-500 truncate">{t.label}</p>
                                            <p className="text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-400">Rs {num(t.price)}</p>
                                            <p className="text-xs text-zinc-500">{sgn(t.pct)} from price</p>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-zinc-500 mt-3">
                                    {analysis.plan.riskReward != null ? `Reward-to-risk to the first level ≈ ${analysis.plan.riskReward.toFixed(1)} : 1. ` : ""}
                                    Daily ATR is {num(analysis.values.atrPct)}% of price. These are volatility- and chart-based markers, not instructions.
                                </p>
                            </Card>
                        )}

                        {/* Indicators */}
                        <Card title="Indicators">
                            <div className="space-y-5">
                                {grouped.map(([group, list]) => (
                                    <div key={group}>
                                        <h3 className="text-xs font-black text-zinc-500 mb-2">{group}</h3>
                                        <ul className="divide-y divide-zinc-100 dark:divide-white/5">
                                            {list.map(s => (
                                                <li key={s.id} className="py-3 flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4">
                                                    <div className="sm:w-56 shrink-0">
                                                        <p className="text-sm font-bold">{s.name}</p>
                                                        <p className="text-xs text-zinc-500 tabular-nums">{s.value}</p>
                                                    </div>
                                                    <div className="sm:w-24 shrink-0"><LeanChip lean={s.lean} /></div>
                                                    <p className="text-sm text-zinc-600 dark:text-zinc-400 min-w-0">{s.note}</p>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* Fibonacci + pivots */}
                        <div className="grid lg:grid-cols-2 gap-5">
                            {analysis.fib && (
                                <Card title={`Fibonacci ${analysis.fib.direction === "up" ? "retracement (up-swing)" : "retracement (down-swing)"}`}>
                                    <p className="text-xs text-zinc-500 mb-3">
                                        Swing {num(analysis.fib.swingLow.price)} (low) → {num(analysis.fib.swingHigh.price)} (high) over the last {Math.min(120, analysis.bars)} {tf === "1D" ? "days" : "weeks"}.
                                        {analysis.fib.direction === "up" ? " Pullback levels often act as support." : " Bounce levels often act as resistance."}
                                    </p>
                                    <table className="w-full text-sm">
                                        <thead><tr className="text-xs text-zinc-500 text-left"><th className="py-1.5 font-bold">Level</th><th className="py-1.5 font-bold text-right">Price</th><th className="py-1.5 font-bold text-right">vs now</th></tr></thead>
                                        <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                            {[...analysis.fib.retracements, ...analysis.fib.extensions].sort((a, b) => b.price - a.price).map(l => {
                                                const d = ((l.price - analysis.price) / analysis.price) * 100;
                                                const near = Math.abs(d) < 1.5;
                                                return (
                                                    <tr key={`${l.ratio}`} className={near ? "bg-blue-500/10 font-bold" : ""}>
                                                        <td className="py-2 pl-1">{l.ratio > 1 ? `Extension ${l.label}` : l.label}{near && <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">◄ price is here</span>}</td>
                                                        <td className="py-2 text-right tabular-nums">{num(l.price)}</td>
                                                        <td className={`py-2 pr-1 text-right tabular-nums ${d >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{sgn(d)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </Card>
                            )}
                            <Card title="Pivot points & support / resistance">
                                {analysis.pivots && (
                                    <table className="w-full text-sm mb-4">
                                        <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                            {([["R3", analysis.pivots.r3], ["R2", analysis.pivots.r2], ["R1", analysis.pivots.r1], ["Pivot", analysis.pivots.pivot], ["S1", analysis.pivots.s1], ["S2", analysis.pivots.s2], ["S3", analysis.pivots.s3]] as [string, number][]).map(([k, p]) => (
                                                <tr key={k}><td className="py-2 pl-1 font-bold">{k}</td><td className="py-2 text-right tabular-nums">{num(p)}</td><td className={`py-2 pr-1 text-right tabular-nums ${p >= analysis.price ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{sgn(((p - analysis.price) / analysis.price) * 100)}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div><p className="text-xs font-black text-emerald-600 dark:text-emerald-400 mb-1">Support</p>{analysis.support.length ? analysis.support.map(l => <p key={l.price} className="tabular-nums">{num(l.price)} <span className="text-xs text-zinc-500">({l.touches}×)</span></p>) : <p className="text-xs text-zinc-500">None found</p>}</div>
                                    <div><p className="text-xs font-black text-red-600 dark:text-red-400 mb-1">Resistance</p>{analysis.resistance.length ? analysis.resistance.map(l => <p key={l.price} className="tabular-nums">{num(l.price)} <span className="text-xs text-zinc-500">({l.touches}×)</span></p>) : <p className="text-xs text-zinc-500">None found</p>}</div>
                                </div>
                                {analysis.range52 && (
                                    <div className="mt-4">
                                        <p className="text-xs text-zinc-500 mb-1">52-week range: {num(analysis.range52.low)} – {num(analysis.range52.high)} (now at {analysis.range52.positionPct.toFixed(0)}%)</p>
                                        <div className="h-2 rounded-full bg-zinc-100 dark:bg-white/10 relative"><span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-600" style={{ left: `${analysis.range52.positionPct}%` }} /></div>
                                    </div>
                                )}
                            </Card>
                        </div>

                        {/* RSI + MACD */}
                        <div className="grid lg:grid-cols-2 gap-5">
                            <Card title="RSI (14)" aside={<span className="text-xs font-bold tabular-nums text-zinc-500">{num(analysis.values.rsi, 1)}</span>}>
                                <div className="h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={sub.rsi} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#71717a22" />
                                            <XAxis dataKey="time" tick={tick} minTickGap={40} tickLine={false} axisLine={false} />
                                            <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} tick={tick} tickLine={false} axisLine={false} />
                                            <Tooltip formatter={(v) => [typeof v === "number" ? v.toFixed(1) : v, "RSI"]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                                            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" />
                                            <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="4 4" />
                                            <Line type="monotone" dataKey="rsi" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                                <p className="text-xs text-zinc-500 mt-2">Above 70 = overbought (red line), below 30 = oversold (green line).</p>
                            </Card>
                            <Card title="MACD (12, 26, 9)" aside={<span className="text-xs font-bold tabular-nums text-zinc-500">hist {num(analysis.values.macdHist)}</span>}>
                                <div className="h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={sub.macd} margin={{ top: 5, right: 8, bottom: 0, left: -10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#71717a22" />
                                            <XAxis dataKey="time" tick={tick} minTickGap={40} tickLine={false} axisLine={false} />
                                            <YAxis tick={tick} tickLine={false} axisLine={false} />
                                            <Tooltip formatter={(v) => [typeof v === "number" ? v.toFixed(2) : v, "Histogram"]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                                            <ReferenceLine y={0} stroke="#71717a" />
                                            <Bar dataKey="hist" isAnimationActive={false} fill="#3b82f6" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <p className="text-xs text-zinc-500 mt-2">Bars above zero = bullish momentum, below zero = bearish. Crossing zero is the crossover signal.</p>
                            </Card>
                        </div>
                    </>
                )}

                <p className="text-xs text-zinc-500 border-t border-zinc-200 dark:border-white/10 pt-4 max-w-3xl">
                    <span className="font-bold">Not financial advice.</span> This is an automatic summary of past price action using standard indicators. Indicators lag, often disagree, and can&apos;t see earnings, news or liquidity. Use it to structure your own research, never as the only reason to buy or sell. Price data: Yahoo Finance (daily, may be delayed).
                </p>
            </main>
        </div>
    );
}

export default function AnalysisPage() {
    return (
        <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Loading…</div>}>
            <AnalysisInner />
        </Suspense>
    );
}
