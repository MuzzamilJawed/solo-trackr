"use client";

import { Globe, Search, SearchX, FolderOpen, SlidersHorizontal, X } from "lucide-react";

import PageSkeleton from "../components/PageSkeleton";
import { usePullRefresh } from "../lib/pullRefresh";
import LoadErrorBanner from "../components/LoadErrorBanner";
import StockCard from "../components/StockCard";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from 'next/navigation';
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../context/ToastContext";
import dynamic from 'next/dynamic';
const TradingChart = dynamic(() => import('../components/TradingChart'), { ssr: false });

export default function NasdaqPage() {
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
        targetPrice?: number;
        sector?: string;
        pkrPrice?: number;
        history?: { time: string; price: number }[];
    }

    interface Index {
        name: string;
        value: number;
        change: number;
        changePercent: number;
    }

    // Filter & View State
    const [viewType, setViewType] = useState<'card' | 'table'>('card');
    const [filter, setFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [indexFilter, setIndexFilter] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [showFilters, setShowFilters] = useState(false); // mobile: collapse the filter panel

    // Data State
    const [stocks, setStocks] = useState<Stock[]>([]);
    const [sectors, setSectors] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [exchangeRate, setExchangeRate] = useState(280);
    const [indices, setIndices] = useState<Index[]>([
        { name: "NASDAQ 100", value: 18235.45, change: 124.5, changePercent: 0.68 },
        { name: "S&P 500", value: 5243.20, change: 15.30, changePercent: 0.29 },
        { name: "DOW JONES", value: 39475.90, change: -45.20, changePercent: -0.11 }
    ]);
    const [selectedIndex, setSelectedIndex] = useState<Index | null>(null);

    // Watchlist State
    const [watchlists, setWatchlists] = useState<any[]>([]);
    const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);
    const [newWatchlistName, setNewWatchlistName] = useState("");
    const [isCreatingWatchlist, setIsCreatingWatchlist] = useState(false);

    // Global Settings
    const { settings } = useSettings();
    const { success, error } = useToast();
    const router = useRouter();
    // NASDAQ is a USD market — prices here are always quoted in USD and never
    // follow the display-currency setting, so this screen has no toggle.

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: keyof Stock; direction: 'asc' | 'desc' } | null>(null);

    const generateHistory = useCallback((price: number) => {
        const count = 60;
        const nowSec = Math.floor(Date.now() / 1000);
        const interval = 86400;
        const volatility = 0.015;
        let lastClose = price;
        const data = [];
        for (let i = 0; i < count; i++) {
            const time = nowSec - i * interval;
            const change = (Math.random() - 0.5) * volatility;
            const close = lastClose;
            const open = close / (1 + change);
            const high = Math.max(open, close) * (1 + Math.random() * (volatility * 0.3));
            const low = Math.min(open, close) * (1 - Math.random() * (volatility * 0.3));
            data.unshift({
                time,
                open: parseFloat(open.toFixed(2)),
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                close: parseFloat(close.toFixed(2)),
                volume: Math.floor(Math.random() * 500000) + 50000
            });
            lastClose = open;
        }
        return data;
    }, []);

    const load = async (isManual = true) => {
        try {
            if (isManual) setLoading(true);

            // Fetch exchange rate
            try {
                const exRes = await fetch('https://open.er-api.com/v6/latest/USD');
                const exData = await exRes.json();
                if (exData?.rates?.PKR) setExchangeRate(Math.round(exData.rates.PKR));
            } catch (e) {
                console.warn("Failed to fetch exchange rate", e);
            }

            const res = await fetch('/api/nasdaq-stocks');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const rawData: Stock[] = json?.data || [];
            setLoadError(false);

            const data = rawData
                .filter(s => s && s.symbol)
                .map(s => {
                    const usdPrice = s.currentPrice || 0;
                    return {
                        ...s,
                        currentPrice: usdPrice,
                        pkrPrice: usdPrice * exchangeRate
                    }
                }).sort((a, b) => (a.symbol || "").localeCompare(b.symbol || ""));

            setStocks(data);
            const allSectorsArr = Array.from(new Set(data.map((s) => s.sector || 'Other'))).sort();
            setSectors(['All', ...allSectorsArr]);
        } catch (err) {
            console.error('Failed to load NASDAQ stocks', err);
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

    // Reset pagination when filters/search/watchlist change
    useEffect(() => {
        setCurrentPage(1);
    }, [filter, categoryFilter, searchTerm, activeWatchlistId]);

    const filteredStocks = useMemo(() => {
        let updated = [...stocks];

        // Watchlist Filtering
        if (activeWatchlistId) {
            const activeWL = watchlists.find(wl => wl._id === activeWatchlistId);
            if (activeWL) {
                updated = updated.filter(s => activeWL.symbols.includes(s.symbol.toUpperCase()));
            }
        }

        // Sector Filtering
        if (filter !== 'all') {
            updated = updated.filter((s) => (s.sector || 'Other').toLowerCase() === filter.toLowerCase());
        }

        // Category Filtering
        if (categoryFilter !== 'all') {
            if (categoryFilter === 'gainers') updated = updated.sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0)).slice(0, 50);
            else if (categoryFilter === 'losers') updated = updated.sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0)).slice(0, 50);
            else if (categoryFilter === 'active') updated = updated.sort((a, b) => (parseInt(b.volume.replace(/,/g, '')) || 0) - (parseInt(a.volume.replace(/,/g, '')) || 0)).slice(0, 50);
        }

        // Search
        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            updated = updated.filter((s) => s.symbol.toLowerCase().includes(lowSearch) || s.name.toLowerCase().includes(lowSearch));
        }

        // Manual Sort for Table
        if (sortConfig) {
            updated.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                if (aVal === undefined || bVal === undefined) return 0;
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return updated;
    }, [stocks, filter, categoryFilter, searchTerm, activeWatchlistId, watchlists, sortConfig]);

    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedStocks = filteredStocks.slice(startIndex, startIndex + itemsPerPage);

    const requestSort = (key: keyof Stock) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getVisiblePages = () => {
        const totalPages = Math.ceil(filteredStocks.length / itemsPerPage);
        const pages = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                pages.push(i);
            } else if (pages[pages.length - 1] !== '...') {
                pages.push('...');
            }
        }
        return pages;
    };

    if (loading && stocks.length === 0) return <PageSkeleton variant="explorer" />;

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white selection:bg-blue-500/30">
            {/* Real-time Loading Indicator */}
            {loading && (
                <div className="fixed top-[var(--sa-top)] left-0 w-full h-1 z-[100] bg-blue-600/10">
                    <div className="h-full bg-blue-600 animate-[loading_2s_infinite]"></div>
                </div>
            )}

            <header className="safe-top sticky top-0 z-50 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
                <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl sm:text-3xl font-black tracking-tighter italic uppercase text-zinc-900 dark:text-white flex items-center gap-2.5">
                            <Globe className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400 shrink-0" strokeWidth={2} /> NASDAQ <span className="text-blue-500">Terminal</span>
                        </h1>
                        <p className="hidden sm:block text-zinc-500 text-[11px] font-black uppercase tracking-[0.3em] mt-1">Global Tech Hub • High Fidelity Real-Time Hub</p>
                    </div>
                </div>
            </header>

            <main className="page-shell mx-auto px-4 sm:px-8 py-8 sm:py-12 space-y-8 sm:space-y-12">
                {loadError && <LoadErrorBanner hasData={stocks.length > 0} what="NASDAQ stocks" onRetry={() => load(true)} />}

                {/* Market Intelligence Ribbon */}
                <div className="card p-5 sm:p-8 space-y-6 sm:space-y-8 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none group-hover:opacity-[0.05] transition-opacity">
                        <span className="text-[10rem] font-black italic text-blue-600 uppercase">USA</span>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-8 items-center justify-between relative z-10">
                        {/* Primary Search Container — search always visible; a Filters button toggles the dropdowns on mobile */}
                        <div className="flex gap-2 sm:gap-3 w-full lg:flex-1">
                            <div className="relative flex-1 w-full group">
                                <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-zinc-400 group-focus-within:scale-110 transition-transform" strokeWidth={2} />
                                <input
                                    type="text"
                                    placeholder="Search Symbol..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl sm:rounded-[2rem] pl-14 sm:pl-16 pr-8 py-4 sm:py-5 text-xs sm:text-sm font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-inner placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                                />
                            </div>
                            <button
                                onClick={() => setShowFilters(v => !v)}
                                className={`lg:hidden shrink-0 flex items-center gap-2 px-4 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${showFilters ? 'bg-blue-600 text-white border-blue-600' : 'bg-zinc-50 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-500'}`}
                            >
                                <SlidersHorizontal className="w-4 h-4" strokeWidth={2.5} /> Filters
                            </button>
                        </div>

                        {/* Analysis Filters */}
                        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 sm:gap-4 w-full lg:w-auto">
                            {/* Dropdowns — collapsible on mobile, always shown on desktop */}
                            <div className={`${showFilters ? 'flex' : 'hidden'} lg:flex flex-col sm:flex-row flex-wrap items-center gap-3 sm:gap-4 w-full lg:w-auto`}>
                                <div className="relative group/select w-full sm:w-auto">
                                    <select
                                        value={categoryFilter}
                                        onChange={(e) => setCategoryFilter(e.target.value)}
                                        className="w-full bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl px-5 py-3.5 sm:px-6 sm:py-4 text-[11px] sm:text-xs font-black uppercase tracking-widest appearance-none outline-none focus:ring-2 focus:ring-blue-600 transition-all cursor-pointer sm:min-w-[180px]"
                                    >
                                        <option value="all">Pipeline: General</option>
                                        <option value="gainers">Top Velocity</option>
                                        <option value="active">High Liquidity</option>
                                        <option value="losers">Market Decliners</option>
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 group-hover/select:translate-y-[2px] transition-transform text-[11px]">▼</div>
                                </div>

                                <div className="relative group/select w-full sm:w-auto">
                                    <select
                                        value={filter}
                                        onChange={(e) => setFilter(e.target.value)}
                                        className="w-full bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl px-5 py-3.5 sm:px-6 sm:py-4 text-[11px] sm:text-xs font-black uppercase tracking-widest appearance-none outline-none focus:ring-2 focus:ring-blue-600 transition-all cursor-pointer sm:min-w-[180px]"
                                    >
                                        <option value="all">Sector: Total</option>
                                        {sectors.filter(s => s !== 'All').map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 group-hover/select:translate-y-[2px] transition-transform text-[11px]">▼</div>
                                </div>
                            </div>

                            {/* View Switcher Toggle — stays visible on mobile */}
                            <div className="flex w-full sm:w-auto bg-zinc-100 dark:bg-white/10 p-1 rounded-2xl border border-zinc-200 dark:border-white/5 shadow-inner">
                                <button
                                    onClick={() => setViewType('card')}
                                    className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all ${viewType === 'card' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Cards
                                </button>
                                <button
                                    onClick={() => setViewType('table')}
                                    className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all ${viewType === 'table' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Table
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Integrated Watchlist Bar — collapsible on mobile, always shown on desktop */}
                    <div className={`${showFilters ? 'flex' : 'hidden'} lg:flex flex-col sm:flex-row items-center justify-between gap-6 pt-6 border-t border-zinc-100 dark:border-white/5`}>
                        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-2 w-full lg:w-auto">
                            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em] whitespace-nowrap">Watchlist Monitor:</span>
                            <button
                                onClick={() => setActiveWatchlistId(null)}
                                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!activeWatchlistId ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500 hover:text-blue-500'}`}
                            >
                                US Total Market
                            </button>
                            {watchlists.map(wl => (
                                <button
                                    key={wl._id}
                                    onClick={() => setActiveWatchlistId(wl._id)}
                                    className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${activeWatchlistId === wl._id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500 hover:text-blue-500'}`}
                                >
                                    <FolderOpen className="w-3.5 h-3.5 shrink-0" strokeWidth={2} /> {wl.name}
                                </button>
                            ))}
                            <button
                                onClick={() => setIsCreatingWatchlist(!isCreatingWatchlist)}
                                className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-dashed border-zinc-300 dark:border-white/10 text-zinc-400 hover:border-blue-500 hover:text-blue-500 transition-all shrink-0"
                            >
                                + New List
                            </button>
                        </div>

                        {/* <div className="flex items-center gap-4 shrink-0">
                            <button
                                onClick={() => { setFilter('all'); setCategoryFilter('all'); setSelectedIndex(null); setSearchTerm(""); setActiveWatchlistId(null); }}
                                className="text-[10px] font-black text-blue-600 hover:text-red-500 uppercase tracking-widest transition-colors flex items-center gap-2"
                            >
                                ↺ Reset Analytics
                            </button>
                        </div> */}
                    </div>

                    {isCreatingWatchlist && (
                        <div className="flex flex-col sm:flex-row gap-4 p-4 bg-blue-600 text-white rounded-[2rem] animate-in zoom-in-95 duration-200">
                            <input
                                type="text"
                                placeholder="Snapshot Name (e.g. AI Giants)..."
                                value={newWatchlistName}
                                onChange={(e) => setNewWatchlistName(e.target.value)}
                                className="flex-1 bg-white/20 border-none rounded-2xl px-6 py-3 text-xs font-black placeholder:text-white/50 focus:ring-0 outline-none"
                                onKeyPress={(e) => e.key === 'Enter' && handleCreateWatchlist()}
                            />
                            <div className="flex gap-2">
                                <button onClick={handleCreateWatchlist} className="flex-1 sm:flex-none bg-white text-blue-600 px-8 py-3 rounded-2xl text-xs font-black hover:bg-zinc-100 transition-all uppercase tracking-widest">Execute</button>
                                <button onClick={() => setIsCreatingWatchlist(false)} className="px-6 py-3 text-white/80 hover:text-white border border-white/20 rounded-2xl uppercase text-[11px] font-black">Cancel</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Index Quick Scroll Ticker */}
                <div className="flex gap-4 sm:gap-6 overflow-x-auto no-scrollbar py-2">
                    {indices.map(idx => {
                        const isSelected = selectedIndex?.name === idx.name;
                        const isPos = idx.change >= 0;
                        return (
                            <button
                                key={idx.name}
                                onClick={() => setSelectedIndex(isSelected ? null : idx)}
                                className={`flex-1 min-w-[240px] sm:min-w-[280px] p-5 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border transition-all relative overflow-hidden group/card ${isSelected ? 'bg-blue-600 border-transparent text-white shadow-2xl scale-[1.02]' : 'bg-white dark:bg-white/5 border-zinc-200 dark:border-white/5 hover:border-blue-500/50'}`}
                            >
                                <div className="flex justify-between items-start mb-4 relative z-10">
                                    <div className="text-left">
                                        <p className={`text-[10px] sm:text-[11px] font-black uppercase tracking-widest mb-1 ${isSelected ? 'text-white/70' : 'text-zinc-500'}`}>{idx.name}</p>
                                        <h3 className="text-xl sm:text-2xl font-black font-mono tracking-tighter">{idx.value.toLocaleString()}</h3>
                                    </div>
                                    <div className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-black ${isSelected ? 'bg-white/20 text-white' : (isPos ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500')}`}>
                                        {isPos ? '▲' : '▼'}{Math.abs(idx.changePercent).toFixed(1)}%
                                    </div>
                                </div>
                                <div className={`text-[10px] sm:text-[11px] font-black uppercase tracking-widest relative z-10 text-left ${isSelected ? 'text-white/50' : 'text-zinc-400'}`}>
                                    {isPos ? 'BULLISH SENTIMENT' : 'BEARISH PRESSURE'}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Index Detail View (Dynamic Chart) */}
                {selectedIndex && (
                    <div className="animate-in slide-in-from-top-4 duration-500">
                        <div className="bg-white dark:bg-[#080808] rounded-[2rem] sm:rounded-[3.5rem] p-6 sm:p-10 border border-zinc-200 dark:border-white/5 shadow-2xl relative overflow-hidden group">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 sm:gap-8 mb-8 sm:mb-12 relative z-10">
                                <div>
                                    <div className="flex items-center gap-3 sm:gap-4 mb-2">
                                        <h2 className="text-2xl sm:text-4xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter leading-none">{selectedIndex.name}</h2>
                                        <span className={`px-3 py-0.5 sm:px-4 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-widest ${selectedIndex.change >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                            Live
                                        </span>
                                    </div>
                                    <p className="text-zinc-500 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.3em]">Master Market Benchmark • US Execution Profile</p>
                                </div>
                                <button onClick={() => setSelectedIndex(null)} aria-label="Close index details" className="absolute top-0 right-0 sm:relative text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" strokeWidth={2.5} /></button>
                            </div>

                            <div className="h-[350px] sm:h-[600px] w-full relative z-10 overflow-hidden">
                                <TradingChart
                                    title={`${selectedIndex.name} Performance Roadmap`}
                                    data={generateHistory(selectedIndex.value)}
                                    currentTimeframe="1D"
                                    currencySymbol="" seamless={true}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Explorer Results Area */}
                <div className="space-y-8 sm:space-y-12 min-h-[400px] sm:min-h-[800px]">
                    {viewType === 'card' ? (
                        <div className="space-y-8 sm:space-y-12 animate-in fade-in duration-500">
                            <div className="card-grid gap-3 sm:gap-8 px-1">
                                {paginatedStocks.map((stock) => (
                                    <StockCard
                                        key={stock.symbol}
                                        {...stock}
                                        currentPrice={stock.currentPrice}
                                        change={stock.change}
                                        open={stock.open}
                                        high={stock.high}
                                        low={stock.low}
                                        currencySymbol="$"
                                        exchange="NASDAQ"
                                        onClick={() => router.push(`/nasdaq/${stock.symbol.toLowerCase()}`)}
                                        watchlists={watchlists}
                                        activeWatchlistId={activeWatchlistId}
                                        onAddToWatchlist={handleAddToWatchlist}
                                        onRemoveFromWatchlist={handleRemoveFromWatchlist}
                                        onWatchlistCreated={(newList) => setWatchlists([newList, ...watchlists])}
                                    />
                                ))}
                                {!loading && filteredStocks.length === 0 && (
                                    <div className="card-empty col-span-full py-48 text-center">
                                        <SearchX className="w-10 h-10 mx-auto mb-6 text-zinc-400" strokeWidth={1.5} />
                                        <p className="text-zinc-500 font-black uppercase tracking-[0.3em] text-xs px-12">Universal market scan complete: No matching footprints detected</p>
                                    </div>
                                )}
                            </div>

                            {/* Card Pagination */}
                            {filteredStocks.length > itemsPerPage && (
                                <div className="flex flex-col sm:flex-row justify-between items-center gap-8 pt-12 border-t border-zinc-200 dark:border-white/5">
                                    <div className="text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em] italic">
                                        Vault Entry {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredStocks.length)} of {filteredStocks.length} Global Assets
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {getVisiblePages().map((p, i) => (
                                            <button
                                                key={i}
                                                onClick={() => typeof p === 'number' && (setCurrentPage(p), window.scrollTo({ top: 800, behavior: 'smooth' }))}
                                                disabled={p === '...' || p === currentPage}
                                                className={`min-w-[45px] h-[45px] rounded-xl text-[11px] font-black transition-all ${p === currentPage ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' : p === '...' ? 'cursor-default text-zinc-400' : 'bg-white dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/5'}`}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="card overflow-hidden animate-in fade-in duration-500">
                            <div className="px-6 sm:px-10 py-6 sm:py-8 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-black/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-6">
                                <div>
                                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-[0.3em]">Institutional Asset Analytics</h2>
                                    <p className="text-[10px] sm:text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Multi-Vector Valuation Matrix</p>
                                </div>
                                <div className="flex items-center gap-6">
                                    <span className="text-[10px] sm:text-[11px] font-black text-blue-600 uppercase tracking-widest bg-blue-600/10 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border border-blue-500/20">
                                        Live Feed
                                    </span>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-[11px] border-collapse">
                                    <thead>
                                        <tr className="bg-zinc-100/50 dark:bg-black uppercase tracking-widest text-zinc-400 font-black">
                                            <th onClick={() => requestSort('symbol')} className="p-3 sm:p-8 cursor-pointer hover:text-blue-500 transition-colors">Ticker Symbol</th>
                                                                                        <th onClick={() => requestSort('currentPrice')} className="p-3 sm:p-8 cursor-pointer hover:text-blue-500 transition-colors text-right">Execution Price</th>
                                            <th onClick={() => requestSort('changePercent')} className="p-3 sm:p-8 cursor-pointer hover:text-blue-500 transition-colors text-right">Momentum Delta</th>
                                            <th onClick={() => requestSort('volume')} className="p-3 sm:p-8 cursor-pointer hover:text-blue-500 transition-colors text-right hidden md:table-cell">Market Fluidity</th>
                                            <th className="p-3 sm:p-8 text-center hidden lg:table-cell">Strategic Analysis</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                        {paginatedStocks.map((stock) => (
                                            <tr key={stock.symbol} onClick={() => router.push(`/nasdaq/${stock.symbol.toLowerCase()}`)} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-all group cursor-pointer">
                                                <td className="p-3 sm:p-8">
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <span className="w-fit px-2.5 py-1 sm:px-4 sm:py-2 bg-zinc-100 dark:bg-white/5 rounded-xl font-black group-hover:text-blue-600 group-hover:scale-105 transition-all shadow-sm">
                                                            {stock.symbol}
                                                        </span>
                                                        <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-tight truncate max-w-[130px] sm:max-w-[190px]" title={stock.name}>{stock.name}</span>
                                                    </div>
                                                </td>
                                                                                                <td className="p-3 sm:p-8 font-mono font-black text-right text-sm">
                                                    ${stock.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="p-3 sm:p-8 text-right">
                                                    <span className={`px-2.5 py-1 sm:px-4 sm:py-1.5 rounded-xl font-black ${stock.changePercent >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-600'}`}>
                                                        {stock.changePercent >= 0 ? '▲' : '▼'}{Math.abs(stock.changePercent)?.toFixed(2)}%
                                                    </span>
                                                </td>
                                                <td className="p-3 sm:p-8 font-mono text-zinc-400 text-right font-black uppercase hidden md:table-cell">{stock.volume}</td>
                                                <td className="p-3 sm:p-8 text-center hidden lg:table-cell">
                                                    <button onClick={(e) => { e.stopPropagation(); router.push(`/nasdaq/${stock.symbol.toLowerCase()}`); }} className="text-[10px] font-black uppercase tracking-widest bg-blue-600 text-white px-6 py-3 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl shadow-blue-600/30">Detailed Audit</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Table Pagination */}
                            {filteredStocks.length > itemsPerPage && (
                                <div className="px-10 py-8 bg-zinc-50 dark:bg-app-dark/40 border-t border-zinc-100 dark:border-white/5 flex flex-col sm:flex-row justify-between items-center gap-8">
                                    <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">
                                        Matrix Segment: {startIndex + 1} TO {Math.min(startIndex + itemsPerPage, filteredStocks.length)} | Total: {filteredStocks.length}
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            className="px-6 py-3 rounded-[1.2rem] bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-[11px] font-black uppercase tracking-widest disabled:opacity-30 hover:border-blue-500 transition-all"
                                        >
                                            Prev
                                        </button>
                                        <div className="flex items-center px-4 font-black text-xs text-blue-600 tracking-tighter">
                                            {currentPage} / {Math.ceil(filteredStocks.length / itemsPerPage)}
                                        </div>
                                        <button
                                            disabled={currentPage === Math.ceil(filteredStocks.length / itemsPerPage)}
                                            onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredStocks.length / itemsPerPage), prev + 1))}
                                            className="px-6 py-3 rounded-[1.2rem] bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-[11px] font-black uppercase tracking-widest disabled:opacity-30 hover:border-blue-500 transition-all"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            <style jsx global>{`
                @keyframes loading {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(59, 130, 246, 0.1);
                    border-radius: 10px;
                }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(59, 130, 246, 0.2);
                }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
