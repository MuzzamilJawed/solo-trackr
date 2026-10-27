"use client";

import { TRI, direction } from "../lib/change";
import { useEffect, useState } from "react";
import { Target, Medal, Gem, Trash2, X } from "lucide-react";
import { dayRangePosition } from "../lib/stockSignals";
import { getMetalTarget, setMetalTarget, type MetalTarget } from "../lib/stockPrefs";
import { useCurrency } from "../context/CurrencyContext";
import { rateOf } from "../lib/currency";
import FitText from "./FitText";

interface MetalStatCardProps {
    metal: "GOLD" | "SILVER";
    label: string;
    icon: string;
    baseUnit: MetalUnit;      // unit used by currentPrice and stored targets
    currentPrice?: number;    // PKR
    change?: number;          // PKR
    changePercent?: number;
    low52?: number | null;    // PKR
    high52?: number | null;   // PKR
    accent: string;           // tailwind gradient classes
    /** Implied USD→PKR rate from the metal feed (keeps PKR↔USD in step with it). */
    pkrPerUsd?: number;
}

type MetalUnit = "Gram" | "Tola" | "Ounce" | "Kg";

const UNIT_GRAMS: Record<MetalUnit, number> = {
    Gram: 1,
    Tola: 11.6638,
    Ounce: 31.1035,
    Kg: 1000,
};

const UNIT_LABELS: Record<MetalUnit, string> = {
    Gram: "gm",
    Tola: "tola",
    Ounce: "ounce",
    Kg: "kg",
};

export default function MetalStatCard({
    metal, label, baseUnit, currentPrice, change = 0, changePercent = 0, low52, high52, accent, pkrPerUsd,
}: MetalStatCardProps) {
    // Every figure arrives in PKR; targets are stored in PKR too. `fx` scales
    // PKR into whichever currency the user is viewing.
    const { currency, sym, rates } = useCurrency();
    const usdPkr = pkrPerUsd && pkrPerUsd > 0 ? pkrPerUsd : rateOf(rates, "PKR");
    const fx = currency === "PKR" ? 1 : rateOf(rates, currency) / usdPkr;
    const show = (v?: number | null) => (v == null ? null : v * fx);

    const [target, setTargetState] = useState<MetalTarget | null>(null);
    const [editing, setEditing] = useState(false);
    const [input, setInput] = useState("");
    const [selectedUnit, setSelectedUnit] = useState<MetalUnit>(baseUnit);

    useEffect(() => {
        const load = () => setTargetState(getMetalTarget(metal));
        load();
        window.addEventListener("stockprefs", load);
        return () => window.removeEventListener("stockprefs", load);
    }, [metal]);

    const isPos = (change || 0) >= 0;
    const dirNow = direction(changePercent);
    const rangePos = dayRangePosition(low52 ?? undefined, high52 ?? undefined, currentPrice);
    const unitRatio = UNIT_GRAMS[selectedUnit] / UNIT_GRAMS[baseUnit];
    const toSelectedUnit = (value?: number | null) => value == null ? null : value * unitRatio;
    const selectedPrice = toSelectedUnit(currentPrice);
    const selectedChange = toSelectedUnit(change);

    // Target status
    let hit = false, awayPct: number | null = null;
    if (target && currentPrice) {
        hit = target.dir === "above" ? currentPrice >= target.value : currentPrice <= target.value;
        awayPct = ((target.value - currentPrice) / currentPrice) * 100;
    }

    const save = () => {
        // Targets stay normalized to the feed's base unit while the editor follows the selected unit.
        const v = parseFloat(input.replace(/,/g, ""));
        const baseValue = Number.isFinite(v) && v > 0 ? (v / fx) / unitRatio : null;
        setMetalTarget(metal, baseValue, currentPrice || 0);
        setEditing(false);
    };

    const fmt = (n?: number | null) =>
        n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 });
    const fmtPkr = (n?: number | null) => fmt(show(toSelectedUnit(n)));

    return (
        <div className={`rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 text-white relative overflow-hidden bg-gradient-to-br ${accent} shadow-xl`}>
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -translate-y-12 translate-x-8 pointer-events-none"></div>

            <div className="relative z-10">
                <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                        {metal === "GOLD"
                            ? <Medal className="w-5 h-5 shrink-0" strokeWidth={2} />
                            : <Gem className="w-5 h-5 shrink-0" strokeWidth={2} />}
                        <div className="min-w-0">
                            <h3 className="text-sm font-black uppercase italic tracking-tighter leading-none">{label}</h3>
                            <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-0.5">per {UNIT_LABELS[selectedUnit]}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                        <label className="sr-only" htmlFor={`${metal.toLowerCase()}-unit`}>Price unit</label>
                        <select
                            id={`${metal.toLowerCase()}-unit`}
                            value={selectedUnit}
                            onChange={(event) => setSelectedUnit(event.target.value as MetalUnit)}
                            aria-label={`${label} price unit`}
                            className="h-8 max-w-[5.75rem] rounded-lg border border-white/20 bg-white/15 px-2 text-[10px] font-black uppercase tracking-widest text-white outline-none focus:ring-2 focus:ring-white/40"
                        >
                            {(Object.keys(UNIT_LABELS) as MetalUnit[]).map(unit => <option key={unit} value={unit} className="text-zinc-900">{UNIT_LABELS[unit]}</option>)}
                        </select>
                        {!editing && (target ? (
                        <button
                            onClick={() => { setInput(String(Number(((show(toSelectedUnit(target.value)) ?? 0)).toFixed(2)))); setEditing(true); }}
                            title={hit ? "Target reached — tap to edit" : "Tap to edit your price target"}
                            className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${hit
                                ? "bg-white text-emerald-600 animate-pulse"
                                : "bg-white/15 hover:bg-white/25 text-white/90"
                                }`}
                        >
                            <Target className="w-3 h-3 shrink-0" strokeWidth={2} />
                            {hit ? "Target hit" : (
                                <>
                                    <span className="tabular-nums">{sym}{fmtPkr(target.value)}</span>
                                    {awayPct != null && (
                                        <span className="tabular-nums text-white/60">{(awayPct >= 0 ? "+" : "") + awayPct.toFixed(1)}%</span>
                                    )}
                                </>
                            )}
                        </button>
                        ) : (
                        <button
                            onClick={() => { setInput(""); setEditing(true); }}
                            title="Set a price target"
                            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] rounded-full bg-white/15 hover:bg-white/25 text-[10px] font-black uppercase tracking-widest text-white/80 hover:text-white transition-colors"
                        >
                            <Target className="w-3 h-3 shrink-0" strokeWidth={2} /> Set target
                        </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-end justify-between gap-2 mb-4">
                    <div className="min-w-0 flex-1">
                        <FitText className="text-2xl sm:text-4xl font-black font-mono tracking-tighter leading-none">
                            <span className="text-sm sm:text-lg font-medium mr-1 text-white/70">{sym}</span>{fmt(show(selectedPrice))}
                        </FitText>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mt-1">per {UNIT_LABELS[selectedUnit]}</p>
                    </div>
                    <div className={`text-right shrink-0 ${dirNow === 'flat' ? 'text-white/70' : isPos ? 'text-emerald-200' : 'text-red-200'}`}>
                        <p className="text-sm font-black font-mono leading-none">{TRI[dirNow]} {Math.abs(changePercent || 0).toFixed(2)}%</p>
                        <p className="text-[11px] font-bold opacity-80">{isPos ? '+' : ''}{fmt(show(selectedChange || 0))}</p>
                    </div>
                </div>

                {/* 52-week range bar */}
                <div>
                    <div className="flex items-center justify-between text-[10px] font-black text-white/70 uppercase tracking-widest mb-1.5">
                        <span>52W Low {fmtPkr(low52)}</span>
                        <span>52W High {fmtPkr(high52)}</span>
                    </div>
                    <div className="relative h-1.5 rounded-full bg-white/20">
                        {rangePos != null && (
                            <div
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-white/60 shadow"
                                style={{ left: `${rangePos}%` }}
                                title={`${rangePos.toFixed(0)}% of 52-week range`}
                            ></div>
                        )}
                    </div>
                </div>

                {/* The editor only exists while it is being used, so the card keeps
                    its short resting height. */}
                {editing && (
                    <div className="mt-4 pt-3 border-t border-white/15">
                        <div className="flex items-center gap-2">
                            <div className="flex-1 relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 text-xs font-bold">{sym}</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    autoFocus
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && save()}
                                    placeholder={`Target per ${UNIT_LABELS[selectedUnit]}`}
                                    className="w-full bg-white/15 border border-white/20 rounded-xl pl-9 pr-3 py-2 text-sm font-black text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/40"
                                />
                            </div>
                            <button onClick={save} className="shrink-0 bg-white text-zinc-900 text-[11px] font-black uppercase px-3 py-2 min-h-[36px] rounded-xl">Save</button>
                            <button
                                onClick={() => setEditing(false)}
                                aria-label="Cancel"
                                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X className="w-4 h-4" strokeWidth={2.5} />
                            </button>
                            {target && (
                                <button
                                    onClick={() => { setMetalTarget(metal, null, currentPrice || 0); setEditing(false); }}
                                    aria-label="Remove target"
                                    title="Remove target"
                                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" strokeWidth={2} />
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
