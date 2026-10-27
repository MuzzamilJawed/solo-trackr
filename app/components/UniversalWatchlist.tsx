"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Check, Globe, Plus, Search, X } from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import { useCurrency } from "../context/CurrencyContext";
import CurrencyToggle from "./CurrencyToggle";
import { MARKET_CURRENCY, currencySymbol } from "../lib/currency";
import { fetchWatch, addWatch, removeWatch, type WatchItem } from "../lib/universalWatch";
import {
    fetchAllPrices, priceKey, priceInAny, ASSET_TYPES,
    COMMODITY_SYMBOLS, type AssetType, type PriceBook,
} from "../lib/prices";

export default function UniversalWatchlist() {
    const { settings } = useSettings();
    const { currency: displayCur, rates } = useCurrency();

    const [items, setItems] = useState<WatchItem[]>([]);
    const [book, setBook] = useState<PriceBook>({ map: {}, rate: 278, updated: "" });
    const [loading, setLoading] = useState(true);
    const [assetType, setAssetType] = useState<AssetType>("CRYPTO");
    const [symbol, setSymbol] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0); // keyboard-highlighted suggestion
    const boxRef = useRef<HTMLDivElement>(null);

    const reload = useCallback(async () => setItems(await fetchWatch()), []);
    useEffect(() => {
        reload();
        const h = () => { reload(); };
        window.addEventListener("uwatch", h);
        return () => window.removeEventListener("uwatch", h);
    }, [reload]);

    const loadPrices = useCallback(async () => {
        setLoading(true);
        try { setBook(await fetchAllPrices()); } finally { setLoading(false); }
    }, []);
    useEffect(() => {
        loadPrices();
        if (!settings.refreshInterval || settings.refreshInterval <= 0) return;
        const id = setInterval(loadPrices, Math.max(30, settings.refreshInterval) * 1000);
        return () => clearInterval(id);
    }, [loadPrices, settings.refreshInterval]);

    const suggestions = useMemo(() => {
        if (assetType === "COMMODITY") return COMMODITY_SYMBOLS as unknown as string[];
        const prefix = `${assetType}:`;
        return Object.keys(book.map).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length)).sort();
    }, [book, assetType]);

    const watchedSet = useMemo(
        () => new Set(items.map(i => `${i.assetType}:${i.symbol}`)),
        [items]
    );

    // Filtered, ranked (startsWith first), capped list for the styled dropdown.
    const filtered = useMemo(() => {
        const q = symbol.trim().toUpperCase();
        const base = q ? suggestions.filter(s => s.includes(q)) : suggestions;
        const ranked = q
            ? [...base].sort((a, b) => (a.startsWith(q) ? 0 : 1) - (b.startsWith(q) ? 0 : 1) || a.localeCompare(b))
            : base;
        return ranked.slice(0, 8);
    }, [suggestions, symbol]);

    // Reset keyboard highlight whenever the visible options change.
    useEffect(() => { setActive(0); }, [symbol, assetType]);

    // Close the dropdown on outside click.
    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const add = (sym?: string) => {
        const s = (sym ?? symbol).trim();
        if (!s) return;
        addWatch(assetType, s);
        setSymbol("");
        setOpen(false);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") { setOpen(false); return; }
        if (!open && (e.key === "ArrowDown")) { setOpen(true); return; }
        if (open && filtered.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); return; }
            if (e.key === "Enter") { e.preventDefault(); add(filtered[active] ?? symbol); return; }
        } else if (e.key === "Enter") {
            add();
        }
    };

    // PSX rows stay in PKR and NASDAQ rows in USD; everything else follows the
    // active display currency.
    const fxRates = useMemo(() => ({ ...rates, PKR: book.rate || rates.PKR, USD: 1 }), [rates, book.rate]);
    const codeFor = (t: AssetType) => MARKET_CURRENCY[t] ?? displayCur;
    const fmt = (v: number | null, code: string) => v == null ? "—" : `${currencySymbol(code)}${v.toLocaleString(undefined, { minimumFractionDigits: v < 1 ? 4 : 2, maximumFractionDigits: v < 1 ? 6 : 2 })}`;
    const badge = (t: AssetType) => ({ PSX: "bg-blue-500/10 text-blue-500", NASDAQ: "bg-indigo-500/10 text-indigo-500", CRYPTO: "bg-orange-500/10 text-orange-500", FOREX: "bg-green-500/10 text-green-500", COMMODITY: "bg-amber-500/10 text-amber-500" }[t]);
    const inputCls = "px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500";

    return (
        <div className="card overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between gap-2">
                <div>
                    <h2 className="text-sm font-black uppercase tracking-tighter italic flex items-center gap-2"><Globe className="w-4 h-4 text-blue-500 shrink-0" strokeWidth={2} /> Watch Any Asset</h2>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">Stocks · Crypto · Forex · Commodities</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <CurrencyToggle />
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{loading ? "Pricing…" : book.updated}</span>
                </div>
            </div>

            {/* Add row — market selector + searchable autocomplete */}
            <div className="px-4 sm:px-6 py-3 border-b border-zinc-100 dark:border-white/5 flex flex-wrap items-center gap-2">
                <select value={assetType} onChange={e => { setAssetType(e.target.value as AssetType); setSymbol(""); setOpen(false); }} className={inputCls}>
                    {ASSET_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>

                {/* Autocomplete */}
                <div ref={boxRef} className="relative flex-1 min-w-0 basis-[12rem]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" strokeWidth={2.5} />
                    <input
                        value={symbol}
                        onChange={e => { setSymbol(e.target.value.toUpperCase()); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={onKeyDown}
                        placeholder={assetType === "COMMODITY" ? "Search GOLD, SILVER…" : assetType === "CRYPTO" ? "Search BTC, ETH…" : assetType === "NASDAQ" ? "Search AAPL, TSLA…" : "Search symbol…"}
                        className={`${inputCls} w-full pl-8`}
                        autoComplete="off"
                    />

                    {open && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl shadow-black/10 dark:shadow-black/50 overflow-hidden">
                            {filtered.length === 0 ? (
                                <div className="px-3 py-3 text-center">
                                    <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">
                                        {symbol.trim() ? `No match — press Enter to add “${symbol.trim()}”` : "Start typing to search"}
                                    </p>
                                </div>
                            ) : (
                                <div className="max-h-60 overflow-y-auto custom-scrollbar py-1">
                                    {filtered.map((s, i) => {
                                        const nm = book.map[priceKey(assetType, s)]?.name;
                                        const already = watchedSet.has(`${assetType}:${s}`);
                                        return (
                                            <button
                                                key={s}
                                                onMouseDown={e => e.preventDefault()}
                                                onMouseEnter={() => setActive(i)}
                                                onClick={() => add(s)}
                                                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${i === active ? "bg-blue-50 dark:bg-blue-900/25" : "hover:bg-zinc-50 dark:hover:bg-white/[0.03]"}`}
                                            >
                                                <span className="flex items-center gap-2 min-w-0">
                                                    <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 ${badge(assetType)}`}>{assetType}</span>
                                                    <span className="text-xs font-black tracking-tight text-zinc-900 dark:text-white shrink-0">{s}</span>
                                                    {nm && <span className="text-[11px] text-zinc-400 font-bold truncate">{nm}</span>}
                                                </span>
                                                {already ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-green-500 uppercase tracking-widest shrink-0"><Check className="w-3 h-3" strokeWidth={3} /> Added</span>
                                                ) : (
                                                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest shrink-0 flex items-center gap-0.5"><Plus className="w-3 h-3" strokeWidth={3} />Add</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <button onClick={() => add()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-1 shrink-0"><Plus className="w-3.5 h-3.5" strokeWidth={3} />Watch</button>
            </div>

            {/* List */}
            {items.length === 0 ? (
                <div className="py-12 text-center px-4">
                    <Globe className="w-8 h-8 mx-auto mb-2 text-zinc-400" strokeWidth={1.5} />
                    <p className="text-zinc-500 font-black uppercase tracking-widest text-[11px]">Watch anything — pick a market above and add a symbol</p>
                </div>
            ) : (
                <div className="divide-y divide-zinc-100 dark:divide-white/5 max-h-[420px] overflow-y-auto custom-scrollbar">
                    {items.map(it => {
                        const info = book.map[priceKey(it.assetType, it.symbol)];
                        const code = codeFor(it.assetType);
                        const price = priceInAny(info, code, fxRates);
                        return (
                            <div key={`${it.assetType}:${it.symbol}`} className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 hover:bg-zinc-50 dark:hover:bg-white/[0.02]">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 ${badge(it.assetType)}`}>{it.assetType}</span>
                                    <div className="min-w-0">
                                        <div className="text-xs font-black tracking-tight truncate">{it.symbol}</div>
                                        <div className="text-[10px] text-zinc-400 font-bold truncate max-w-[180px]">{info?.name || (loading ? "…" : "Not found in feed")}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-xs font-black font-mono tabular-nums">{fmt(price, code)}</span>
                                    <button onClick={() => removeWatch(it.assetType, it.symbol)} className="text-zinc-400 hover:text-red-500 text-sm" title="Remove" aria-label={`Remove ${it.symbol}`}><X className="w-4 h-4" strokeWidth={2.5} /></button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
