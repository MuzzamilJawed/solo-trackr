"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface SymbolOption { symbol: string; name?: string }

interface Props {
    value: string;
    onChange: (symbol: string) => void;
    options: SymbolOption[];
    placeholder?: string;
    className?: string;
    ariaLabel?: string;
}

const MAX = 8;

// Rank: exact symbol > symbol starts with > a name word starts with > symbol contains > name contains.
function rank(o: SymbolOption, q: string): number {
    const sym = o.symbol.toLowerCase();
    const name = (o.name || "").toLowerCase();
    if (sym === q) return 0;
    if (sym.startsWith(q)) return 1;
    if (name.split(/[^a-z0-9]+/).some(w => w.startsWith(q)) || name.startsWith(q)) return 2;
    if (sym.includes(q)) return 3;
    if (name.includes(q)) return 4;
    return -1;
}

// Type a symbol OR part of the company name ("pak petro") and pick from the
// matches. Searches EVERY option — unlike a native <datalist> over a truncated
// list — and still lets you enter a symbol that isn't listed.
export default function SymbolPicker({ value, onChange, options, placeholder, className = "", ariaLabel = "Symbol" }: Props) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const listId = useId();
    const wrapRef = useRef<HTMLDivElement>(null);

    const matches = useMemo(() => {
        const q = value.trim().toLowerCase();
        if (!q) return options.slice(0, MAX);
        return options
            .map(o => ({ o, r: rank(o, q) }))
            .filter(x => x.r >= 0)
            .sort((a, b) => a.r - b.r || a.o.symbol.length - b.o.symbol.length || a.o.symbol.localeCompare(b.o.symbol))
            .slice(0, MAX)
            .map(x => x.o);
    }, [value, options]);

    useEffect(() => {
        const onDoc = (e: MouseEvent | TouchEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("touchstart", onDoc);
        return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("touchstart", onDoc); };
    }, []);

    const pick = (s: string) => { onChange(s); setOpen(false); };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(matches.length - 1, a + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
        else if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); pick(matches[active].symbol); }
        else if (e.key === "Escape") setOpen(false);
    };

    return (
        <div ref={wrapRef} className="relative">
            <input
                value={value}
                onChange={e => { onChange(e.target.value.toUpperCase()); setActive(0); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKeyDown}
                role="combobox"
                aria-expanded={open && matches.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
                aria-label={ariaLabel}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={placeholder}
                className={className}
            />
            {open && (
                <ul id={listId} role="listbox" className="absolute left-0 right-0 z-40 mt-1.5 max-h-72 overflow-auto rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-xl">
                    {matches.length === 0 ? (
                        <li className="px-4 py-3 text-xs text-zinc-500">No listed match. You can still use &ldquo;{value.trim()}&rdquo; as the symbol.</li>
                    ) : matches.map((o, i) => (
                        <li key={o.symbol} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                            <button
                                type="button"
                                // onMouseDown so the pick lands before the input blurs
                                onMouseDown={e => { e.preventDefault(); pick(o.symbol); }}
                                onClick={() => pick(o.symbol)}
                                onMouseEnter={() => setActive(i)}
                                className={`w-full min-h-11 px-4 py-2 flex items-baseline gap-3 text-left ${i === active ? "bg-blue-500/10" : ""}`}
                            >
                                <span className="font-black text-sm text-zinc-900 dark:text-white shrink-0">{o.symbol}</span>
                                {o.name && <span className="text-xs text-zinc-500 truncate">{o.name}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
