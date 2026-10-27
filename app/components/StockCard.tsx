import { useState, useEffect, useCallback } from "react";
import { Target, Volume2, StickyNote, Plus, X, Check, Loader2 } from "lucide-react";
import { computeSignals, dayRangePosition, toneClasses } from "../lib/stockSignals";
import { getTarget, setTarget, getNote, setNote, type StockNote } from "../lib/stockPrefs";
import { useToast } from "../context/ToastContext";
import FitText from "./FitText";

interface StockCardProps {
    symbol: string;
    name: string;
    currentPrice: number;
    change: number;
    changePercent: number;
    open: number;
    high: number;
    low: number;
    volume: string;
    /** Last Day Closing Price — the basis for today's change and the open gap. */
    ldcp?: number | null;
    /** PSX sector, e.g. "CEMENT". Rendered as a badge when supplied. */
    sector?: string;
    targetPrice?: number;
    exchange?: string; // new prop to show exchange label (defaults to PSX)
    currencySymbol?: string;
    onClick?: () => void;
    watchlists?: any[];
    activeWatchlistId?: string | null;
    onAddToWatchlist?: (watchlistId: string, symbol: string) => void;
    onRemoveFromWatchlist?: (watchlistId: string, symbol: string) => void;
    onWatchlistCreated?: (watchlist: any) => void;
    // Daily-analysis extras
    isNew?: boolean; // "new since yesterday" leader
    selectable?: boolean; // compare mode
    selected?: boolean;
    onToggleSelect?: (symbol: string) => void;
    /**
     * Long browse lists (the PSX explorer) opt into a phone-only compact row:
     * symbol, name, price, change. The full card still renders from `sm` up, and
     * screens that show a single stock leave this off so their per-symbol actions
     * (target, watchlist, listen) stay one tap away.
     */
    compact?: boolean;
}

export default function StockCard({
    symbol,
    name,
    currentPrice,
    change,
    changePercent,
    open,
    high,
    low,
    volume,
    ldcp = null,
    sector,
    targetPrice,
    exchange = 'PSX',
    currencySymbol = 'Rs.',
    onClick,
    watchlists = [],
    onAddToWatchlist,
    onRemoveFromWatchlist,
    onWatchlistCreated,
    isNew = false,
    selectable = false,
    selected = false,
    onToggleSelect,
    compact = false,
}: StockCardProps) {
    const { success, error } = useToast();
    const isPositive = change >= 0;
    const [showWatchlistMenu, setShowWatchlistMenu] = useState(false);
    const [showMeta, setShowMeta] = useState(false);
    const [newWLName, setNewWLName] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [ttsLoading, setTtsLoading] = useState(false);

    // Per-symbol prefs (localStorage) — target + note/tag
    const [target, setTargetState] = useState<number | null>(null);
    const [note, setNoteState] = useState<StockNote | null>(null);
    const [targetInput, setTargetInput] = useState("");
    const [noteText, setNoteText] = useState("");
    const [tagText, setTagText] = useState("");

    const isPSX = (exchange || 'PSX').toUpperCase() === 'PSX';

    const loadPrefs = useCallback(() => {
        const t = getTarget(symbol);
        const n = getNote(symbol);
        setTargetState(t);
        setNoteState(n);
        setTargetInput(t != null ? String(t) : "");
        setNoteText(n?.text || "");
        setTagText(n?.tag || "");
    }, [symbol]);

    useEffect(() => {
        loadPrefs();
        const handler = () => loadPrefs();
        window.addEventListener("stockprefs", handler);
        return () => window.removeEventListener("stockprefs", handler);
    }, [loadPrefs]);

    const effectiveTarget = target ?? (targetPrice ?? null);
    const signals = isPSX ? computeSignals({ changePercent, currentPrice, open, high, low }, effectiveTarget) : [];
    const rangePos = dayRangePosition(low, high, currentPrice);
    // Whether the feed sent a session at all. PSX does; the NASDAQ feed sends no
    // OHLC, so those cards skip the range block entirely — consistently.
    const hasSession = (low ?? 0) > 0 && (high ?? 0) > 0 && high >= low;

    // ── Extra detail derived from the feed ──────────────────────────────────
    // All plain arithmetic on values we already have — nothing inferred.
    const volumeNum = parseFloat(String(volume).replace(/,/g, "")) || 0;
    // Turnover (value traded) — volume alone hides how much money actually moved.
    const turnover = volumeNum > 0 && currentPrice > 0 ? volumeNum * currentPrice : null;
    // Opening gap against the previous close: did it gap up or down at the bell?
    const gap = ldcp != null && ldcp > 0 && open > 0 ? open - ldcp : null;
    const gapPct = gap != null && ldcp ? (gap / ldcp) * 100 : null;
    // How far it has travelled today, as a share of the previous close.
    const rangePct = ldcp != null && ldcp > 0 && high > 0 && low > 0 ? ((high - low) / ldcp) * 100 : null;
    // Move since the open — separates the gap from the actual session trend.
    const sinceOpen = open > 0 && currentPrice > 0 ? currentPrice - open : null;

    // One decimal keeps turnover inside a half-width cell ("Rs.101.5M" not
    // "Rs.101.45M", which clipped on 4-up card grids).
    const compactNum = (v: number) =>
        new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
    // PSX and NASDAQ both quote to 2 decimals — keep the derived figures consistent.
    const dp = (v: number) => v.toFixed(2);

    // Only the figures this feed actually supplies. PSX sends previous close and
    // intraday OHLC; the NASDAQ feed sends neither, so its cards would otherwise
    // render a row of dashes where PSX shows real numbers.
    // const sessionDetail: { label: string; value: string; sub?: string | null; tone: string; title: string }[] = [
    //     ldcp != null && {
    //         label: "Prev",
    //         value: `${currencySymbol}${dp(ldcp)}`,
    //         tone: "text-zinc-700 dark:text-zinc-200",
    //         title: "Last Day Closing Price — today's change is measured from this",
    //     },
    //     gap != null && {
    //         label: "Gap",
    //         value: `${gap >= 0 ? "+" : "-"}${currencySymbol}${dp(Math.abs(gap))}`,
    //         sub: gapPct != null ? `${gapPct >= 0 ? "+" : ""}${gapPct.toFixed(2)}%` : null,
    //         tone: gap >= 0 ? "text-green-500" : "text-red-500",
    //         title: "How it opened against the previous close",
    //     },
    //     sinceOpen != null && {
    //         label: "Vs Open",
    //         value: `${sinceOpen >= 0 ? "+" : "-"}${currencySymbol}${dp(Math.abs(sinceOpen))}`,
    //         tone: sinceOpen >= 0 ? "text-green-500" : "text-red-500",
    //         title: "Move during the session, excluding the opening gap",
    //     },
    //     turnover != null && {
    //         label: "Traded",
    //         value: `${currencySymbol}${compactNum(turnover)}`,
    //         sub: rangePct != null ? `Range ${rangePct.toFixed(1)}%` : null,
    //         tone: "text-zinc-700 dark:text-zinc-200",
    //         title: "Approximate value traded today (volume × last price)",
    //     },
    // ].filter(Boolean) as { label: string; value: string; sub?: string | null; tone: string; title: string }[];

    const saveMeta = (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        const parsed = parseFloat(targetInput.replace(/,/g, ""));
        setTarget(symbol, Number.isFinite(parsed) && parsed > 0 ? parsed : null);
        setNote(symbol, { text: noteText, tag: tagText }, Date.now());
        loadPrefs();
        setShowMeta(false);
        success(`Target & note saved for ${symbol.toUpperCase()}`);
    };

    const handleCreateLocal = async (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        if (!newWLName.trim()) return;
        setIsCreating(true);
        try {
            const res = await fetch('/api/watchlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newWLName, symbols: [symbol.toUpperCase()] })
            });
            const json = await res.json();
            if (json.success) {
                onWatchlistCreated?.(json.data);
                success(`Watchlist "${newWLName.trim()}" created with ${symbol.toUpperCase()}`);
                setNewWLName("");
                setShowWatchlistMenu(false);
            } else {
                error(json.error || "Couldn't create watchlist");
            }
        } catch (err) {
            console.error(err);
            error("Network error — couldn't create watchlist");
        } finally {
            setIsCreating(false);
        }
    };

    // Phone list row: what a stock *is* and what it did today. Everything else
    // (volume, day range, target, watchlist, listen) lives on the detail screen.
    const compactRow = compact ? (
        <div
            onClick={onClick}
            className={`card sm:hidden flex flex-col gap-2 px-3 py-2.5 cursor-pointer active:bg-zinc-50 dark:active:bg-zinc-800/60 transition-colors ${selected ? 'border-blue-500 ring-2 ring-blue-500/30' : ''}`}
        >
            <div className="flex items-center gap-3 min-h-[44px]">
                {selectable && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(symbol); }}
                        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black transition-all ${selected ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-zinc-200 dark:border-zinc-700'}`}
                        title={selected ? 'Remove from compare' : 'Add to compare'}
                    >
                        {selected ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Plus className="w-3.5 h-3.5" strokeWidth={3} />}
                    </button>
                )}
                <div className="min-w-0 flex-1">
                    {/* Symbol and name on same row, sector below */}
                    <div className="flex items-baseline gap-1.5 min-w-0 flex-wrap mb-1">
                        <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-50 tracking-tighter shrink-0">{symbol}</h4>
                        {isNew && (
                            <span className="text-[8px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1 py-0.5 rounded uppercase tracking-widest shrink-0">New</span>
                        )}
                        <p className="min-w-0 text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-tight truncate flex-1">{name}</p>
                    </div>
                    {sector && (
                        <div>
                            <span className="inline-block text-[8px] text-zinc-400 dark:text-zinc-500 font-black uppercase tracking-widest truncate" title={`Sector · ${sector}`}>
                                {sector}
                            </span>
                        </div>
                    )}
                </div>
                <div className="shrink-0 text-right max-w-[42%]">
                    <FitText className="text-sm font-black text-zinc-900 dark:text-zinc-50 font-mono tabular-nums leading-none">
                        <span className="text-[10px] font-normal mr-0.5">{currencySymbol}</span>
                        {currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </FitText>
                    <p className={`text-[11px] font-black tabular-nums mt-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isPositive ? '▲' : '▼'}{Math.abs(changePercent).toFixed(1)}%
                    </p>
                </div>
            </div>

            {/* Session detail — the phone list used to stop at price + change, so
                the range, liquidity and gap were only reachable by opening the
                stock. Four terse columns fit even at 320px. */}
            <div className="pt-2 border-t border-zinc-100 dark:border-white/5 grid grid-cols-5 gap-2">
                {[
                    { label: "Low", value: low > 0 ? dp(low) : "—", tone: "" },
                    { label: "Open", value: open > 0 ? dp(open) : "—", tone: "" },
                    { label: "High", value: high > 0 ? dp(high) : "—", tone: "" },
                    { label: "Vol", value: volumeNum > 0 ? compactNum(volumeNum) : "—", tone: "" },
                    {
                        label: "Gap",
                        value: gapPct != null ? `${gapPct >= 0 ? "+" : ""}${gapPct.toFixed(1)}%` : "—",
                        tone: gapPct == null ? "" : gapPct >= 0 ? "text-green-600" : "text-red-600",
                    },
                ].map(d => (
                    <div key={d.label} className="min-w-0">
                        <p className="text-[8px] font-black text-zinc-400 uppercase tracking-wider leading-none truncate">{d.label}</p>
                        <FitText className={`text-[11px] font-black font-mono tabular-nums leading-tight ${d.tone}`}>{d.value}</FitText>
                    </div>
                ))}
            </div>

            {/* Where the last price sits between the day's low and high. */}
            {rangePos != null && (
                <div className="relative h-1 rounded-full bg-gradient-to-r from-red-500/30 via-zinc-300 dark:via-zinc-700 to-green-500/30">
                    <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-600 border-2 border-white dark:border-zinc-900"
                        style={{ left: `${rangePos}%` }}
                    />
                </div>
            )}
        </div>
    ) : null;

    return (
        <>
            {compactRow}
            <div
                onClick={onClick}
                className={`card ${compact ? 'hidden sm:flex' : 'flex'} hover:shadow-md transition-all p-3 sm:p-4 flex-col h-full cursor-pointer group/card ${selected ? 'border-blue-500 ring-2 ring-blue-500/30' : ''}`}
            >
                {/* Compare selection checkbox */}
                {selectable && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(symbol); }}
                        className={`absolute -top-2 -left-2 z-20 w-6 h-6 rounded-full flex items-center justify-center shadow-lg transition-all ${selected ? 'bg-blue-600 text-white scale-110' : 'bg-white dark:bg-zinc-800 text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500'}`}
                        title={selected ? 'Remove from compare' : 'Add to compare'}
                    >
                        {selected
                            ? <Check className="w-3.5 h-3.5" strokeWidth={3} />
                            : <Plus className="w-3.5 h-3.5" strokeWidth={3} />}
                    </button>
                )}

                {/* One row, never two. This used to wrap, which dropped the actions
                    and the change onto their own line under the sector badge on any
                    card narrow enough — so the identity block gets whatever width is
                    left and truncates, rather than pushing the actions down. */}
                <div className="flex flex-nowrap justify-between items-start gap-x-2 mb-2 sm:mb-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 flex-wrap">
                            <h4 className="text-sm sm:text-lg font-black text-zinc-900 dark:text-zinc-50 tracking-tighter shrink-0">
                                {symbol}
                            </h4>
                            {/* Mobile only: name inline with symbol */}
                            <p className="sm:hidden text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-tighter truncate flex-1">
                                {name}
                            </p>
                            {/* <span className="text-[9px] sm:text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0">
                            {exchange || 'PSX'}
                        </span> */}
                            {isNew && (
                                <span className="text-[8px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0" title="New leader vs previous session">NEW</span>
                            )}
                        </div>
                        {/* Desktop only: full name on separate line. These two slots keep a fixed height whether or not they are
                            filled. A one-line name next to a two-line one, or a missing
                            sector, otherwise shifts everything below it and the cards in
                            a row stop lining up with each other. */}
                        <p className="hidden sm:block text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-tighter line-clamp-1 sm:line-clamp-2 leading-tight min-h-[1.25em] sm:min-h-[2.5em]" title={name}>
                            {name}
                        </p>
                        <div className="mt-1 min-h-[1.0625rem] sm:mt-1 w-full sm:w-auto">
                            {sector && (
                                <span className="inline-block max-w-full text-[8px] font-black bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded uppercase tracking-widest truncate" title={`Sector · ${sector}`}>
                                    {sector}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className={`flex flex-col items-end relative shrink-0`}>
                        <div className="flex items-center gap-1 sm:gap-1.5 mb-1">
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowMeta(!showMeta); setShowWatchlistMenu(false); }}
                                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 ${showMeta || target || note ? 'bg-blue-600 text-white shadow-lg' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                                title="Set target / note"
                            >
                                <Target className="w-3.5 h-3.5" strokeWidth={2} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowWatchlistMenu(!showWatchlistMenu); setShowMeta(false); }}
                                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 ${showWatchlistMenu ? 'bg-blue-600 text-white shadow-lg' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                                title="Add to Watchlist"
                            >
                                {/* A lucide glyph, not a text "+" — a character sits on
                                    the font's baseline and at its own optical weight, so
                                    it never lined up with the drawn icons either side. */}
                                {showWatchlistMenu
                                    ? <X className="w-3.5 h-3.5" strokeWidth={2} />
                                    : <Plus className="w-3.5 h-3.5" strokeWidth={2} />}
                            </button>

                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (ttsLoading) return;
                                    setTtsLoading(true);
                                    try {
                                        const text = `${symbol} ${name} is trading at ${currentPrice} ${currencySymbol === '$' ? 'dollars' : 'rupees'}. Change ${change} (${changePercent} percent).`;
                                        const res = await fetch('/api/tts', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ text })
                                        });
                                        if (!res.ok) {
                                            let errMsg = `TTS request failed (${res.status})`;
                                            try {
                                                const j = await res.json();
                                                errMsg = j?.detail || j?.error || errMsg;
                                            } catch (e) {
                                                // ignore
                                            }
                                            // Surface the error to the user
                                            error(`Audio unavailable: ${errMsg}`);
                                            throw new Error(errMsg);
                                        }
                                        const ab = await res.arrayBuffer();
                                        const blob = new Blob([ab], { type: res.headers.get('content-type') || 'audio/mpeg' });
                                        const url = URL.createObjectURL(blob);
                                        const audio = new Audio(url);
                                        audio.play();
                                        audio.onended = () => { URL.revokeObjectURL(url); };
                                    } catch (err) {
                                        console.error('TTS play error', err);
                                    } finally {
                                        setTtsLoading(false);
                                    }
                                }}
                                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700`}
                                title="Listen"
                            >
                                {ttsLoading
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
                                    : <Volume2 className="w-3.5 h-3.5" strokeWidth={2} />}
                            </button>
                        </div>

                        {/* Percent and amount share the line under the actions. Sitting
                            the percent beside the three buttons made this column wide
                            enough to shove itself onto a row of its own. */}
                        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                            <span className={`text-[10px] sm:text-xs font-black ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                {isPositive ? '▲' : '▼'}{Math.abs(changePercent).toFixed(1)}%
                            </span>
                            <span className={`text-[9px] sm:text-[10px] font-bold ${isPositive ? 'text-green-600/70' : 'text-red-600/70'}`}>
                                {isPositive ? '+' : ''}{change?.toFixed(2)}
                            </span>
                        </div>

                        {/* Target / note editor */}
                        {showMeta && (
                            <div
                                className="card-float absolute right-0 top-8 w-[min(14rem,85vw)] z-50 p-3 space-y-2 animate-in fade-in slide-in-from-top-2"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Target Price ({currencySymbol})</p>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="e.g. 150"
                                    value={targetInput}
                                    onChange={(e) => setTargetInput(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full text-xs font-bold bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Tag</p>
                                <input
                                    type="text"
                                    placeholder="e.g. Breakout, Earnings"
                                    value={tagText}
                                    maxLength={20}
                                    onChange={(e) => setTagText(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full text-xs font-bold bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Note</p>
                                <textarea
                                    placeholder="Your thesis / reminder…"
                                    value={noteText}
                                    rows={2}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full text-xs font-medium bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                                />
                                <div className="flex gap-2 pt-1">
                                    <button onClick={saveMeta} className="flex-1 bg-blue-600 text-white text-[10px] font-black uppercase py-1.5 rounded-lg hover:bg-blue-700">Save</button>
                                    <button onClick={(e) => { e.stopPropagation(); setShowMeta(false); }} aria-label="Close stock notes" className="px-3 text-zinc-400 hover:text-zinc-600 text-xs"><X className="w-3.5 h-3.5" strokeWidth={2.5} /></button>
                                </div>
                            </div>
                        )}

                        {showWatchlistMenu && (
                            <div
                                className="card-float absolute right-0 top-8 w-[min(12rem,80vw)] z-50 py-2 animate-in fade-in slide-in-from-top-2"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <p className="px-3 py-1 text-[9px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 mb-1">Manage Watchlists</p>
                                {watchlists.length > 0 ? watchlists.map(wl => {
                                    const isInList = wl.symbols?.includes(symbol.toUpperCase());
                                    return (
                                        <button
                                            key={wl._id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (isInList) {
                                                    onRemoveFromWatchlist?.(wl._id, symbol);
                                                } else {
                                                    onAddToWatchlist?.(wl._id, symbol);
                                                }
                                                setShowWatchlistMenu(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-[11px] font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-between group/item"
                                        >
                                            <span className={isInList ? "text-blue-600 dark:text-blue-400" : "text-zinc-600 dark:text-zinc-300"}>
                                                {wl.name}
                                            </span>
                                            <span className={`text-[10px] ${isInList ? 'text-blue-600' : 'text-zinc-300 group-hover/item:text-blue-400'}`}>
                                                {isInList ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Plus className="w-3.5 h-3.5" strokeWidth={3} />}
                                            </span>
                                        </button>
                                    );
                                }) : (
                                    <div className="px-3 py-2 space-y-2">
                                        <p className="text-[10px] italic text-zinc-500 leading-tight">No watchlists found. Create your first list for <b>{symbol}</b>:</p>
                                        <div className="flex gap-1">
                                            <input
                                                type="text"
                                                placeholder="List name..."
                                                value={newWLName}
                                                onChange={(e) => setNewWLName(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                autoFocus
                                                className="flex-1 text-[10px] bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                                                onKeyDown={(e) => e.key === 'Enter' && handleCreateLocal(e)}
                                            />
                                            <button
                                                onClick={handleCreateLocal}
                                                disabled={isCreating}
                                                className="bg-blue-600 text-white p-1 rounded hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                {isCreating ? "..." : "→"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {watchlists.length > 0 && (
                                    <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1 px-3">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowWatchlistMenu(false); window.location.href = '/stocks'; }}
                                            className="text-[9px] font-black text-blue-600 uppercase hover:underline"
                                        >
                                            + Create New Watchlist
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Signal badges + user tag. The row is always here, empty or not:
                    a card that happens to have no signal must not pull its price
                    block a badge-height higher than its neighbours'. */}
                <div className="flex flex-wrap items-center gap-1 mb-2 min-h-[1.0625rem]">
                    {note?.tag && (
                        <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" title={note.text || note.tag}>
                            <StickyNote className="w-2.5 h-2.5" strokeWidth={2} /> {note.tag}
                        </span>
                    )}
                    {signals.slice(0, 2).map(sig => (
                        <span key={sig.key} title={sig.title} className={`inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded border ${toneClasses(sig.tone)}`}>
                            <sig.icon className="w-2.5 h-2.5" strokeWidth={2.5} /> {sig.label}
                        </span>
                    ))}
                </div>

                {/* Price, range and session detail move as one block pinned to the
                    bottom of the card. Pinning only the price row left the optional
                    blocks below it deciding how high the price sat, which is what
                    knocked the grid out of alignment row to row. */}
                <div className="mt-0">
                    <div className="pt-2 sm:pt-3 flex items-end justify-between gap-2 border-t border-zinc-100 dark:border-zinc-800">
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Price</p>
                            <FitText className="text-sm sm:text-xl font-black text-zinc-900 dark:text-zinc-50 font-mono tabular-nums leading-none">
                                <span className="text-[10px] sm:text-xs font-normal mr-0.5">{currencySymbol}</span>
                                {currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </FitText>
                            {effectiveTarget != null && (
                                <p className="text-[9px] font-bold text-blue-500 mt-0.5 truncate inline-flex items-center gap-0.5" title="Your target"><Target className="w-2.5 h-2.5 shrink-0" strokeWidth={2} /> {effectiveTarget.toLocaleString()}</p>
                            )}
                        </div>
                        <div className="text-right min-w-0">
                            <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest mb-0.5">Vol</p>
                            <p className="text-[10px] sm:text-xs font-bold text-zinc-600 dark:text-zinc-300 font-mono leading-none truncate">{volume}</p>
                        </div>
                    </div>

                    {/* Day range position bar — carries Low/High so a separate O/H/L
                        grid is redundant. Drawn whenever the feed sends a session,
                        even when high equals low: a stock locked at its circuit has
                        no position to mark, but dropping the whole block would make
                        its card sit a bar's height out of step with its neighbours. */}
                    {hasSession && (
                        <div className="mt-2.5">
                            <div className="flex items-center justify-between text-[8px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                                <span>L {low?.toFixed(1)}</span>
                                <span className="text-zinc-500">O {open?.toFixed(1)}</span>
                                <span>H {high?.toFixed(1)}</span>
                            </div>
                            <div className={`relative h-1.5 rounded-full ${rangePos != null ? 'bg-gradient-to-r from-red-500/30 via-zinc-300 dark:via-zinc-700 to-green-500/30' : 'bg-zinc-200 dark:bg-zinc-800'}`}>
                                <div
                                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900 shadow ${rangePos != null ? 'bg-blue-600' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                                    style={{ left: `${rangePos ?? 50}%` }}
                                    title={rangePos != null
                                        ? `${rangePos.toFixed(0)}% of today's range`
                                        : "No range today — it traded at a single price"}
                                ></div>
                            </div>
                        </div>
                    )}

                    {/* Session detail — previous close, the opening gap, the move
                    since the open, and turnover. Two rows of four keep it inside
                    the card at every width instead of stretching it. */}
                    {/* {sessionDetail.length > 0 && (
                        <div className="mt-2.5 pt-2.5 border-t border-zinc-100 dark:border-white/5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                            {sessionDetail.map(d => (
                                <div key={d.label} className="min-w-0" title={d.title}>
                                    <p className="text-[8px] font-black text-zinc-400 uppercase tracking-wider leading-none truncate">{d.label}</p>
                                  
                                    <FitText className={`text-[11px] font-black font-mono tabular-nums leading-tight ${d.tone}`}>
                                        {d.value}
                                    </FitText>
                                    {d.sub && <p className="text-[8px] font-bold text-zinc-400 tabular-nums truncate leading-none">{d.sub}</p>}
                                </div>
                            ))}
                        </div>
                    )} */}
                </div>
            </div>
        </>
    );
}
