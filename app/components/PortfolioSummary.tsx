"use client";

import { TRI, direction } from "../lib/change";
import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Briefcase, PieChart } from "lucide-react";
import { useCurrency } from "../context/CurrencyContext";
import { convertAmount, currencySymbol } from "../lib/currency";
import { fetchTxns, computeHoldings, type Txn } from "../lib/portfolio";
import { fetchAllPrices, priceKey, priceIn, type PriceBook } from "../lib/prices";
import FitText from "./FitText";

// Compact live portfolio snapshot for the dashboard — headline value + today's
// and total change. Full holdings live on the /portfolio screen.
export default function PortfolioSummary() {
    const { currency: displayCur, rates } = useCurrency();

    const [txns, setTxns] = useState<Txn[]>([]);
    const [book, setBook] = useState<PriceBook>({ map: {}, rate: 278, updated: "" });
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => setTxns(await fetchTxns()), []);

    useEffect(() => {
        reload();
        const h = () => { reload(); };
        window.addEventListener("portfolio", h);
        return () => window.removeEventListener("portfolio", h);
    }, [reload]);

    useEffect(() => {
        let active = true;
        (async () => {
            setLoading(true);
            try {
                const b = await fetchAllPrices();
                if (active) setBook(b);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, []);

    const rate = book.rate;
    const fxRates = useMemo(() => ({ ...rates, PKR: rate || rates.PKR, USD: 1 }), [rates, rate]);
    const convert = useCallback(
        (amt: number, from: string, to: string) => convertAmount(amt, from, to, fxRates) ?? 0,
        [fxRates],
    );
    const { holdings, realized } = useMemo(() => computeHoldings(txns), [txns]);

    const rows = useMemo(() => holdings.map(h => {
        const info = book.map[priceKey(h.assetType, h.symbol)];
        const current = priceIn(info, h.currency, rate);
        const invested = h.quantity * h.avgCost;
        const value = current != null ? h.quantity * current : null;
        const pnl = value != null ? value - invested : null;
        const pnlPct = pnl != null && invested > 0 ? (pnl / invested) * 100 : null;
        const dayPct = info?.changePct ?? null;
        const dayPnl = (current != null && dayPct != null) ? h.quantity * current * (dayPct / 100) : null;
        // Value in display currency for ranking / totals
        const valueDisp = value != null ? convert(value, h.currency, displayCur) : null;
        return { ...h, name: h.name || info?.name, current, invested, value, valueDisp, pnl, pnlPct, dayPnl };
    }), [holdings, book, rate, displayCur, convert]);

    const totals = useMemo(() => {
        let invested = 0, value = 0, investedPriced = 0, day = 0;
        rows.forEach(r => {
            const inv = convert(r.invested, r.currency, displayCur);
            invested += inv;
            if (r.value != null) { value += convert(r.value, r.currency, displayCur); investedPriced += inv; }
            if (r.dayPnl != null) day += convert(r.dayPnl, r.currency, displayCur);
        });
        const unrealized = value - investedPriced;
        const realizedTotal = convert(realized.PKR, "PKR", displayCur) + convert(realized.USD, "USD", displayCur);
        const total = unrealized + realizedTotal;
        return {
            invested, value, day, unrealized, realizedTotal, total,
            dayPct: value > 0 ? (day / value) * 100 : 0,
            totalPct: investedPriced > 0 ? (unrealized / investedPriced) * 100 : 0,
        };
    }, [rows, realized, displayCur, convert]);

    const cs = currencySymbol(displayCur);
    const fmt = (v: number) => `${cs}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const signed = (v: number) => `${v >= 0 ? "+" : "-"}${cs}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

    const hasPositions = rows.length > 0;

    return (
        <div className="card backdrop-blur-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-2.5 border-b border-zinc-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" strokeWidth={2.25} />
                    <h3 className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white">Portfolio</h3>
                </div>
                <Link href="/portfolio" className="min-h-10 inline-flex items-center text-[11px] font-black text-blue-500 hover:text-blue-400 uppercase tracking-widest">Manage →</Link>
            </div>

            {!hasPositions ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
                    <PieChart className="w-8 h-8 mb-3 text-zinc-300 dark:text-zinc-600" strokeWidth={2} />
                    <p className="text-zinc-500 font-black uppercase tracking-widest text-[11px] mb-1">No holdings yet</p>
                    <p className="text-zinc-400 text-[11px] leading-relaxed mb-4 max-w-[240px]">
                        Record a Buy — stocks, crypto, forex or commodities — to track live value &amp; profit / loss here.
                    </p>
                    <a href="/portfolio" className="inline-flex items-center px-2 py-2 min-h-[34px] text-[10px] font-black text-blue-500 hover:text-blue-400 uppercase tracking-widest border-b border-blue-500/40">+ Add your first trade</a>
                </div>
            ) : (
                <div className="p-3.5 sm:p-4 space-y-3">
                    {/* Headline current value */}
                    <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">Current Value</p>
                        <FitText className="text-xl sm:text-2xl font-black font-mono tabular-nums tracking-tighter text-zinc-900 dark:text-white leading-none">
                            {loading && totals.value === 0 ? "…" : fmt(totals.value)}
                        </FitText>
                    </div>

                    {/* Change today vs total return */}
                    <div className="grid grid-cols-2 gap-2.5">
                        {[
                            { label: "Change Today", val: totals.day, pct: totals.dayPct },
                            { label: "Total Return", val: totals.total, pct: totals.totalPct },
                        ].map((m) => {
                            const dir = direction(m.pct);
                            const up = m.val >= 0;
                            return (
                                <div key={m.label} className={`min-w-0 rounded-xl border px-2.5 py-2 ${dir === 'flat' ? 'bg-zinc-500/[0.06] border-zinc-500/15' : up ? 'bg-green-500/[0.06] border-green-500/15' : 'bg-red-500/[0.06] border-red-500/15'}`}>
                                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">{m.label}</p>
                                    <FitText className={`text-[13px] font-black font-mono tabular-nums leading-none ${dir === 'flat' ? 'text-zinc-500' : up ? 'text-green-500' : 'text-red-500'}`}>{signed(m.val)} <span className="text-[11px]">{TRI[dir]}{Math.abs(m.pct).toFixed(2)}%</span></FitText>
                                </div>
                            );
                        })}
                    </div>

                    {/* Sub-metrics */}
                    <div className="grid grid-cols-3 gap-px bg-zinc-100 dark:bg-white/5 rounded-xl overflow-hidden">
                        {[
                            { label: "Unrealized", val: signed(totals.unrealized), tone: totals.unrealized >= 0 ? "text-green-500" : "text-red-500" },
                            { label: "Invested", val: fmt(totals.invested), tone: "text-zinc-900 dark:text-white" },
                            { label: "Holdings", val: String(rows.length), tone: "text-zinc-900 dark:text-white" },
                        ].map((m) => (
                            <div key={m.label} className="min-w-0 bg-white dark:bg-zinc-900/60 px-2.5 py-1.5">
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">{m.label}</p>
                                <FitText className={`text-[11px] sm:text-xs font-black font-mono tabular-nums leading-none ${m.tone}`}>{m.val}</FitText>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
