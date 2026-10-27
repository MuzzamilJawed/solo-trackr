"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ArrowRightLeft, ChevronDown, CircleDollarSign, X } from "lucide-react";

// er-api gives rates as "units of CODE per 1 USD". Converting A→B:
//   result = amount * rates[B] / rates[A]
const PRIORITY = ["USD", "EUR", "GBP", "PKR", "JPY", "AUD", "CAD", "CHF", "CNY", "SAR", "AED", "INR"];

let _dn: Intl.DisplayNames | null = null;
const nameOf = (code: string): string => {
    try { _dn = _dn || new Intl.DisplayNames(["en"], { type: "currency" }); return _dn.of(code) || code; }
    catch { return code; }
};

export default function CurrencyConverter() {
    const [rates, setRates] = useState<Record<string, number>>({});
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [from, setFrom] = useState("USD");
    const [to, setTo] = useState("PKR");
    const [amount, setAmount] = useState("1");

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/forex/rates")
            .then(r => r.json())
            .then(j => { if (!cancelled && j?.success) setRates(j.rates || {}); })
            .catch(() => { });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    const codes = useMemo(() => {
        const all = Object.keys(rates).filter(c => rates[c] > 0);
        const set = new Set(PRIORITY);
        return [...PRIORITY.filter(c => all.includes(c)), ...all.filter(c => !set.has(c)).sort()];
    }, [rates]);

    const amt = parseFloat(amount) || 0;
    const rate = (rates[from] && rates[to]) ? rates[to] / rates[from] : null;   // 1 from = rate to
    const result = rate != null ? amt * rate : null;
    const inverse = rate ? 1 / rate : null;

    const fmt = (v: number | null, d = 2) => v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: v !== 0 && Math.abs(v) < 1 ? 4 : d, maximumFractionDigits: v !== 0 && Math.abs(v) < 1 ? 6 : d });

    // Quick reference: 1 USD in a few popular currencies
    const quick = ["PKR", "EUR", "GBP"].map(c => ({ code: c, val: (rates.USD && rates[c]) ? rates[c] / rates.USD : null }));

    const swap = () => { setFrom(to); setTo(from); };

    return (
        <>
            {/* Card */}
            <button
                onClick={() => setOpen(true)}
                className="card w-full text-left p-4 hover:border-blue-500/40 transition-all group"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center"><ArrowRightLeft className="w-4 h-4" strokeWidth={2} /></span>
                        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-900 dark:text-white">Converter</h2>
                    </div>
                    <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest inline-flex items-center gap-1 group-hover:gap-2 transition-all">Open <ArrowRight className="w-3 h-3" strokeWidth={2.5} /></span>
                </div>
                <div className="space-y-1.5">
                    {quick.map(q => (
                        <div key={q.code} className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">1 USD =</span>
                            <span className="text-[11px] font-mono font-black tabular-nums text-zinc-900 dark:text-white">{fmt(q.val)} <span className="text-zinc-400">{q.code}</span></span>
                        </div>
                    ))}
                </div>
            </button>

            {/* Modal — portaled to body to escape the sticky column's stacking context */}
            {mounted && open && createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setOpen(false)} />
                    <div className="card relative w-full max-w-md p-5 sm:p-6 space-y-5 animate-in zoom-in-95 fade-in duration-200">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <span className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center"><ArrowRightLeft className="w-5 h-5" strokeWidth={2} /></span>
                                <div>
                                    <h3 className="text-sm font-black uppercase italic tracking-tight text-zinc-900 dark:text-white leading-none">Currency Converter</h3>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Live cross rates</p>
                                </div>
                            </div>
                            <button onClick={() => setOpen(false)} aria-label="Close converter" className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"><X className="w-4 h-4" strokeWidth={2.5} /></button>
                        </div>

                        {/* Amount */}
                        <div>
                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Amount</label>
                            <input
                                type="number"
                                inputMode="decimal"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="mt-1.5 w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl px-3.5 py-3 text-lg font-black font-mono tabular-nums outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                            />
                        </div>

                        {/* From / swap / To */}
                        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                            <CurrencySelect label="From" value={from} onChange={setFrom} codes={codes} />
                            <button onClick={swap} title="Swap" aria-label="Swap currencies" className="mb-1 w-9 h-9 shrink-0 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-90 transition-all shadow-lg shadow-blue-600/20"><ArrowRightLeft className="w-4 h-4" strokeWidth={2.5} /></button>
                            <CurrencySelect label="To" value={to} onChange={setTo} codes={codes} />
                        </div>

                        {/* Result */}
                        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-28 h-28 bg-white/10 rounded-full blur-2xl -translate-y-8 translate-x-8 pointer-events-none" />
                            <p className="relative text-[11px] font-black uppercase tracking-widest text-blue-100/80">{fmt(amt)} {from} =</p>
                            <p className="relative text-2xl sm:text-3xl font-black font-mono tabular-nums leading-tight mt-1 break-words">
                                {fmt(result, 2)} <span className="text-lg text-blue-100">{to}</span>
                            </p>
                            <div className="relative mt-4 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-blue-100/90">
                                <span>1 {from} = {fmt(rate, 4)} {to}</span>
                                <span>1 {to} = {fmt(inverse, 4)} {from}</span>
                            </div>
                        </div>

                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Indicative mid-market rates · not for settlement</p>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

function CurrencySelect({ label, value, onChange, codes }: { label: string; value: string; onChange: (v: string) => void; codes: string[] }) {
    return (
        <div className="min-w-0">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{label}</label>
            <div className="relative mt-1.5">
                <CircleDollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" strokeWidth={2} />
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl pl-9 pr-7 py-3 text-sm font-black uppercase tracking-tight appearance-none outline-none focus:ring-2 focus:ring-blue-600 transition-all cursor-pointer truncate"
                >
                    {codes.map(c => <option key={c} value={c}>{c} — {nameOf(c)}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" strokeWidth={2.5} />
            </div>
        </div>
    );
}
