"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
const TradingChart = dynamic(() => import("./TradingChart"), { ssr: false });
import { useSettings } from "../context/SettingsContext";
import { useCurrency } from "../context/CurrencyContext";
import CurrencyToggle from "./CurrencyToggle";
import { computePivotLevels, nextLevels } from "../lib/levels";

// Self-contained "Graph Analysis" terminal for precious metals: fetches its own
// spot anchors + real history, scales candles to the live spot, and derives pivot
// support/resistance. Rendered on its own route (moved out of the metals page).
export default function MetalsGraphAnalysis() {
    const { settings } = useSettings();
    const { currency: tableCurrency, sym: mSym, conv } = useCurrency();

    const [metal, setMetal] = useState<"gold" | "silver">("gold");
    const [goldTF, setGoldTF] = useState("1D");
    const [silverTF, setSilverTF] = useState("1D");
    const [goldRaw, setGoldRaw] = useState<any>(null);
    const [silverRaw, setSilverRaw] = useState<any>(null);
    const [spot, setSpot] = useState<{ gold: any; silver: any }>({ gold: null, silver: null });
    const [goldCandles, setGoldCandles] = useState<any[]>([]);
    const [silverCandles, setSilverCandles] = useState<any[]>([]);

    // Live spot quotes (used as the anchor for the last candle close).
    const loadSpot = useCallback(async () => {
        try {
            const [g, s] = await Promise.all([
                fetch("/api/gold-price").then(r => (r.ok ? r.json() : null)).catch(() => null),
                fetch("/api/silver-price").then(r => (r.ok ? r.json() : null)).catch(() => null),
            ]);
            setSpot({ gold: g, silver: s });
        } catch { /* keep previous */ }
    }, []);

    useEffect(() => { loadSpot(); }, [loadSpot]);
    useEffect(() => {
        if (!settings.refreshInterval || settings.refreshInterval <= 0) return;
        const id = setInterval(loadSpot, Math.max(30, settings.refreshInterval) * 1000);
        return () => clearInterval(id);
    }, [settings.refreshInterval, loadSpot]);

    // Real USD/oz history per timeframe.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/metals-history?metal=gold&timeframe=${goldTF}`);
                const json = await res.json();
                if (!cancelled && json?.success && Array.isArray(json.data) && json.data.length) setGoldRaw(json);
            } catch { /* keep previous */ }
        })();
        return () => { cancelled = true; };
    }, [goldTF]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/metals-history?metal=silver&timeframe=${silverTF}`);
                const json = await res.json();
                if (!cancelled && json?.success && Array.isArray(json.data) && json.data.length) setSilverRaw(json);
            } catch { /* keep previous */ }
        })();
        return () => { cancelled = true; };
    }, [silverTF]);

    // Scale candles so the last close matches the live spot (gold per tola, silver per ounce).
    useEffect(() => {
        const gold = spot.gold, silver = spot.silver;
        const scaleCandles = (raw: any, anchor?: number) => {
            if (!raw?.data?.length) return [];
            const lastClose = raw.data[raw.data.length - 1].close;
            if (!lastClose) return [];
            const scale = (anchor && anchor > 0) ? anchor / lastClose : 1;
            return raw.data.map((c: any) => ({ time: c.time, open: c.open * scale, high: c.high * scale, low: c.low * scale, close: c.close * scale, volume: c.volume }));
        };
        const goldAnchor = conv(gold?.tola24k?.usdPrice, gold?.tola24k?.pkrPrice) ?? undefined;
        const silverAnchor = conv(silver?.ounce?.usdPrice, silver?.ounce?.pkrPrice) ?? undefined;
        setGoldCandles(scaleCandles(goldRaw, goldAnchor));
        setSilverCandles(scaleCandles(silverRaw, silverAnchor));
    }, [goldRaw, silverRaw, spot, tableCurrency]);

    const activeCandles = metal === "gold" ? goldCandles : silverCandles;
    const activeTF = metal === "gold" ? goldTF : silverTF;
    const setActiveTF = metal === "gold" ? setGoldTF : setSilverTF;
    const pivotSrc = [...activeCandles].reverse().find((c: any) => c && c.high > c.low) || activeCandles[activeCandles.length - 1];
    const metalLevels = pivotSrc ? computePivotLevels(pivotSrc.high, pivotSrc.low, pivotSrc.close) : null;
    const metalNext = (metalLevels && pivotSrc) ? nextLevels(pivotSrc.close, metalLevels) : { nextResistance: null, nextSupport: null };
    const fmtLvl = (v?: number | null) => v == null ? "—" : `${mSym}${v.toLocaleString(undefined, { maximumFractionDigits: v > 1 ? 2 : 4 })}`;
    const fmtCompact = (v?: number | null) => {
        if (v == null) return "—";
        if (v >= 1000) return `${mSym}${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v)}`;
        return `${mSym}${v.toLocaleString(undefined, { maximumFractionDigits: v > 1 ? 2 : 4 })}`;
    };
    const metalPriceLines = [
        ...(metalNext.nextResistance != null ? [{ price: metalNext.nextResistance, color: "#ef4444", title: "Resistance" }] : []),
        ...(metalNext.nextSupport != null ? [{ price: metalNext.nextSupport, color: "#22c55e", title: "Support" }] : []),
    ];

    return (
        <div className="card p-4 sm:p-10 overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                <span className="text-[12rem] font-black italic text-amber-500 uppercase select-none">{metal}</span>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 sm:mb-12 gap-8 relative z-10">
                <div>
                    <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-50 uppercase italic tracking-tighter">Velocity Terminal</h2>
                    <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mt-1">Global Sentiment Explorer: {metal}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <CurrencyToggle />
                    <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 shadow-inner h-fit">
                        <button onClick={() => setMetal("gold")} className={`px-4 py-2 text-[11px] font-black rounded-lg transition-all uppercase tracking-widest ${metal === "gold" ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" : "text-zinc-500"}`}>Gold</button>
                        <button onClick={() => setMetal("silver")} className={`px-4 py-2 text-[11px] font-black rounded-lg transition-all uppercase tracking-widest ${metal === "silver" ? "bg-zinc-500 text-white shadow-lg shadow-zinc-500/20" : "text-zinc-500"}`}>Silver</button>
                    </div>
                </div>
            </div>
            <div className="h-[400px] sm:h-[600px] w-full relative z-10">
                <TradingChart
                    title={`${metal.toUpperCase()} Snapshot Analysis`}
                    data={activeCandles}
                    currentTimeframe={activeTF}
                    onTimeframeChange={setActiveTF}
                    currencySymbol={mSym}
                    priceLines={metalPriceLines}
                    seamless={true}
                />
            </div>

            {/* Pivot support / resistance ladder */}
            {metalLevels && (
                <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-white/5 relative z-10">
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                        <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Pivot Levels · Support / Resistance ({activeTF})</div>
                        <div className="flex items-center gap-4 sm:gap-6">
                            <div>
                                <span className="text-[10px] font-black text-green-600/80 dark:text-green-400/80 uppercase tracking-widest mr-1.5">Next Support</span>
                                <span className="text-xs font-mono font-black text-green-600 dark:text-green-400 tabular-nums">{fmtLvl(metalNext.nextSupport)}</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-black text-red-600/80 dark:text-red-400/80 uppercase tracking-widest mr-1.5">Next Resistance</span>
                                <span className="text-xs font-mono font-black text-red-600 dark:text-red-400 tabular-nums">{fmtLvl(metalNext.nextResistance)}</span>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                        {[
                            { label: "S3", val: metalLevels.s3, tone: "text-green-600 dark:text-green-400" },
                            { label: "S2", val: metalLevels.s2, tone: "text-green-600 dark:text-green-400" },
                            { label: "S1", val: metalLevels.s1, tone: "text-green-600 dark:text-green-400" },
                            { label: "PIVOT", val: metalLevels.pivot, tone: "text-zinc-900 dark:text-white" },
                            { label: "R1", val: metalLevels.r1, tone: "text-red-600 dark:text-red-400" },
                            { label: "R2", val: metalLevels.r2, tone: "text-red-600 dark:text-red-400" },
                            { label: "R3", val: metalLevels.r3, tone: "text-red-600 dark:text-red-400" },
                        ].map(lvl => (
                            <div key={lvl.label} title={fmtLvl(lvl.val)} className="card-inset px-2 py-2 text-center">
                                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">{lvl.label}</div>
                                <div className={`text-[11px] sm:text-xs font-mono font-black tabular-nums ${lvl.tone}`}>{fmtCompact(lvl.val)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
