"use client";

import { CandlestickChart, Gauge, LayoutGrid, Table, Grid3x3, Search, SearchX, Folder, Scale, Download, RotateCcw, X, SlidersHorizontal, ChevronDown } from "lucide-react";

import StockCard from "../components/StockCard";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from 'next/navigation';
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../context/ToastContext";
import dynamic from 'next/dynamic';
const TradingChart = dynamic(() => import('../components/TradingChart'), { ssr: false });
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import SectorHeatmap from "../components/SectorHeatmap";
import CompareTray from "../components/CompareTray";
import PageSkeleton from "../components/PageSkeleton";
import { usePullRefresh } from "../lib/pullRefresh";
import LoadErrorBanner from "../components/LoadErrorBanner";
import FitText from "../components/FitText";
import { dayRangePosition, parseVolume } from "../lib/stockSignals";
import { rollLeaders } from "../lib/stockPrefs";

const ANALYSIS_OPEN_KEY = "psx.analysis.open";

function abbreviateCount(raw?: string | number | null): string {
    if (raw == null) return "—";
    const value = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(value)) return String(raw);
    const absolute = Math.abs(value);
    if (absolute >= 1e12) return `${(value / 1e12).toFixed(1).replace(/\.0$/, "")}T`;
    if (absolute >= 1e9) return `${(value / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
    if (absolute >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
    if (absolute >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
    return value.toLocaleString();
}

export default function StocksPage() {
    return (
        <Suspense fallback={<PageSkeleton variant="explorer" />}>
            <StocksContent />
        </Suspense>
    );
}

function StocksContent() {
    interface Stock {
        symbol: string;
        name: string;
        currentPrice: number;
        change: number;
        changePercent: number;
        open: number;
        high: number;
        low: number;
        volume: string;
        /** Last Day Closing Price — the feed sends it; the card shows prev close + open gap. */
        ldcp?: number | null;
        targetPrice?: number;
        sector?: string;
        history?: { time: string; price: number }[];
    }

    interface Index {
        name: string;
        value: number;
        change: number;
        changePercent: number;
    }

    const router = useRouter();
    const searchParams = useSearchParams();

    // Persisted states from URL
    const [filter, setFilter] = useState(searchParams.get('f') || "all");
    const [categoryFilter, setCategoryFilter] = useState<string>(searchParams.get('cat') || "all");
    const [indexFilter, setIndexFilter] = useState<string | null>(searchParams.get('idx') || "all");
    const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || "");
    const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(searchParams.get('w'));
    const [viewType, setViewType] = useState<'card' | 'table' | 'heatmap'>((searchParams.get('v') as any) || 'card');
    const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('p') || "1"));

    // Daily-analysis: compare mode + "new since yesterday"
    const [compareMode, setCompareMode] = useState(false);
    const [compareSymbols, setCompareSymbols] = useState<string[]>([]);
    const [newLeaders, setNewLeaders] = useState<Set<string>>(new Set());

    const [stocks, setStocks] = useState<Stock[]>([]);
    const [indices, setIndices] = useState<Index[]>([]);
    const [marketStats, setMarketStats] = useState<any>(null);
    const [sectors, setSectors] = useState<string[]>([]);
    const [filteredStocks, setFilteredStocks] = useState<Stock[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState<Index | null>(null);
    const [indexMenuOpen, setIndexMenuOpen] = useState(false);
    const [indexDayRange, setIndexDayRange] = useState<{ high: number | null; low: number | null }>({ high: null, low: null });
    const [sortConfig, setSortConfig] = useState<{ key: keyof Stock; direction: 'asc' | 'desc' } | null>(null);
    const [watchlists, setWatchlists] = useState<any[]>([]);
    const [newWatchlistName, setNewWatchlistName] = useState("");
    const [isCreatingWatchlist, setIsCreatingWatchlist] = useState(false);
    const itemsPerPage = 15;
    const [showFilters, setShowFilters] = useState(false); // mobile: collapse the filter panel
    // Market Analysis panel: collapsed keeps only the headline + active filters.
    const [analysisOpen, setAnalysisOpen] = useState(true);
    // Phones show the search as an icon that grows into a field on focus; desktop
    // always renders it full width.
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [searchFocused, setSearchFocused] = useState(false);
    const searchExpanded = searchFocused || searchTerm.trim().length > 0;
    // While it is open the view toggle keeps only its icons, so the field has room
    // to grow. Desktop always has space for the labels.
    const labelWhenSearching = searchExpanded ? "hidden sm:inline" : "";
    const PAGE_SIZE = 24; // infinite-scroll: how many rows/cards to reveal per step
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const activeIndex = selectedIndex ?? indices[0] ?? null;

    const { settings } = useSettings();
    const { success, error } = useToast();

    // The auto-refresh interval holds a closure from the render that armed it, so
    // `indexFilter` would be read stale inside `load`. Mirror it in a ref.
    const indexFilterRef = useRef(indexFilter);
    useEffect(() => { indexFilterRef.current = indexFilter; }, [indexFilter]);

    const load = async (isManual = true) => {
        try {
            if (isManual) setLoading(true);
            const res = await fetch('/api/psx-stocks');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const rawData: Stock[] = json?.data || [];
            setLoadError(false);
            const rawIndices: Index[] = json?.indices || [];

            const stockData = rawData
                .filter(s => s && s.symbol)
                .map(s => ({
                    ...s,
                    history: []
                })).sort((a, b) => (a.symbol || "").localeCompare(b.symbol || ""));

            setStocks(stockData);
            setIndices(rawIndices);
            setMarketStats(json.stats);

            // "New since yesterday": leaders = top gainers ∪ most active. Compare
            // against the previous session's leaders (persisted client-side).
            const topGainers = [...stockData].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0)).slice(0, 20);
            const topActive = [...stockData].sort((a, b) => parseVolume(b.volume) - parseVolume(a.volume)).slice(0, 20);
            const leaderSyms = Array.from(new Set([...topGainers, ...topActive].map(s => s.symbol.toUpperCase())));
            const prev = rollLeaders(leaderSyms, Date.now());
            setNewLeaders(new Set(leaderSyms.filter(sym => !prev.has(sym))));

            if (rawIndices.length > 0) {
                if (!isManual) {
                    // Background refresh: never touch the user's choice. Only re-point
                    // the card at the same index so its numbers update — the card stays
                    // until they dismiss it themselves.
                    setSelectedIndex(prev => prev ? (rawIndices.find(idx => idx.name === prev.name) || prev) : prev);
                } else {
                    // Priority: 1. URL search param 2. Explicit "all" 3. First index from list
                    const urlIdxName = searchParams.get('idx') || indexFilterRef.current;

                    if (urlIdxName === 'all') {
                        setSelectedIndex(null);
                    } else {
                        const foundIdx = urlIdxName
                            ? rawIndices.find(idx => idx.name.toLowerCase() === urlIdxName.toLowerCase())
                            : null;

                        if (foundIdx) {
                            setSelectedIndex(foundIdx);
                        } else if (!searchParams.has('idx')) {
                            // Only force default if no param exists at all (first landing)
                            setSelectedIndex(rawIndices[0]);
                            setIndexFilter(rawIndices[0].name);
                        }
                    }
                }
            }

            const allSectorsArr = Array.from(new Set(stockData.map((s) => s.sector || 'Other'))).sort();
            setSectors(['All', ...allSectorsArr]);
        } catch (err) {
            console.error('Failed to load PSX stocks', err);
            setLoadError(true);
        } finally {
            if (isManual) setLoading(false);
        }
    };

    usePullRefresh(() => load(false));

    const fetchWatchlists = async () => {
        try {
            const res = await fetch('/api/watchlists');
            const json = await res.json();
            if (json.success) setWatchlists(json.data);
        } catch (err) {
            console.error('Failed to fetch watchlists', err);
        }
    };

    const handleCreateWatchlist = async () => {
        if (!newWatchlistName.trim()) return;
        try {
            const res = await fetch('/api/watchlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newWatchlistName, symbols: [] }),
            });
            const json = await res.json();
            if (json.success) {
                setWatchlists([json.data, ...watchlists]);
                success(`Watchlist "${newWatchlistName.trim()}" created`);
                setNewWatchlistName("");
                setIsCreatingWatchlist(false);
            } else {
                error(json.error || "Couldn't create watchlist");
            }
        } catch (err) {
            console.error('Failed to create watchlist', err);
            error("Network error — couldn't create watchlist");
        }
    };

    const handleAddToWatchlist = async (watchlistId: string, symbol: string) => {
        const watchlist = watchlists.find(wl => wl._id === watchlistId);
        if (!watchlist || !symbol) return;
        const currentSymbols = watchlist.symbols || [];
        if (currentSymbols.includes(symbol.toUpperCase())) return;
        const newSymbols = [...currentSymbols, symbol.toUpperCase()];
        try {
            const res = await fetch(`/api/watchlists/${watchlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbols: newSymbols }),
            });
            const json = await res.json();
            if (json.success) {
                setWatchlists(watchlists.map(wl => wl._id === watchlistId ? json.data : wl));
                success(`${symbol.toUpperCase()} added to "${watchlist.name}"`);
            } else {
                error(json.error || "Couldn't add symbol");
            }
        } catch (err) {
            console.error('Failed to add symbol to watchlist', err);
            error("Network error — couldn't add symbol");
        }
    };

    const handleRemoveFromWatchlist = async (watchlistId: string, symbol: string) => {
        const watchlist = watchlists.find(wl => wl._id === watchlistId);
        if (!watchlist || !symbol) return;
        const currentSymbols = watchlist.symbols || [];
        const newSymbols = currentSymbols.filter((s: string) => s !== symbol.toUpperCase());
        try {
            const res = await fetch(`/api/watchlists/${watchlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbols: newSymbols }),
            });
            const json = await res.json();
            if (json.success) {
                setWatchlists(watchlists.map(wl => wl._id === watchlistId ? json.data : wl));
                success(`${symbol.toUpperCase()} removed from "${watchlist.name}"`);
            } else {
                error(json.error || "Couldn't remove symbol");
            }
        } catch (err) {
            console.error('Failed to remove symbol from watchlist', err);
            error("Network error — couldn't remove symbol");
        }
    };

    useEffect(() => {
        load(true);
        fetchWatchlists();
    }, []);

    // Remember whether the Market Analysis panel was left open or collapsed.
    useEffect(() => {
        const saved = localStorage.getItem(ANALYSIS_OPEN_KEY);
        if (saved !== null) setAnalysisOpen(saved === '1');
    }, []);

    const toggleAnalysis = () => {
        setAnalysisOpen(v => {
            const next = !v;
            try { localStorage.setItem(ANALYSIS_OPEN_KEY, next ? '1' : '0'); } catch { /* private mode */ }
            return next;
        });
    };

    // Fetch the session (day) high/low for the visible index, including the
    // first index shown before the user changes the selector.
    useEffect(() => {
        if (!activeIndex) {
            setIndexDayRange({ high: null, low: null });
            return;
        }
        let cancelled = false;
        setIndexDayRange({ high: null, low: null });
        (async () => {
            try {
                const res = await fetch(`/api/psx-history?symbol=${encodeURIComponent(activeIndex.name)}&timeframe=1D`);
                const json = await res.json();
                if (cancelled) return;
                setIndexDayRange({
                    high: typeof json.dayHigh === 'number' ? json.dayHigh : null,
                    low: typeof json.dayLow === 'number' ? json.dayLow : null,
                });
            } catch {
                if (!cancelled) setIndexDayRange({ high: null, low: null });
            }
        })();
        return () => { cancelled = true; };
    }, [activeIndex?.name]);

    useEffect(() => {
        if (!settings.refreshInterval || settings.refreshInterval <= 0) return;
        const interval = setInterval(() => {
            load(false);
        }, settings.refreshInterval * 1000);
        return () => clearInterval(interval);
    }, [settings.refreshInterval]);

    const requestSort = (key: keyof Stock) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const toggleCompare = (symbol: string) => {
        const sym = symbol.toUpperCase();
        setCompareSymbols(prev => {
            if (prev.includes(sym)) return prev.filter(s => s !== sym);
            if (prev.length >= 4) return prev; // cap at 4
            return [...prev, sym];
        });
    };

    const compareStocks = compareSymbols
        .map(sym => stocks.find(s => s.symbol.toUpperCase() === sym))
        .filter(Boolean) as Stock[];

    // What's actually narrowing the list right now — surfaced as chips so the
    // collapsed panel still says what you're looking at.
    const VIEW_LABELS: Record<string, string> = {
        gainers: 'Top Performers', active: 'High Liquidity', losers: 'Market Decliners',
    };
    const activeFilters: string[] = [
        indexFilter && indexFilter !== 'all' ? indexFilter : null,
        filter !== 'all' ? filter : null,
        categoryFilter !== 'all' ? (VIEW_LABELS[categoryFilter] || categoryFilter) : null,
        activeWatchlistId ? (watchlists.find(w => w._id === activeWatchlistId)?.name || 'Watchlist') : null,
        searchTerm.trim() ? `"${searchTerm.trim()}"` : null,
        compareMode ? 'Compare On' : null,
    ].filter(Boolean) as string[];

    const exportCSV = () => {
        const rows = [
            ['Symbol', 'Name', 'Sector', 'Price', 'Change', 'Change%', 'Open', 'High', 'Low', 'Volume'],
            ...filteredStocks.map(s => [
                s.symbol,
                `"${(s.name || '').replace(/"/g, '""')}"`,
                `"${s.sector || ''}"`,
                s.currentPrice ?? '',
                s.change ?? '',
                (s.changePercent ?? 0).toFixed(2),
                s.open ?? '',
                s.high ?? '',
                s.low ?? '',
                `"${s.volume || ''}"`,
            ]),
        ];
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `psx-screen-${stamp}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        let updated = stocks;
        if (activeWatchlistId) {
            const activeWL = watchlists.find(wl => wl._id === activeWatchlistId);
            if (activeWL && activeWL.symbols) {
                updated = updated.filter(s => activeWL.symbols.includes(s.symbol.toUpperCase()));
            } else if (activeWL && activeWL.symbols.length === 0) {
                updated = [];
            }
        }
        if (indexFilter && indexFilter !== 'all') {
            const idxName = indexFilter.toUpperCase();
            if (idxName.includes('100')) {
                updated = [...updated].sort((a, b) => {
                    const valA = (a.currentPrice || 0) * (parseInt(a.volume.replace(/,/g, '')) || 0);
                    const valB = (b.currentPrice || 0) * (parseInt(b.volume.replace(/,/g, '')) || 0);
                    return valB - valA;
                }).slice(0, 100);
            } else if (idxName.includes('KMI')) {
                const shariahSectors = ['technology', 'cement', 'oil & gas', 'fertilizer', 'pharmaceuticals', 'chemical', 'power', 'engineering', 'food', 'textile', 'automobile', 'refinery'];
                updated = updated.filter(s => shariahSectors.some(target => (s.sector || '').toLowerCase().includes(target)) || s.symbol === 'MEBL');
                if (idxName.includes('30')) {
                    updated = [...updated].sort((a, b) => {
                        const valA = (a.currentPrice || 0) * (parseInt(a.volume.replace(/,/g, '')) || 0);
                        const valB = (b.currentPrice || 0) * (parseInt(b.volume.replace(/,/g, '')) || 0);
                        return valB - valA;
                    }).slice(0, 30);
                }
            }
        }
        if (filter !== 'all') {
            updated = updated.filter((s) => (s.sector || 'Other').toLowerCase() === filter.toLowerCase());
        }
        if (categoryFilter && categoryFilter !== 'all') {
            if (categoryFilter === 'gainers') updated = [...updated].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0)).slice(0, 50);
            else if (categoryFilter === 'losers') updated = [...updated].sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0)).slice(0, 50);
            else if (categoryFilter === 'active') updated = [...updated].sort((a, b) => (parseInt(b.volume.replace(/,/g, '')) || 0) - (parseInt(a.volume.replace(/,/g, '')) || 0)).slice(0, 50);
        }
        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            updated = updated.filter((s) => s.symbol.toLowerCase().includes(lowSearch) || s.name.toLowerCase().includes(lowSearch));
        }
        if (sortConfig) {
            updated = [...updated].sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                // `== null` covers both undefined and null (ldcp can be null).
                if (aVal == null || bVal == null) return 0;
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        setFilteredStocks(updated);
    }, [filter, stocks, searchTerm, sortConfig, indexFilter, activeWatchlistId, watchlists, categoryFilter]);

    // Handle initial page load and URL sync
    useEffect(() => {
        if (loading) return;

        const timer = setTimeout(() => {
            const params = new URLSearchParams();
            if (filter !== 'all') params.set('f', filter);
            if (categoryFilter !== 'all') params.set('cat', categoryFilter);
            if (indexFilter && indexFilter !== 'all') params.set('idx', indexFilter);
            else if (indexFilter === 'all') params.set('idx', 'all');
            if (searchTerm) params.set('q', searchTerm);
            if (activeWatchlistId) params.set('w', activeWatchlistId);
            if (viewType !== 'card') params.set('v', viewType);
            if (currentPage > 1) params.set('p', currentPage.toString());

            const queryString = params.toString();
            if (queryString !== searchParams.toString()) {
                router.replace(`/stocks?${queryString}`, { scroll: false });
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [filter, categoryFilter, indexFilter, searchTerm, activeWatchlistId, viewType, currentPage, loading, router, searchParams]);

    // Reset pagination when central filters change (but not when only page changes)
    useEffect(() => {
        setCurrentPage(1);
    }, [filter, categoryFilter, indexFilter, searchTerm, activeWatchlistId]);

    // Infinite scroll: reveal the first PAGE_SIZE, then grow as the sentinel scrolls
    // into view. Reset back to the first page whenever the result set changes.
    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [filter, categoryFilter, indexFilter, searchTerm, activeWatchlistId, sortConfig, viewType]);

    useEffect(() => {
        const el = loadMoreRef.current;
        if (!el) return;
        const io = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) {
                setVisibleCount((v) => Math.min(v + PAGE_SIZE, filteredStocks.length));
            }
        }, { rootMargin: "600px 0px" });
        io.observe(el);
        return () => io.disconnect();
    }, [filteredStocks.length, viewType, visibleCount]);

    // The heatmap toggle is desktop-only, so a shared ?v=heatmap link (or resizing
    // down) would otherwise strand a phone on a view it can't switch away from.
    useEffect(() => {
        if (viewType !== 'heatmap') return;
        const check = () => { if (window.innerWidth < 640) setViewType('card'); };
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, [viewType]);

    const paginatedStocks = filteredStocks.slice(0, visibleCount);

    // Percentage split behind the phone breadth bar. The feed's `total` is not
    // always the sum (it reports 0 on some sessions), so derive it.
    const breadthSplit = (() => {
        const adv = Number(marketStats?.advanced) || 0;
        const dec = Number(marketStats?.declined) || 0;
        const unch = Number(marketStats?.unchanged) || 0;
        const sum = adv + dec + unch;
        if (!sum) return { adv: 0, dec: 0, unch: 100 };
        return { adv: (adv / sum) * 100, dec: (dec / sum) * 100, unch: (unch / sum) * 100 };
    })();

    const SortIcon = ({ column }: { column: keyof Stock }) => {
        const isActive = sortConfig?.key === column;
        const isAsc = sortConfig?.direction === 'asc';
        return (
            <span className="inline-flex flex-col ml-2 -space-y-1.5 align-middle">
                <span className={`text-[7px] transition-colors ${isActive && isAsc ? 'text-blue-500' : 'text-zinc-300 dark:text-zinc-700'}`}>▲</span>
                <span className={`text-[7px] transition-colors ${isActive && !isAsc ? 'text-blue-500' : 'text-zinc-300 dark:text-zinc-700'}`}>▼</span>
            </span>
        );
    };

    if (loading && stocks.length === 0) return <PageSkeleton variant="explorer" />;

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white selection:bg-blue-500/30">
            {loading && (
                <div className="fixed top-[var(--sa-top)] left-0 w-full h-1 z-[100] bg-blue-600/10">
                    <div className="h-full bg-blue-600 animate-[loading_2s_infinite]"></div>
                </div>
            )}

            {/* Header + Market Pulse pin as one block. They used to stick separately
                with the strip offset by a hardcoded 65px, which never matched the real
                header height — leaving a slit that page content scrolled through. */}
            <div className="sticky top-0 z-40">
                <header className="safe-top bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
                    <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-6">
                        <div>
                            <h1 className="text-xl sm:text-3xl font-black tracking-tighter italic uppercase text-zinc-900 dark:text-white leading-none flex items-center gap-2.5">
                                <CandlestickChart className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400 shrink-0" strokeWidth={2} /> Market <span className="text-blue-500">Explorer</span>
                            </h1>
                            <p className="hidden sm:block text-zinc-500 text-[11px] font-black uppercase tracking-[0.2em] mt-1">Real-Time Terminal</p>
                        </div>
                    </div>
                </header>

                <div className="page-shell mx-auto w-full px-4 sm:px-8 lg:px-10 2xl:px-12">
                    <div className="card relative overflow-visible shadow-black/5 dark:shadow-black/20">
                        {indices.length > 0 && (
                            <div className="py-2.5 sm:py-3 bg-white dark:bg-app-dark">
                                <div className="px-3 sm:px-5 lg:px-7 flex items-center gap-2 sm:gap-5 lg:gap-8 2xl:gap-12">
                                    <div className="relative min-w-0 flex-1 flex items-baseline gap-2 sm:gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIndexMenuOpen(open => !open)}
                                            aria-label="Choose market index"
                                            aria-expanded={indexMenuOpen}
                                            title="Choose market index"
                                            className={`min-w-0 max-w-[55%] inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-left transition-colors ${indexMenuOpen ? "bg-blue-600/10 text-blue-600 dark:text-blue-400" : "text-zinc-900 dark:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-white/10"}`}
                                        >
                                            <span className="min-w-0 truncate text-[11px] sm:text-xs lg:text-sm 2xl:text-base font-black uppercase tracking-widest">{activeIndex?.name || "Index"}</span>
                                            <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${indexMenuOpen ? "rotate-180" : ""}`} strokeWidth={2.5} />
                                        </button>
                                        {activeIndex && (
                                            <span className="shrink-0 text-sm sm:text-base lg:text-lg 2xl:text-xl font-black font-mono text-zinc-900 dark:text-zinc-50">{activeIndex.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                        )}
                                        {indexMenuOpen && (
                                            <div className="absolute left-0 top-11 z-50 w-52 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-1.5 shadow-2xl">
                                                {indices.map(index => (
                                                    <button
                                                        key={index.name}
                                                        type="button"
                                                        onClick={() => { setSelectedIndex(index); setIndexFilter(index.name); setIndexMenuOpen(false); }}
                                                        className={`w-full min-h-10 flex items-center justify-between gap-2 rounded-lg px-2.5 text-left text-[10px] font-black uppercase tracking-widest transition-colors ${activeIndex?.name === index.name ? "bg-blue-600/10 text-blue-600 dark:text-blue-400" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"}`}
                                                    >
                                                        <span className="truncate">{index.name}</span>
                                                        <span className={`shrink-0 font-mono ${index.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                            {index.changePercent >= 0 ? "+" : "-"}{Math.abs(index.changePercent).toFixed(1)}%
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {activeIndex && (
                                        <div className="flex items-baseline gap-2 sm:gap-4 shrink-0">
                                            <span className={`text-[11px] sm:text-xs lg:text-sm 2xl:text-base font-black font-mono ${activeIndex.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {activeIndex.change >= 0 ? '+' : '-'}{Math.abs(activeIndex.change).toFixed(2)} ({activeIndex.changePercent >= 0 ? '+' : '-'}{Math.abs(activeIndex.changePercent).toFixed(2)}%)
                                            </span>
                                            <span className="hidden sm:inline text-[10px] sm:text-xs lg:text-sm 2xl:text-base font-black font-mono text-zinc-500 dark:text-zinc-400">
                                                H {indexDayRange.high != null ? indexDayRange.high.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}
                                                <span className="mx-1 text-zinc-300 dark:text-zinc-700">/</span>
                                                L {indexDayRange.low != null ? indexDayRange.low.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {marketStats && (
                            <div className="border-t border-zinc-200 dark:border-white/10 bg-zinc-50/80 dark:bg-zinc-900">
                                <div className="px-3 sm:px-5 lg:px-7">
                                    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-zinc-200 dark:divide-white/10">
                                        <div className="flex-1 py-3 sm:py-4 md:pr-8 flex items-center justify-between">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${marketStats?.status?.toLowerCase().includes('open') ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                                                    <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Exchange {marketStats?.status || '—'}</p>
                                                </div>
                                                {/* Phones get abbreviated figures — 25,369,263,260 is
                                        eleven digits of precision nobody reads on a list screen. */}
                                                <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
                                                    <div>
                                                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Volume</p>
                                                        <p className="text-sm font-black text-zinc-900 dark:text-zinc-50 font-mono tracking-tighter">
                                                            <span className="sm:hidden">{abbreviateCount(marketStats.volume)}</span>
                                                            <span className="hidden sm:inline">{marketStats.volume}</span>
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Value (PKR)</p>
                                                        <p className="text-sm font-black text-zinc-900 dark:text-zinc-50 font-mono tracking-tighter">
                                                            <span className="sm:hidden">{abbreviateCount(marketStats.value)}</span>
                                                            <span className="hidden sm:inline">{marketStats.value}</span>
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Trades</p>
                                                        <p className="text-sm font-black text-zinc-900 dark:text-zinc-50 font-mono tracking-tighter">
                                                            <span className="sm:hidden">{abbreviateCount(marketStats.trades)}</span>
                                                            <span className="hidden sm:inline">{marketStats.trades}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-1 py-3 sm:py-4 md:pl-8 flex items-center justify-between">
                                            <div className="space-y-1 w-full">
                                                <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-2">
                                                    {/* "Breadth" was jargon; the long explainer was worse.
                                            Two words, same meaning. */}
                                                    Gainers &amp; Losers
                                                </p>

                                                {/* Phone: one advance/decline bar instead of four chips. */}
                                                <div className="sm:hidden">
                                                    <div className="flex items-baseline justify-between text-[11px] font-black mb-1.5">
                                                        <span className="text-green-600">▲ {marketStats.advanced}</span>
                                                        <span className="text-zinc-400 text-[10px] uppercase tracking-widest">{marketStats.unchanged} unch</span>
                                                        <span className="text-red-600">{marketStats.declined} ▼</span>
                                                    </div>
                                                    <div className="flex h-1.5 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                                                        <div className="bg-green-500" style={{ width: `${breadthSplit.adv}%` }} />
                                                        <div className="bg-zinc-400 dark:bg-zinc-600" style={{ width: `${breadthSplit.unch}%` }} />
                                                        <div className="bg-red-500" style={{ width: `${breadthSplit.dec}%` }} />
                                                    </div>
                                                </div>

                                                <div className="hidden sm:grid grid-cols-4 gap-1.5 sm:gap-2">
                                                    <div className="bg-green-50/50 dark:bg-green-900/10 border border-green-100/50 dark:border-green-800/30 p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-center">
                                                        <p className="text-[7px] sm:text-[10px] font-black text-green-600/80 uppercase mb-0.5">Adv</p>
                                                        <p className="text-xs sm:text-sm font-black text-green-600 leading-none">{marketStats.advanced}</p>
                                                    </div>
                                                    <div className="bg-red-50/50 dark:bg-red-900/10 border border-red-100/50 dark:border-red-800/30 p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-center">
                                                        <p className="text-[7px] sm:text-[10px] font-black text-red-600/80 uppercase mb-0.5">Dec</p>
                                                        <p className="text-xs sm:text-sm font-black text-red-600 leading-none">{marketStats.declined}</p>
                                                    </div>
                                                    <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-800/30 p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-center">
                                                        <p className="text-[7px] sm:text-[10px] font-black text-blue-600/80 uppercase mb-0.5">Unch</p>
                                                        <p className="text-xs sm:text-sm font-black text-blue-600 leading-none">{marketStats.unchanged}</p>
                                                    </div>
                                                    <div className="bg-zinc-100/50 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/30 p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-center">
                                                        <p className="text-[7px] sm:text-[10px] font-black text-zinc-500 uppercase mb-0.5">Total</p>
                                                        <p className="text-xs sm:text-sm font-black text-zinc-900 dark:text-zinc-50 leading-none">{marketStats.total}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className={`px-4 sm:px-8 py-5 sm:py-10 page-shell mx-auto w-full space-y-5 sm:space-y-10 ${compareStocks.length > 0 ? 'pb-64' : ''}`}>
                {loadError && <LoadErrorBanner hasData={stocks.length > 0} what="PSX stocks" onRetry={() => load(true)} />}
                {/* Unified Market Control Ribbon */}
                {/* gap-* rather than space-y-*: the filter panels below collapse to
                    display:none on phones, and space-y still reserved their margin,
                    leaving dead space under the Filters button. */}
                <div className={`card backdrop-blur-3xl animate-in fade-in slide-in-from-bottom-6 duration-700 transition-all ${analysisOpen ? 'p-4 sm:p-8 flex flex-col gap-4 sm:gap-8' : 'px-4 sm:px-8 py-3.5 sm:py-5'}`}>
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8">
                        <div className={`flex-1 w-full ${analysisOpen ? 'flex flex-col gap-4 sm:gap-6' : ''}`}>
                            {/* flex-wrap: between sm and lg the title and the control
                                group together are wider than the row, which squeezed
                                the heading into a 2-line, 100px-wide column. Now the
                                controls drop to their own line instead. */}
                            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3">
                                <div className="space-y-1 min-w-0 sm:shrink-0">
                                    <button
                                        onClick={toggleAnalysis}
                                        aria-expanded={analysisOpen}
                                        aria-controls="market-analysis-body"
                                        title={analysisOpen ? 'Collapse panel' : 'Expand panel'}
                                        className="flex items-center gap-2 group"
                                    >
                                        <h2 className="text-lg sm:text-2xl font-black italic uppercase tracking-tighter text-zinc-900 dark:text-white leading-none whitespace-nowrap group-hover:text-blue-600 transition-colors">Market Analysis</h2>
                                        <ChevronDown
                                            className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-zinc-400 group-hover:text-blue-600 transition-all duration-300 ${analysisOpen ? '' : '-rotate-90'}`}
                                            strokeWidth={3}
                                        />
                                    </button>
                                    <p className="text-[10px] sm:text-[11px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2 whitespace-nowrap">
                                        <span className="w-1.5 h-1.5 bg-blue-600 rounded-full shrink-0 animate-pulse"></span>
                                        <span className="sm:hidden">{filteredStocks.length} assets</span>
                                        <span className="hidden sm:inline">Monitoring {filteredStocks.length} Real-Time Assets</span>
                                    </p>
                                    {/* Collapsed: keep the active filters visible so the list is never unexplained */}
                                    {!analysisOpen && (
                                        <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                                            {activeFilters.length === 0 ? (
                                                <span className="text-[10px] sm:text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-zinc-100 dark:bg-white/5 text-zinc-400">All Market</span>
                                            ) : activeFilters.map(f => (
                                                <span key={f} className="text-[10px] sm:text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 max-w-[160px] truncate">{f}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    {/* Search lives on this row in every state — there is no second
                                        row below it. Desktop shows a real field; phones show an icon
                                        that grows into one on tap, and the view toggle drops its
                                        labels while it is open so the input has room. */}
                                    <div className={`relative transition-[flex-grow,width] duration-300 ease-out sm:flex-none sm:w-56 lg:w-64 ${searchExpanded ? 'flex-1' : 'w-9'}`}>
                                        <Search className="absolute left-2.5 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" strokeWidth={3} />
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            onFocus={() => setSearchFocused(true)}
                                            onBlur={() => setSearchFocused(false)}
                                            placeholder="Search symbol..."
                                            aria-label="Search symbols"
                                            title="Search symbols"
                                            // Collapsed on a phone the field is only 36px wide, so the
                                            // placeholder's first letter poked out beside the icon —
                                            // hide it until the field actually opens. Desktop (sm+)
                                            // always shows a real field, so it keeps its placeholder.
                                            className={`w-full h-9 sm:h-11 rounded-xl sm:rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-[11px] font-black uppercase tracking-widest outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-600/40 pl-8 sm:pl-11 sm:placeholder:text-zinc-500 ${searchExpanded ? 'pr-8 cursor-text placeholder:text-zinc-500' : 'pr-0 cursor-pointer placeholder:text-transparent'} sm:pr-9 sm:cursor-text`}
                                        />
                                        {searchTerm && (
                                            <button
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => { setSearchTerm(""); searchInputRef.current?.focus(); }}
                                                aria-label="Clear search"
                                                className={`absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 w-6 h-6 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 ${searchExpanded ? 'flex' : 'hidden sm:flex'}`}
                                            >
                                                <X className="w-3.5 h-3.5" strokeWidth={3} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Filters toggle rides the same row on phones; desktop always
                                        shows the dropdowns so it has no button. */}
                                    {analysisOpen && (
                                        <button
                                            onClick={() => setShowFilters(v => !v)}
                                            aria-label="Toggle filters"
                                            aria-expanded={showFilters}
                                            title="Filters"
                                            className={`lg:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border transition-all ${showFilters ? 'bg-blue-600 text-white border-blue-600' : 'bg-zinc-100 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-500'}`}
                                        >
                                            <SlidersHorizontal className="w-4 h-4" strokeWidth={2.5} />
                                        </button>
                                    )}

                                    <div className={`flex h-fit bg-zinc-100 dark:bg-white/5 p-1 rounded-xl sm:rounded-2xl border border-zinc-200 dark:border-white/10 ${searchExpanded ? 'shrink-0' : 'flex-1 sm:flex-none'}`}>
                                        <button
                                            onClick={() => setViewType('card')}
                                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${viewType === 'card' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-xl' : 'text-zinc-400 hover:text-zinc-600'}`}
                                        >
                                            <LayoutGrid className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                                            <span className={labelWhenSearching}>Card</span>
                                        </button>
                                        <button
                                            onClick={() => setViewType('table')}
                                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${viewType === 'table' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-xl' : 'text-zinc-400 hover:text-zinc-600'}`}
                                        >
                                            <Table className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                                            <span className={labelWhenSearching}>Table</span>
                                        </button>
                                        {/* Heatmap needs width to be legible — desktop only. */}
                                        <button
                                            onClick={() => setViewType('heatmap')}
                                            className={`hidden sm:flex flex-1 sm:flex-none items-center justify-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${viewType === 'heatmap' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-xl' : 'text-zinc-400 hover:text-zinc-600'}`}
                                        >
                                            <Grid3x3 className="w-3.5 h-3.5" strokeWidth={2.5} /> Heatmap
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Filter dropdowns — collapsible on mobile, always shown on desktop */}
                            {/* One column on phones: two 150px columns clipped the option
                                text ("Sectors: Global…") halfway through. */}
                            <div id="market-analysis-body" className={`${analysisOpen ? (showFilters ? 'grid' : 'hidden') : 'hidden'} ${analysisOpen ? 'lg:grid' : ''} grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4`}>
                                <div className="relative group">
                                    <select
                                        value={indexFilter || "all"}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setIndexFilter(val);
                                            const idxObj = indices.find(i => i.name === val);
                                            setSelectedIndex(idxObj || null);
                                        }}
                                        className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl pl-4 sm:pl-6 pr-10 py-3 sm:py-4 text-[11px] sm:text-xs font-black uppercase tracking-widest truncate appearance-none outline-none focus:ring-2 focus:ring-blue-600 transition-all cursor-pointer"
                                    >
                                        <option value="all">Index: All Market</option>
                                        {indices.map(idx => (
                                            <option key={idx.name} value={idx.name}>{idx.name}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 text-[11px]">▼</div>
                                </div>

                                <div className="relative group">
                                    <select
                                        value={filter}
                                        onChange={(e) => setFilter(e.target.value)}
                                        className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl pl-4 sm:pl-6 pr-10 py-3 sm:py-4 text-[11px] sm:text-xs font-black uppercase tracking-widest truncate appearance-none outline-none focus:ring-2 focus:ring-blue-600 transition-all cursor-pointer"
                                    >
                                        <option value="all">Sectors: Global</option>
                                        {sectors.filter(s => s !== 'All').map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 text-[11px]">▼</div>
                                </div>

                                {/* Span must track the column count — a hard col-span-2 in a
                                    one-column grid spawns an implicit column and collapses
                                    its siblings to zero width. */}
                                <div className="relative group col-span-1 sm:col-span-2 lg:col-span-1">
                                    <select
                                        value={categoryFilter}
                                        onChange={(e) => setCategoryFilter(e.target.value)}
                                        className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl pl-4 sm:pl-6 pr-10 py-3 sm:py-4 text-[11px] sm:text-xs font-black uppercase tracking-widest truncate appearance-none outline-none focus:ring-2 focus:ring-blue-600 transition-all cursor-pointer"
                                    >
                                        <option value="all">Market View: General</option>
                                        <option value="gainers">Top Performers</option>
                                        <option value="active">High Liquidity</option>
                                        <option value="losers">Market Decliners</option>
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 text-[11px]">▼</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={`${analysisOpen ? (showFilters ? 'flex' : 'hidden') : 'hidden'} ${analysisOpen ? 'lg:flex' : ''} flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-6 pt-4 sm:pt-6 border-t border-zinc-100 dark:border-white/5`}>
                        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar py-1 -mx-1 px-1 w-full lg:w-auto">
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] whitespace-nowrap shrink-0">
                                <span className="sm:hidden">Watchlist:</span>
                                <span className="hidden sm:inline">Watchlist Monitor:</span>
                            </span>
                            <button
                                onClick={() => setActiveWatchlistId(null)}
                                className={`shrink-0 whitespace-nowrap px-4 sm:px-5 py-2 min-h-[34px] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!activeWatchlistId ? 'bg-blue-600 text-white shadow-lg' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500 hover:text-zinc-300'}`}
                            >
                                Total Market
                            </button>
                            {watchlists.map(wl => (
                                <button
                                    key={wl._id}
                                    onClick={() => setActiveWatchlistId(wl._id)}
                                    className={`shrink-0 px-4 sm:px-5 py-2 min-h-[34px] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${activeWatchlistId === wl._id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    <Folder className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} /> <span className="max-w-[9rem] truncate">{wl.name}</span>
                                </button>
                            ))}
                            <button
                                onClick={() => setIsCreatingWatchlist(!isCreatingWatchlist)}
                                className="shrink-0 whitespace-nowrap px-4 sm:px-5 py-2 min-h-[34px] rounded-xl text-[10px] font-black uppercase tracking-widest border border-dashed border-zinc-300 dark:border-white/10 text-zinc-400 hover:border-blue-500 hover:text-blue-500 transition-all"
                            >
                                + Create New
                            </button>
                        </div>

                        {/* Chips rather than bare 9px labels — these were well under a
                            comfortable tap target and read as static text. */}
                        <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 sm:gap-4 shrink-0 w-full sm:w-auto">
                            <button
                                onClick={() => { setCompareMode(m => !m); if (compareMode) setCompareSymbols([]); }}
                                className={`inline-flex items-center justify-center gap-1 px-2 py-2 min-h-[36px] rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors bg-zinc-100 dark:bg-white/5 sm:bg-transparent sm:dark:bg-transparent sm:px-0 sm:py-0 sm:min-h-0 ${compareMode ? 'text-blue-600' : 'text-zinc-400 hover:text-blue-600'}`}
                                title="Select cards to compare side by side"
                            >
                                <Scale className="w-3 h-3 shrink-0" strokeWidth={2.5} /> Compare{compareMode ? ' On' : ''}
                            </button>
                            <button
                                onClick={exportCSV}
                                className="inline-flex items-center justify-center gap-1 px-2 py-2 min-h-[36px] rounded-xl text-[10px] font-black text-zinc-400 hover:text-blue-600 uppercase tracking-widest transition-colors bg-zinc-100 dark:bg-white/5 sm:bg-transparent sm:dark:bg-transparent sm:px-0 sm:py-0 sm:min-h-0"
                                title="Export the current filtered view to CSV"
                            >
                                <Download className="w-3 h-3 shrink-0" strokeWidth={2.5} /> <span className="sm:hidden">CSV</span><span className="hidden sm:inline">Export CSV</span>
                            </button>
                            <button
                                onClick={() => { setFilter('all'); setCategoryFilter('all'); setIndexFilter('all'); setSelectedIndex(null); setSearchTerm(""); }}
                                className="inline-flex items-center justify-center gap-1 px-2 py-2 min-h-[36px] rounded-xl text-[10px] font-black text-blue-600 hover:text-red-500 uppercase tracking-widest transition-colors bg-zinc-100 dark:bg-white/5 sm:bg-transparent sm:dark:bg-transparent sm:px-0 sm:py-0 sm:min-h-0"
                                title="Clear all filters"
                            >
                                <RotateCcw className="w-3 h-3 shrink-0" strokeWidth={2.5} /> <span className="sm:hidden">Reset</span><span className="hidden sm:inline">Reset Pipeline</span>
                            </button>
                        </div>
                    </div>

                    {analysisOpen && isCreatingWatchlist && (
                        <div className="flex gap-2 p-3 bg-blue-600 text-white rounded-2xl animate-in zoom-in-95 duration-200">
                            <input
                                type="text"
                                placeholder="Snapshot Name..."
                                value={newWatchlistName}
                                onChange={(e) => setNewWatchlistName(e.target.value)}
                                className="flex-1 bg-white/20 border-none rounded-xl px-4 py-2 text-xs font-black placeholder:text-white/50 focus:ring-0 outline-none"
                                onKeyPress={(e) => e.key === 'Enter' && handleCreateWatchlist()}
                            />
                            <button onClick={handleCreateWatchlist} className="bg-white text-blue-600 px-6 py-2 rounded-xl text-xs font-black hover:bg-zinc-100 transition-all uppercase">Save</button>
                            <button onClick={() => setIsCreatingWatchlist(false)} className="px-4 py-2 text-white/80 hover:text-white"><X className="w-4 h-4" strokeWidth={2.5} /></button>
                        </div>
                    )}
                </div>

                {/* Explorer Results Area */}
                <div className="space-y-6 sm:space-y-12 min-h-[400px] sm:min-h-[800px]">
                    {viewType === 'heatmap' ? (
                        <SectorHeatmap
                            stocks={filteredStocks}
                            onSelectSector={(sector) => { setFilter(sector); setViewType('card'); }}
                            onSelectSymbol={(symbol) => router.push(`/stocks/${symbol.toLowerCase()}`)}
                        />
                    ) : viewType === 'card' ? (
                        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
                            <div className="card-grid gap-2 sm:gap-6 px-1">
                                {paginatedStocks.map((stock) => (
                                    <StockCard
                                        key={stock.symbol}
                                        compact
                                        {...stock}
                                        onClick={() => router.push(`/stocks/${stock.symbol.toLowerCase()}`)}
                                        watchlists={watchlists}
                                        activeWatchlistId={activeWatchlistId}
                                        onAddToWatchlist={handleAddToWatchlist}
                                        onRemoveFromWatchlist={handleRemoveFromWatchlist}
                                        onWatchlistCreated={(newList) => setWatchlists([newList, ...watchlists])}
                                        isNew={newLeaders.has(stock.symbol.toUpperCase())}
                                        selectable={compareMode}
                                        selected={compareSymbols.includes(stock.symbol.toUpperCase())}
                                        onToggleSelect={toggleCompare}
                                    />
                                ))}
                                {filteredStocks.length === 0 && (
                                    <div className="card-empty col-span-full py-48 text-center">
                                        <SearchX className="w-10 h-10 mx-auto mb-4 text-zinc-400" strokeWidth={1.5} />
                                        <p className="text-zinc-500 font-black uppercase tracking-widest text-[11px]">No matching scripts found</p>
                                    </div>
                                )}
                            </div>

                            {/* Infinite scroll sentinel + counter */}
                            {filteredStocks.length > 0 && (
                                <div ref={loadMoreRef} className="pt-6 flex flex-col items-center gap-2">
                                    {visibleCount < filteredStocks.length ? (
                                        <>
                                            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Loading more · {Math.min(visibleCount, filteredStocks.length)} / {filteredStocks.length}</p>
                                        </>
                                    ) : (
                                        <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">All {filteredStocks.length} assets loaded</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-app-dark rounded-[2.5rem] border border-zinc-200 dark:border-white/5 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left text-[11px] border-collapse">
                                    <thead>
                                        <tr className="bg-zinc-50 dark:bg-white/5 text-zinc-500">
                                            {/* Company and Signal are gone: the name now sits under the
                                                symbol, and the freed width goes to today's Low/High,
                                                which show from tablet up. */}
                                            <th onClick={() => requestSort('symbol')} className="p-3 sm:p-6 font-black uppercase tracking-widest cursor-pointer hover:text-blue-500 transition-colors">Symbol <SortIcon column="symbol" /></th>
                                            <th onClick={() => requestSort('currentPrice')} className="p-3 sm:p-6 font-black uppercase tracking-widest cursor-pointer hover:text-blue-500 transition-colors text-right">Price <SortIcon column="currentPrice" /></th>
                                            <th onClick={() => requestSort('changePercent')} className="p-3 sm:p-6 font-black uppercase tracking-widest cursor-pointer hover:text-blue-500 transition-colors text-right">Change <SortIcon column="changePercent" /></th>
                                            <th onClick={() => requestSort('low')} className="p-3 sm:p-6 font-black uppercase tracking-widest cursor-pointer hover:text-blue-500 transition-colors text-right hidden sm:table-cell">Low <SortIcon column="low" /></th>
                                            <th onClick={() => requestSort('high')} className="p-3 sm:p-6 font-black uppercase tracking-widest cursor-pointer hover:text-blue-500 transition-colors text-right hidden sm:table-cell">High <SortIcon column="high" /></th>
                                            <th className="p-3 sm:p-6 font-black uppercase tracking-widest text-center hidden lg:table-cell">Day Range</th>
                                            <th onClick={() => requestSort('volume')} className="p-3 sm:p-6 font-black uppercase tracking-widest cursor-pointer hover:text-blue-500 transition-colors text-right hidden md:table-cell">Volume <SortIcon column="volume" /></th>
                                            <th className="p-3 sm:p-6 font-black uppercase tracking-widest text-right hidden lg:table-cell">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                        {paginatedStocks.map((stock) => (
                                            <tr key={stock.symbol} onClick={() => router.push(`/stocks/${stock.symbol.toLowerCase()}`)} className="hover:bg-blue-500/5 transition-all group cursor-pointer">
                                                <td className="p-3 sm:p-6">
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <span className="w-fit px-2.5 py-1 sm:px-3 sm:py-1.5 bg-zinc-100 dark:bg-white/10 rounded-lg font-black group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">{stock.symbol}</span>
                                                        <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-tight truncate max-w-[130px] sm:max-w-[190px]">{stock.name}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 sm:p-6 font-mono font-black text-right text-sm">{stock.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                <td className={`p-3 sm:p-6 font-black text-right text-sm ${stock.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {stock.changePercent >= 0 ? '▲' : '▼'}{Math.abs(stock.changePercent).toFixed(2)}%
                                                </td>
                                                <td className="p-3 sm:p-6 font-mono text-right text-sm text-red-500/80 hidden sm:table-cell tabular-nums">
                                                    {stock.low > 0 ? stock.low.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                                                </td>
                                                <td className="p-3 sm:p-6 font-mono text-right text-sm text-green-500/80 hidden sm:table-cell tabular-nums">
                                                    {stock.high > 0 ? stock.high.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                                                </td>
                                                <td className="p-3 sm:p-6 hidden lg:table-cell">
                                                    {(() => {
                                                        const pos = dayRangePosition(stock.low, stock.high, stock.currentPrice);
                                                        if (pos == null) return <div className="text-center text-zinc-300 dark:text-zinc-700">—</div>;
                                                        return (
                                                            <div className="min-w-[90px]" title={`${pos.toFixed(0)}% of today's range`}>
                                                                <div className="relative h-1.5 rounded-full bg-gradient-to-r from-red-500/30 via-zinc-300 dark:via-zinc-700 to-green-500/30">
                                                                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-white dark:border-zinc-900" style={{ left: `${pos}%` }}></div>
                                                                </div>
                                                                <div className="text-[10px] font-bold text-zinc-400 text-center mt-1 tabular-nums">{pos.toFixed(0)}%</div>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="p-3 sm:p-6 font-mono text-zinc-500 dark:text-zinc-500 text-right group-hover:text-zinc-300 hidden md:table-cell">{stock.volume}</td>
                                                <td className="p-3 sm:p-6 text-right hidden lg:table-cell">
                                                    <button onClick={(e) => { e.stopPropagation(); router.push(`/stocks/${stock.symbol.toLowerCase()}`); }} className="text-[11px] font-black uppercase bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-600/20">Analyze</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredStocks.length === 0 && (
                                            <tr>
                                                <td colSpan={8} className="py-24 text-center">
                                                    <SearchX className="w-10 h-10 mx-auto mb-4 text-zinc-400" strokeWidth={1.5} />
                                                    <p className="text-zinc-500 font-black uppercase tracking-widest text-[11px]">No matching scripts found</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Infinite scroll sentinel + counter */}
                            {filteredStocks.length > 0 && (
                                <div ref={loadMoreRef} className="px-4 sm:px-8 py-6 bg-zinc-50 dark:bg-[#080808] border-t border-zinc-200 dark:border-white/5 flex flex-col items-center gap-2">
                                    {visibleCount < filteredStocks.length ? (
                                        <>
                                            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Loading more · {Math.min(visibleCount, filteredStocks.length)} / {filteredStocks.length}</p>
                                        </>
                                    ) : (
                                        <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">All {filteredStocks.length} assets loaded</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {compareMode && (
                <CompareTray
                    stocks={compareStocks}
                    onRemove={toggleCompare}
                    onClear={() => setCompareSymbols([])}
                    onOpen={(symbol) => router.push(`/stocks/${symbol.toLowerCase()}`)}
                />
            )}

            <style jsx global>{`
                @keyframes loading {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 10px;
                }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.05);
                }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
