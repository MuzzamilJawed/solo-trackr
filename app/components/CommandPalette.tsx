"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Fuel, BarChart3, Gem, ArrowRightLeft } from "lucide-react";
import { useBackHandler } from "../lib/backStack";

export default function CommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [stocks, setStocks] = useState<any[]>([]);
    const [filteredResults, setFilteredResults] = useState<any[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    // Android Back closes it; "open-search" lets touch UI (no Ctrl+K) open it.
    useBackHandler(isOpen, () => setIsOpen(false));
    useEffect(() => {
        const open = () => setIsOpen(true);
        window.addEventListener("open-search", open);
        return () => window.removeEventListener("open-search", open);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === "Escape") setIsOpen(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    useEffect(() => {
        if (isOpen) {
            inputRef.current?.focus();
            fetchStocks();
        } else {
            setQuery("");
            setFilteredResults([]);
        }
    }, [isOpen]);

    const fetchStocks = async () => {
        try {
            const res = await fetch('/api/psx-stocks');
            const json = await res.json();
            if (json.success) setStocks(json.data);
        } catch (err) {
            console.error('Failed to load stocks for search', err);
        }
    };

    useEffect(() => {
        if (query.trim() === "") {
            setFilteredResults([]);
            return;
        }
        const filtered = stocks
            .filter(s => 
                s.symbol.toLowerCase().includes(query.toLowerCase()) || 
                s.name.toLowerCase().includes(query.toLowerCase())
            )
            .slice(0, 8);
        setFilteredResults(filtered);
        setSelectedIndex(0);
    }, [query, stocks]);

    const handleSelect = (symbol: string) => {
        setIsOpen(false);
        router.push(`/stocks/${symbol.toLowerCase()}`);
    };

    // Keep Tab inside the dialog while it is open.
    const trapTab = (e: React.KeyboardEvent) => {
        if (e.key !== "Tab" || !dialogRef.current) return;
        const items = dialogRef.current.querySelectorAll<HTMLElement>("input, button");
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            if (filteredResults.length === 0) return;
            setSelectedIndex(prev => (prev + 1) % filteredResults.length);
        } else if (e.key === "ArrowUp") {
            if (filteredResults.length === 0) return;
            setSelectedIndex(prev => (prev - 1 + filteredResults.length) % filteredResults.length);
        } else if (e.key === "Enter" && filteredResults[selectedIndex]) {
            handleSelect(filteredResults[selectedIndex].symbol);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)}></div>
            
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label="Search"
                onKeyDown={trapTab}
                className="card relative w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            >
                <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-8 py-4 sm:py-6 border-b border-zinc-100 dark:border-white/5">
                    <Search className="w-5 h-5 shrink-0 text-zinc-400" strokeWidth={2} />
                    <input
                        ref={inputRef}
                        type="text"
                        role="combobox"
                        aria-label="Search scrips"
                        aria-expanded={filteredResults.length > 0}
                        aria-controls="palette-list"
                        aria-autocomplete="list"
                        aria-activedescendant={filteredResults.length > 0 ? `palette-opt-${selectedIndex}` : undefined}
                        enterKeyHint="search"
                        placeholder="Search Scrips, Sectors, or Commodities... (e.g. HUBC, Oil)"
                        className="flex-1 min-w-0 bg-transparent border-none outline-none text-base sm:text-lg font-black uppercase italic tracking-tighter text-zinc-900 dark:text-white placeholder:text-zinc-400"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onKeyDown}
                    />
                    <div className="px-2 py-1 bg-zinc-100 dark:bg-white/5 rounded-md text-[10px] font-black uppercase tracking-widest text-zinc-500">ESC</div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-4 scroller-thin">
                    {filteredResults.length > 0 ? (
                        <div id="palette-list" role="listbox" aria-label="Search results" className="space-y-1">
                            {filteredResults.map((stock, i) => (
                                <button
                                    key={stock.symbol}
                                    id={`palette-opt-${i}`}
                                    role="option"
                                    aria-selected={i === selectedIndex}
                                    tabIndex={-1}
                                    onClick={() => handleSelect(stock.symbol)}
                                    className={`w-full flex items-center justify-between gap-3 p-3 sm:p-6 rounded-2xl sm:rounded-3xl transition-all text-left ${
                                        i === selectedIndex ? "bg-blue-600 text-white scale-[1.02] shadow-xl shadow-blue-600/20" : "hover:bg-zinc-50 dark:hover:bg-white/5"
                                    }`}
                                >
                                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black shrink-0 ${i === selectedIndex ? "bg-white/20" : "bg-zinc-100 dark:bg-white/5 text-blue-500"}`}>
                                            {stock.symbol[0]}
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`font-black uppercase italic tracking-tighter truncate ${i === selectedIndex ? "text-white" : "text-zinc-900 dark:text-white"}`}>
                                                {stock.symbol}
                                            </p>
                                            <p className={`text-[11px] font-bold uppercase tracking-widest truncate ${i === selectedIndex ? "text-blue-100" : "text-zinc-500"}`}>
                                                {stock.name}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end shrink-0">
                                        <p className={`font-mono font-black tabular-nums ${i === selectedIndex ? "text-white" : "text-zinc-900 dark:text-white"}`}>
                                            Rs.{(stock.currentPrice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                        <p className={`text-[11px] font-black ${stock.change >= 0 ? (i === selectedIndex ? 'text-green-200' : 'text-green-500') : (i === selectedIndex ? 'text-red-200' : 'text-red-500')}`}>
                                            {stock.change >= 0 ? '▲' : '▼'}{Math.abs(stock.changePercent)}%
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : query.trim() !== "" ? (
                        <div className="p-12 text-center" role="status">
                            <p className="text-zinc-500 font-black uppercase tracking-widest text-xs italic">No footprint found for "{query}"</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4 p-4">
                            {[
                                { label: "Oil & Energy", path: "/oil", icon: Fuel },
                                { label: "PSX Terminal", path: "/stocks/terminal", icon: BarChart3 },
                                { label: "Precious Metals", path: "/metals", icon: Gem },
                                { label: "Global Forex", path: "/forex", icon: ArrowRightLeft }
                            ].map(quick => (
                                <button
                                    key={quick.path}
                                    onClick={() => { setIsOpen(false); router.push(quick.path); }}
                                    className="card-inset p-8 hover:border-blue-500/50 transition-all text-left group"
                                >
                                    <quick.icon className="w-7 h-7 mb-4 text-blue-500 group-hover:text-blue-400 transition-colors" strokeWidth={2} />
                                    <p className="font-black uppercase italic tracking-tighter text-zinc-900 dark:text-white group-hover:text-blue-500 transition-colors">{quick.label}</p>
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Jump to sector</p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="px-8 py-4 bg-zinc-50 dark:bg-app-dark/40 border-t border-zinc-100 dark:border-white/5 flex items-center justify-between">
                    <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                            <kbd className="px-2 py-1 bg-zinc-200 dark:bg-white/10 rounded text-[11px] font-black text-zinc-500">ENTER</kbd>
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Select</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <kbd className="px-2 py-1 bg-zinc-200 dark:bg-white/10 rounded text-[11px] font-black text-zinc-500">↑↓</kbd>
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Navigate</span>
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">SoloTrackr v1.0</p>
                </div>
            </div>
        </div>
    );
}
