"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Check, Search, Plus, FolderPlus, Lock } from "lucide-react";
import { priceKey, ASSET_TYPES, type AssetType, type PriceBook } from "../lib/prices";

interface WatchlistAddBarProps {
    watchlists: any[];   // each: _id, name, symbols[], type
    activeId: string | null;
    book: PriceBook;
    onAdd: (watchlistId: string, symbol: string, type: AssetType) => void;
    onSelectCategory: (id: string) => void;
}

const TYPE_LABEL: Record<AssetType, string> = {
    PSX: "PSX Stock", NASDAQ: "NASDAQ", CRYPTO: "Crypto", FOREX: "Forex", COMMODITY: "Metals / Commodity",
};
const TYPE_BADGE: Record<AssetType, string> = {
    PSX: "bg-blue-500/10 text-blue-500", NASDAQ: "bg-indigo-500/10 text-indigo-500",
    CRYPTO: "bg-orange-500/10 text-orange-500", FOREX: "bg-green-500/10 text-green-500", COMMODITY: "bg-amber-500/10 text-amber-500",
};

// Add a symbol to a chosen category. The market type is locked to the category's
// type once it holds items (so a list never mixes types); for an empty category
// you pick the type and the first add sets it.
export default function WatchlistAddBar({ watchlists, activeId, book, onAdd, onSelectCategory }: WatchlistAddBarProps) {
    const [catId, setCatId] = useState<string | null>(activeId);
    const [pickType, setPickType] = useState<AssetType>("PSX");
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setCatId(prev => prev ?? activeId); }, [activeId]);

    const targetId = catId ?? activeId;
    const targetWl = watchlists.find(w => w._id === targetId);
    const locked = (targetWl?.symbols?.length || 0) > 0;   // type is fixed once it has items
    const lockedType = (targetWl?.type || "PSX") as AssetType;
    const effectiveType: AssetType = locked ? lockedType : pickType;

    // When switching category, adopt its type as the starting pick.
    useEffect(() => {
        if (targetWl) setPickType((targetWl.type || "PSX") as AssetType);
    }, [targetId]); // eslint-disable-line react-hooks/exhaustive-deps

    const existing = useMemo(
        () => new Set((targetWl?.symbols || []).map((s: string) => s.toUpperCase())),
        [targetWl]
    );

    // Symbols available for the effective type, from the live multi-asset book.
    const universe = useMemo(() => {
        const prefix = `${effectiveType}:`;
        return Object.keys(book.map)
            .filter(k => k.startsWith(prefix))
            .map(k => ({ symbol: k.slice(prefix.length), name: book.map[k].name }))
            .sort((a, b) => a.symbol.localeCompare(b.symbol));
    }, [book, effectiveType]);

    const filtered = useMemo(() => {
        const q = query.trim().toUpperCase();
        const base = q ? universe.filter(s => s.symbol.toUpperCase().includes(q) || (s.name || "").toUpperCase().includes(q)) : universe;
        const ranked = q
            ? [...base].sort((a, b) => (a.symbol.toUpperCase().startsWith(q) ? 0 : 1) - (b.symbol.toUpperCase().startsWith(q) ? 0 : 1) || a.symbol.localeCompare(b.symbol))
            : base;
        return ranked.slice(0, 50);
    }, [universe, query]);

    useEffect(() => { setActive(0); }, [query, effectiveType]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const add = (symbol?: string) => {
        const sym = (symbol ?? query).trim().toUpperCase();
        const id = targetId;
        if (!sym || !id) return;
        onAdd(id, sym, effectiveType);
        if (id !== activeId) onSelectCategory(id);
        setQuery("");
        setOpen(false);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") { setOpen(false); return; }
        if (!open && e.key === "ArrowDown") { setOpen(true); return; }
        if (open && filtered.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); return; }
            if (e.key === "Enter") { e.preventDefault(); add(filtered[active]?.symbol ?? query); return; }
        } else if (e.key === "Enter") { add(); }
    };

    const ctrl = "px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-black text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 shrink-0";

    return (
        <div className="card p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-3">
                <FolderPlus className="w-4 h-4 text-blue-500 shrink-0" strokeWidth={2} />
                <h2 className="text-sm font-black uppercase tracking-tighter italic text-zinc-900 dark:text-white">Add to Watchlist</h2>
                <p className="hidden md:block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Pick category · market type · lands as a card below</p>
            </div>

            <div className="flex flex-wrap items-stretch gap-2">
                {/* Target category */}
                <select value={targetId ?? ""} onChange={e => setCatId(e.target.value)} className={ctrl} title="Add to which watchlist">
                    {watchlists.map(wl => (
                        <option key={wl._id} value={wl._id}>{wl.name} ({wl.symbols?.length || 0})</option>
                    ))}
                </select>

                {/* Market type — locked once the category has items */}
                {locked ? (
                    <span className={`${ctrl} flex items-center gap-1.5 cursor-not-allowed`} title={`This list only holds ${TYPE_LABEL[lockedType]}`}>
                        <Lock className="w-3 h-3 text-zinc-400" strokeWidth={2.5} />
                        <span className="text-xs">{TYPE_LABEL[lockedType]}</span>
                    </span>
                ) : (
                    <select value={pickType} onChange={e => { setPickType(e.target.value as AssetType); setQuery(""); }} className={ctrl} title="Market type for this category">
                        {ASSET_TYPES.map(a => <option key={a.value} value={a.value}>{TYPE_LABEL[a.value]}</option>)}
                    </select>
                )}

                {/* Symbol autocomplete (scoped to the effective type) */}
                <div ref={boxRef} className="relative flex-1 min-w-0 basis-[12rem]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" strokeWidth={2.5} />
                    <input
                        value={query}
                        onChange={e => { setQuery(e.target.value.toUpperCase()); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={onKeyDown}
                        placeholder={`Search ${TYPE_LABEL[effectiveType]}…`}
                        autoComplete="off"
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-900 dark:text-white placeholder-zinc-400 outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    {open && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-[60] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl shadow-black/10 dark:shadow-black/50">
                            {filtered.length === 0 ? (
                                <div className="px-3 py-3 text-center">
                                    <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">
                                        {query.trim() ? `No match — press Enter to add “${query.trim()}”` : `No ${TYPE_LABEL[effectiveType]} symbols loaded yet`}
                                    </p>
                                </div>
                            ) : (
                                <div className="max-h-64 overflow-y-auto overscroll-contain custom-scrollbar py-1">
                                    {filtered.map((s, i) => {
                                        const already = existing.has(s.symbol.toUpperCase());
                                        return (
                                            <button
                                                key={s.symbol}
                                                onMouseDown={e => e.preventDefault()}
                                                onMouseEnter={() => setActive(i)}
                                                onClick={() => add(s.symbol)}
                                                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${i === active ? "bg-blue-50 dark:bg-blue-900/25" : "hover:bg-zinc-50 dark:hover:bg-white/[0.03]"}`}
                                            >
                                                <span className="flex items-center gap-2 min-w-0">
                                                    <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 ${TYPE_BADGE[effectiveType]}`}>{effectiveType}</span>
                                                    <span className="text-xs font-black tracking-tight text-zinc-900 dark:text-white shrink-0">{s.symbol}</span>
                                                    {s.name && s.name !== s.symbol && <span className="text-[11px] text-zinc-400 font-bold truncate">{s.name}</span>}
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

                <button onClick={() => add()} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-1 shrink-0"><Plus className="w-3.5 h-3.5" strokeWidth={3} />Add</button>
            </div>
        </div>
    );
}
