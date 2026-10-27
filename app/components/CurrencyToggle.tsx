"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useCurrency } from "../context/CurrencyContext";
import { CURRENCIES } from "../lib/currency";

// Per-screen display-currency switcher. Renders nothing unless the user enabled
// more than one currency in Settings — with a single currency the default one
// simply displays everywhere. Never shown on PSX / NASDAQ screens: those markets
// are always quoted in PKR and USD respectively.
//
// Phones get a compact trigger that opens a bottom sheet: a segmented control
// costs more width than a header has to spare, and shrinks every option to a
// sub-30px tap target as soon as a third currency is enabled. Tablets and up keep
// the segmented control (or a select once the list outgrows it).
export default function CurrencyToggle({ className = "" }: { className?: string }) {
    const { currency, setCurrency, options, canSwitch, symbolOf } = useCurrency();
    const [sheetOpen, setSheetOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    // Lock background scrolling and wire Escape while the sheet is up.
    useEffect(() => {
        if (!sheetOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheetOpen(false); };
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
        };
    }, [sheetOpen]);

    if (!canSwitch) return null;

    const nameOf = (code: string) => CURRENCIES.find(c => c.code === code)?.name ?? code;

    const sheet = sheetOpen && mounted ? createPortal(
        <div className="sm:hidden fixed inset-0 z-[160]" role="dialog" aria-modal="true" aria-label="Select display currency">
            <div
                className="sheet-scrim absolute inset-0 bg-black/50 backdrop-blur-[2px]"
                onClick={() => setSheetOpen(false)}
            />
            <div className="sheet-panel absolute inset-x-0 bottom-0 max-h-[75vh] flex flex-col rounded-t-3xl bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shadow-2xl pb-safe">
                <div className="shrink-0 pt-2.5 pb-1 flex justify-center">
                    <span className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                </div>
                <p className="shrink-0 px-5 pb-2 pt-1 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">
                    Display currency
                </p>
                <div className="overflow-y-auto px-2 pb-2">
                    {options.map(code => {
                        const active = code === currency;
                        return (
                            <button
                                key={code}
                                onClick={() => { setCurrency(code); setSheetOpen(false); }}
                                aria-pressed={active}
                                className={`w-full flex items-center gap-3 px-3 py-3 min-h-[52px] rounded-2xl text-left transition-colors ${active
                                    ? "bg-blue-600/10 dark:bg-blue-500/15"
                                    : "active:bg-zinc-100 dark:active:bg-zinc-800"
                                    }`}
                            >
                                <span className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-sm font-black ${active
                                    ? "bg-blue-600 text-white"
                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                                    }`}>
                                    {symbolOf(code).trim()}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className={`block text-sm font-black uppercase tracking-widest truncate ${active ? "text-blue-600 dark:text-blue-400" : "text-zinc-900 dark:text-white"}`}>
                                        {code}
                                    </span>
                                    <span className="block text-[11px] font-bold text-zinc-400 truncate">{nameOf(code)}</span>
                                </span>
                                {active && <Check className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400" strokeWidth={3} />}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body,
    ) : null;

    return (
        <>
            {/* Phone: compact trigger + bottom sheet */}
            <button
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                aria-label={`Display currency: ${currency}. Change`}
                className={`sm:hidden inline-flex items-center justify-center gap-1.5 shrink-0 px-3 h-10 min-w-[4.75rem] rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white active:scale-95 transition-transform ${className}`}
            >
                <span className="text-[11px] font-black uppercase tracking-widest leading-none">{currency}</span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0 text-zinc-400" strokeWidth={3} />
            </button>
            {sheet}

            {/* Tablet and up: segmented control, or a select once it gets crowded */}
            {options.length > 4 ? (
                <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    aria-label="Display currency"
                    title="Display currency"
                    className={`hidden sm:block px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[11px] font-black uppercase tracking-widest text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all ${className}`}
                >
                    {options.map(code => <option key={code} value={code}>{code}</option>)}
                </select>
            ) : (
                <div
                    role="group"
                    aria-label="Display currency"
                    className={`hidden sm:flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 border border-zinc-200 dark:border-zinc-700 shrink-0 ${className}`}
                >
                    {options.map(code => (
                        <button
                            key={code}
                            onClick={() => setCurrency(code)}
                            aria-pressed={currency === code}
                            className={`px-4 py-1.5 text-[11px] font-black rounded-lg transition-all uppercase tracking-widest ${currency === code
                                ? "bg-white dark:bg-zinc-700 shadow text-blue-600 dark:text-blue-400"
                                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                                }`}
                        >
                            {code}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}
