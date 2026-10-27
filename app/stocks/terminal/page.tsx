"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from 'next/dynamic';
const TradingChart = dynamic(() => import('../../components/TradingChart'), { ssr: false });
import { useSettings } from "../../context/SettingsContext";
import { computePivotLevels, nextLevels } from "../../lib/levels";
import { TrendingDown, Activity, ArrowLeft, BarChart3, X, PanelLeft, Search, LineChart, ClipboardList } from "lucide-react";
import { LOADING_CAPTION } from "../../lib/caption";

export default function MarketTerminalPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zinc-50 dark:bg-app-dark flex items-center justify-center relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full"></div>
                <div className="flex flex-col items-center gap-8 relative z-10">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-blue-600/20 rounded-full"></div>
                        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                        <div className="absolute inset-0 flex items-center justify-center text-blue-600"><TrendingDown className="w-6 h-6" strokeWidth={2} /></div>
                    </div>
                    <div className="text-center">
                        <p className="text-zinc-900 dark:text-white font-black uppercase text-xs tracking-[0.4em] animate-pulse">{LOADING_CAPTION}</p>
                    </div>
                </div>
            </div>
        }>
            <MarketTerminalContent />
        </Suspense>
    );
}

function MarketTerminalContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Read initial state from URL
    const [viewMode, setViewMode] = useState<'stocks' | 'indices' | 'sectors'>((searchParams.get('view') as any) || 'indices');
    const [selectedSector, setSelectedSector] = useState<string | null>(null);
    const [selectedSymbol, setSelectedSymbol] = useState<string | null>(searchParams.get('symbol'));
    const [timeframe, setTimeframe] = useState(searchParams.get('tf') || "1D");
    const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || "");
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [stocks, setStocks] = useState<any[]>([]);
    const [indices, setIndices] = useState<any[]>([]);
    const [selectedAsset, setSelectedAsset] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [candles, setCandles] = useState<any[]>([]);
    const [dayRange, setDayRange] = useState<{ high: number | null; low: number | null }>({ high: null, low: null });
    const [chartLoading, setChartLoading] = useState(false);
    const [clockTime, setClockTime] = useState("");
    const { settings } = useSettings();

    useEffect(() => {
        setClockTime(new Date().toLocaleTimeString());
        const id = setInterval(() => setClockTime(new Date().toLocaleTimeString()), 60000);
        return () => clearInterval(id);
    }, []);

    const fetchHistory = useCallback(async (symbol: string, tf: string, asset: any) => {
        setChartLoading(true);
        try {
            const res = await fetch(`/api/psx-history?symbol=${symbol}&timeframe=${tf}`);
            const json = await res.json();

            // Session (day) high/low reported by the data provider (indices via PSX feed)
            setDayRange({
                high: typeof json.dayHigh === 'number' ? json.dayHigh : null,
                low: typeof json.dayLow === 'number' ? json.dayLow : null,
            });

            if (json.success && json.data) {
                let history = [...json.data];

                // Inject Live Candle from Real-time Scraped Data
                if (asset && asset.currentPrice) {
                    const now = new Date();
                    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    const liveTime = Math.floor(now.getTime() / 1000);

                    // Construct a candle from real-time data
                    let currentPrice = parseFloat(asset.currentPrice);
                    let change = parseFloat(asset.change || 0);

                    if (!isNaN(currentPrice)) {
                        const lastIndex = history.length - 1;

                        // Price Discrepancy Correction
                        if (lastIndex >= 0) {
                            const lastClose = history[lastIndex].close;
                            const diffRatio = currentPrice / lastClose;
                            if (diffRatio > 8 || diffRatio < 0.12) {
                                const factor = Math.round(1 / diffRatio);
                                if (factor === 10 || factor === 100 || factor === 1000) {
                                    currentPrice *= factor;
                                    change *= factor;
                                } else {
                                    const revFactor = Math.round(diffRatio);
                                    if (revFactor === 10 || revFactor === 100 || revFactor === 1000) {
                                        currentPrice /= revFactor;
                                        change /= revFactor;
                                    }
                                }
                            }
                        }

                        let liveCandle: any = {
                            time: tf === '1H' ? liveTime : todayStr,
                            open: asset.open ? (parseFloat(asset.open) * (currentPrice / parseFloat(asset.currentPrice))) : (currentPrice - change),
                            high: asset.high ? (parseFloat(asset.high) * (currentPrice / parseFloat(asset.currentPrice))) : Math.max(currentPrice, (currentPrice - change)),
                            low: asset.low ? (parseFloat(asset.low) * (currentPrice / parseFloat(asset.currentPrice))) : Math.min(currentPrice, (currentPrice - change)),
                            close: currentPrice,
                            volume: parseInt((asset.volume || '0').replace(/[^0-9]/g, '')) || 0
                        };

                        if (lastIndex >= 0) {
                            const lastTime = history[lastIndex].time;

                            // Expansion: For 1H view, create a series of bars for today
                            if (tf === '1H') {
                                // Deduplicate: remove any daily bar for today from history before expansion
                                if (lastTime === todayStr || (typeof lastTime === 'number' && lastTime === Math.floor(new Date(todayStr).getTime() / 1000))) {
                                    history.splice(lastIndex, 1);
                                }

                                const todayHours = [];
                                const startHour = 9; // PSX Start
                                const currentHour = now.getHours();
                                const marketCloseHour = 16;

                                for (let h = startHour; h <= Math.min(currentHour, marketCloseHour); h++) {
                                    const hTime = new Date(now);
                                    hTime.setHours(h, 0, 0, 0);
                                    const hTimeSec = Math.floor(hTime.getTime() / 1000);

                                    // Progressively approach currentPrice
                                    const progress = (h - startHour + 1) / (Math.min(currentHour, marketCloseHour) - startHour + 1);
                                    const hPrice = liveCandle.open + (currentPrice - liveCandle.open) * progress;

                                    todayHours.push({
                                        ...liveCandle,
                                        time: hTimeSec,
                                        open: hPrice * 0.999,
                                        high: Math.max(hPrice, hPrice * 1.001),
                                        low: Math.min(hPrice, hPrice * 0.998),
                                        close: hPrice,
                                        volume: Math.floor(liveCandle.volume / 8)
                                    });
                                }

                                if (todayHours.length > 0) {
                                    history.push(...todayHours);
                                }
                            } else {
                                // Standard Injection logic
                                if (lastTime === liveCandle.time) {
                                    history[lastIndex] = { ...history[lastIndex], ...liveCandle };
                                } else if ((typeof lastTime === 'string' && todayStr > lastTime) ||
                                    (typeof lastTime === 'number' && liveTime > lastTime)) {
                                    history.push(liveCandle);
                                }
                            }
                        } else {
                            // If no history, show at least the live candle
                            history = [liveCandle];
                        }
                    }
                }
                setCandles(history);
            } else {
                // If history fails, still try to show a live candle
                const currentPrice = parseFloat(asset?.currentPrice);
                if (asset && !isNaN(currentPrice)) {
                    const now = new Date();
                    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    const change = parseFloat(asset.change || 0);
                    setCandles([{
                        time: tf === '1H' ? Math.floor(now.getTime() / 1000) : todayStr,
                        open: asset.open ? parseFloat(asset.open) : (currentPrice - change),
                        high: asset.high ? parseFloat(asset.high) : Math.max(currentPrice, (currentPrice - change)),
                        low: asset.low ? parseFloat(asset.low) : Math.min(currentPrice, (currentPrice - change)),
                        close: currentPrice,
                        volume: 0
                    }]);
                } else {
                    setCandles([]);
                }
                console.error('History fetch failed:', json.error);
            }
        } catch (err) {
            console.error('History fetch error:', err);
        } finally {
            setChartLoading(false);
        }
    }, []);

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch('/api/psx-stocks');
                const json = await res.json();
                const stockData = json?.data || [];
                const indexData = (json?.indices || []).map((idx: any) => ({
                    ...idx,
                    symbol: idx.name,
                    currentPrice: idx.value
                }));

                setStocks(stockData);
                setIndices(indexData);

                // Determine which asset to select
                const currentList = (searchParams.get('view') || viewMode) === 'indices' ? indexData : stockData;
                const symbolToFind = selectedSymbol || searchParams.get('symbol');

                let initial = null;
                if (symbolToFind) {
                    initial = currentList.find((s: any) => s.symbol.toLowerCase() === symbolToFind.toLowerCase());
                }

                if (!initial && currentList.length > 0) {
                    initial = currentList[0];
                }

                if (initial) {
                    setSelectedAsset(initial);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // Sync state to URL with debounce for search
    useEffect(() => {
        if (loading) return;

        const timer = setTimeout(() => {
            const params = new URLSearchParams();
            if (viewMode) params.set('view', viewMode);
            if (selectedAsset?.symbol) params.set('symbol', selectedAsset.symbol);
            if (timeframe) params.set('tf', timeframe);
            if (searchTerm) params.set('q', searchTerm);

            const queryString = params.toString();
            const currentQuery = searchParams.toString();

            if (queryString !== currentQuery) {
                router.replace(`/stocks/terminal?${queryString}`, { scroll: false });
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [viewMode, selectedAsset, timeframe, searchTerm, loading, router, searchParams]);

    useEffect(() => {
        if (selectedAsset?.symbol) {
            fetchHistory(selectedAsset.symbol, timeframe, selectedAsset);
        }
    }, [selectedAsset?.symbol, timeframe, fetchHistory, selectedAsset]);

    const displayList = viewMode === 'stocks' ? stocks : indices;
    const filteredAssets = displayList.filter(s =>
        (s.symbol || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ── Sector aggregation: performance per sector for the Sector Watch tab ──
    const parseVol = (v: any) => { const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; };
    const fmtVol = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : n.toLocaleString();
    const sectorAgg = useMemo(() => {
        const map = new Map<string, any[]>();
        stocks.forEach((s) => {
            if (!s?.symbol) return;
            const key = s.sector || 'Other';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(s);
        });
        const out: any[] = [];
        map.forEach((list, sector) => {
            let w = 0, ws = 0, adv = 0, dec = 0, unch = 0, vol = 0;
            list.forEach((s) => {
                const vv = parseVol(s.volume) || 1;
                ws += (s.changePercent || 0) * vv; w += vv; vol += parseVol(s.volume);
                if ((s.changePercent || 0) > 0) adv++; else if ((s.changePercent || 0) < 0) dec++; else unch++;
            });
            out.push({
                sector, count: list.length, avgChange: w > 0 ? ws / w : 0,
                advancers: adv, decliners: dec, unchanged: unch, totalVolume: vol,
                stocks: [...list].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0)),
            });
        });
        return out.sort((a, b) => b.totalVolume - a.totalVolume);
    }, [stocks]);

    const filteredSectors = sectorAgg.filter(x => !searchTerm || x.sector.toLowerCase().includes(searchTerm.toLowerCase()));
    const activeSector = sectorAgg.find(x => x.sector === selectedSector) || sectorAgg[0] || null;

    // Support / resistance (pivot points) for the selected asset.
    // Stocks use session high/low; indices use the fetched day high/low.
    const srHigh = viewMode === 'indices' ? dayRange.high : selectedAsset?.high;
    const srLow = viewMode === 'indices' ? dayRange.low : selectedAsset?.low;
    const srClose = selectedAsset?.currentPrice != null ? Number(selectedAsset.currentPrice) : undefined;
    const srLevels = selectedAsset ? computePivotLevels(srHigh, srLow, srClose) : null;
    const srNext = (srLevels && typeof srClose === 'number')
        ? nextLevels(srClose, srLevels)
        : { nextResistance: null as number | null, nextSupport: null as number | null };
    const srSym = viewMode === 'indices' ? '' : 'Rs.';
    const fmtSR = (v: number | null | undefined) =>
        v == null ? '—' : `${srSym}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const srPriceLines = [
        ...(srNext.nextResistance != null ? [{ price: srNext.nextResistance, color: '#ef4444', title: 'Resistance' }] : []),
        ...(srNext.nextSupport != null ? [{ price: srNext.nextSupport, color: '#22c55e', title: 'Support' }] : []),
    ];

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-app-dark flex items-center justify-center relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full"></div>
                <div className="flex flex-col items-center gap-8 relative z-10">
                    <div className="relative">
                        <div className="w-20 h-20 border-4 border-blue-600/20 rounded-full"></div>
                        <div className="w-20 h-20 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                        <div className="absolute inset-0 flex items-center justify-center text-blue-600"><Activity className="w-8 h-8" strokeWidth={2} /></div>
                    </div>
                    <div className="text-center">
                        <p className="text-zinc-900 dark:text-white font-black uppercase text-xs tracking-[0.4em] animate-pulse">{LOADING_CAPTION}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen lg:h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white flex flex-col lg:overflow-hidden selection:bg-blue-500/30">
            {/* Dynamic Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/5 dark:bg-blue-600/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/5 dark:bg-indigo-600/10 blur-[120px] rounded-full"></div>
            </div>

            {/* Minimalist Professional Header */}
            <header className="safe-top h-[calc(4rem_+_var(--sa-top))] border-b border-zinc-200 dark:border-white/5 bg-white/40 dark:bg-black/40 backdrop-blur-2xl flex items-center justify-between pl-16 pr-4 sm:pr-8 lg:pl-8 shrink-0 relative z-30">
                <div className="flex items-center gap-3 sm:gap-6">
                    <button
                        onClick={() => router.push('/stocks')}
                        aria-label="Back to PSX stocks"
                        className="shrink-0 -ml-2 w-10 h-10 flex items-center justify-center rounded-xl text-zinc-500 hover:text-blue-500 hover:bg-zinc-100 dark:hover:bg-white/5 active:scale-90 transition-all"
                    >
                        <ArrowLeft className="w-5 h-5" strokeWidth={2} />
                    </button>
                    <div className="w-[1px] h-6 bg-zinc-200 dark:bg-white/10 mx-1 sm:mx-2"></div>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 text-blue-500" strokeWidth={2} />
                        <h1 className="text-[11px] sm:text-sm font-black uppercase tracking-widest sm:tracking-[0.3em] text-zinc-900 dark:text-white/90 italic truncate max-w-[120px] sm:max-w-none">
                            Trade <span className="text-blue-500">Analytics</span>
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-4 sm:gap-8">
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="lg:hidden p-2 rounded-lg bg-blue-600/10 text-blue-600 border border-blue-500/20"
                    >
                        {isSidebarOpen ? <X className="w-5 h-5" strokeWidth={2} /> : <PanelLeft className="w-5 h-5" strokeWidth={2} />}
                    </button>
                    <div className="hidden sm:flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Live</span>
                    </div>
                    <div className="hidden lg:block text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
                        {clockTime ? `EST ${clockTime}` : ""}
                    </div>
                </div>
            </header>

            <div className="flex-1 flex lg:overflow-hidden relative h-full">
                {/* Mobile Drawer Backdrop Scrim */}
                {isSidebarOpen && (
                    <div
                        onClick={() => setIsSidebarOpen(false)}
                        className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                    />
                )}

                {/* Lateral Navigation Pane - Mobile Drawer & Desktop Sidebar */}
                <aside
                    data-testid="equity-watch-list"
                    className={`fixed lg:relative inset-y-0 left-0 w-[min(380px,calc(100vw-1rem))] h-full border-r border-zinc-200 dark:border-white/5 bg-white dark:bg-[#080808] lg:bg-white/40 lg:dark:bg-black/20 backdrop-blur-3xl lg:backdrop-blur-md flex flex-col shrink-0 overflow-hidden transform transition-transform duration-300 ease-in-out z-50 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    {/* The drawer is fixed from y=0, so on phones its first row lands
                        under the floating nav button (and the status bar cutout in the
                        native shell). Clear both before the view selector. */}
                    <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-[calc(4rem_+_var(--sa-top))] lg:pt-6 border-b border-zinc-200 dark:border-white/5 space-y-6">
                        {/* Global View Selector */}
                        <div className="flex bg-zinc-100 dark:bg-white/5 p-1 rounded-xl border border-zinc-200 dark:border-white/5">
                            <button
                                onClick={() => { setViewMode('stocks'); setSelectedAsset(stocks[0] || null); }}
                                className={`flex-1 py-2.5 text-[10px] sm:text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${viewMode === 'stocks' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-500 dark:text-zinc-500 hover:text-blue-500'}`}
                            >
                                Equity
                            </button>
                            <button
                                onClick={() => { setViewMode('sectors'); setSelectedSector((prev) => prev || sectorAgg[0]?.sector || null); }}
                                className={`flex-1 py-2.5 text-[10px] sm:text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${viewMode === 'sectors' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-500 dark:text-zinc-500 hover:text-blue-500'}`}
                            >
                                Sectors
                            </button>
                            <button
                                onClick={() => { setViewMode('indices'); setSelectedAsset(indices[0] || null); }}
                                className={`flex-1 py-2.5 text-[10px] sm:text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${viewMode === 'indices' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-500 dark:text-zinc-500 hover:text-blue-500'}`}
                            >
                                Index
                            </button>
                        </div>

                        <div className="relative group">
                            <input
                                type="text"
                                placeholder={`Filter ${viewMode === 'stocks' ? 'Equities' : viewMode === 'sectors' ? 'Sectors' : 'Indices'}...`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/5 rounded-2xl px-10 py-3 text-xs font-black uppercase tracking-widest focus:ring-2 focus:ring-blue-600 transition-all outline-none group-hover:bg-zinc-100 dark:group-hover:bg-white/[0.08] dark:text-white text-zinc-900"
                            />
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-hover:text-blue-500 transition-colors"><Search className="w-4 h-4" strokeWidth={2} /></span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar p-2 pb-12">
                        {viewMode === 'sectors' ? (
                            filteredSectors.map((sec) => {
                                const active = activeSector?.sector === sec.sector;
                                const pos = sec.avgChange >= 0;
                                const advPct = (sec.advancers / Math.max(1, sec.advancers + sec.decliners)) * 100;
                                return (
                                    <button
                                        key={sec.sector}
                                        onClick={() => { setSelectedSector(sec.sector); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                                        className={`w-full text-left p-3 sm:p-4 rounded-xl sm:rounded-2xl transition-all mb-1 ${active ? 'bg-blue-600/10 dark:bg-blue-600/20 border border-blue-500/30' : 'hover:bg-zinc-50 dark:hover:bg-white/5 border border-transparent'}`}
                                    >
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <p className={`text-[11px] font-black uppercase tracking-tight truncate ${active ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-900 dark:text-zinc-200'}`}>{sec.sector}</p>
                                            <p className={`text-xs font-black font-mono tabular-nums shrink-0 ${pos ? 'text-green-500' : 'text-red-500'}`}>{pos ? '+' : ''}{sec.avgChange.toFixed(2)}%</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-green-600 dark:text-green-400">▲{sec.advancers}</span>
                                            <span className="text-[10px] font-black text-red-600 dark:text-red-400">▼{sec.decliners}</span>
                                            <div className="flex-1 h-1 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${advPct}%` }}></div></div>
                                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest shrink-0">{sec.count}</span>
                                        </div>
                                    </button>
                                );
                            })
                        ) : (
                            filteredAssets.map((s) => (
                                <button
                                    key={s.symbol}
                                    data-testid={`stock-card-${s.symbol}`}
                                    onClick={() => { setSelectedAsset(s); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                                    className={`w-full flex items-center justify-between p-3 sm:p-4 rounded-xl sm:rounded-2xl transition-all group mb-1 ${selectedAsset?.symbol === s.symbol ? 'bg-blue-600/10 dark:bg-blue-600/20 border border-blue-500/30' : 'hover:bg-zinc-50 dark:hover:bg-white/5 border border-transparent'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black italic transition-all ${selectedAsset?.symbol === s.symbol ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30 rotate-3' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500'}`}>
                                            {s.symbol.substring(0, 2)}
                                        </div>
                                        <div className="text-left">
                                            <p className={`text-xs font-black uppercase tracking-tighter ${selectedAsset?.symbol === s.symbol ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-900 dark:text-zinc-300'}`}>{s.symbol}</p>
                                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate max-w-[120px]">{s.name || s.symbol}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-black font-mono tracking-tighter text-zinc-900 dark:text-white">{s.currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                        <p className={`text-[10px] font-black ${s.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            {s.changePercent >= 0 ? '▲' : '▼'}{Math.abs(s.changePercent).toFixed(1)}%
                                        </p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </aside>

                {/* Main Visualization Center */}
                <main className="flex-1 bg-zinc-50/50 dark:bg-black/40 flex flex-col lg:overflow-hidden relative">
                    <div className="min-h-[5rem] lg:min-h-[6rem] py-3 gap-4 bg-gradient-to-r from-transparent via-blue-900/5 to-transparent border-b border-zinc-200 dark:border-white/5 flex flex-wrap items-center justify-between px-4 sm:px-10 shrink-0">
                        {viewMode === 'sectors' && activeSector && (
                            <div className="flex flex-wrap items-center gap-4 lg:gap-10">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h2 className="text-lg sm:text-2xl font-black text-zinc-900 dark:text-white italic uppercase tracking-tighter">{activeSector.sector}</h2>
                                        <span className="px-2 py-0.5 sm:px-3 sm:py-1 bg-blue-600/20 text-blue-600 dark:text-blue-400 text-[10px] sm:text-[11px] font-black uppercase tracking-widest rounded sm:rounded-lg border border-blue-500/20">Sector</span>
                                    </div>
                                    <p className="text-zinc-500 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em]">{activeSector.count} scrips • {fmtVol(activeSector.totalVolume)} volume</p>
                                </div>
                                <div className="h-10 w-[1px] bg-zinc-200 dark:bg-white/10 hidden md:block"></div>
                                <div>
                                    <p className="text-[10px] sm:text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-1">Avg Performance</p>
                                    <p className={`text-xl sm:text-2xl font-black font-mono leading-none ${activeSector.avgChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>{activeSector.avgChange >= 0 ? '+' : ''}{activeSector.avgChange.toFixed(2)}%</p>
                                </div>
                                <div className="h-8 w-[1px] bg-zinc-200 dark:bg-white/10 hidden md:block"></div>
                                <div>
                                    <p className="text-[10px] sm:text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-1">Breadth</p>
                                    <div className="flex items-center gap-2 text-sm font-black leading-none">
                                        <span className="text-green-500">▲{activeSector.advancers}</span>
                                        <span className="text-red-500">▼{activeSector.decliners}</span>
                                        <span className="text-zinc-400">•{activeSector.unchanged}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        {viewMode !== 'sectors' && selectedAsset && (
                            <div className="flex flex-wrap items-center gap-4 lg:gap-10">
                                <div>
                                    <div className="flex items-center gap-3 sm:gap-4 mb-1">
                                        <h2 className="text-xl sm:text-3xl font-black text-zinc-900 dark:text-white italic uppercase tracking-tighter truncate max-w-[150px] sm:max-w-none">{selectedAsset.symbol}</h2>
                                        <span className="px-2 py-0.5 sm:px-3 sm:py-1 bg-blue-600/20 text-blue-600 dark:text-blue-400 text-[10px] sm:text-[11px] font-black uppercase tracking-widest rounded sm:rounded-lg border border-blue-500/20">
                                            {viewMode === 'stocks' ? 'Equity' : 'Index'}
                                        </span>
                                    </div>
                                    <p className="text-zinc-500 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] truncate max-w-[200px] sm:max-w-none">{selectedAsset.name || selectedAsset.symbol} {selectedAsset.sector ? `• ${selectedAsset.sector}` : ''}</p>
                                </div>

                                {/* Compact price + change (mobile only) */}
                                <div className="flex sm:hidden items-center gap-2">
                                    <p className="text-lg font-black font-mono text-zinc-900 dark:text-white leading-none">
                                        {viewMode === 'indices' ? '' : 'Rs.'}{selectedAsset.currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </p>
                                    <span className={`text-xs font-bold ${selectedAsset.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {selectedAsset.changePercent >= 0 ? '+' : ''}{selectedAsset.changePercent?.toFixed(2)}%
                                    </span>
                                </div>

                                <div className="h-10 w-[1px] bg-zinc-200 dark:bg-white/10 hidden md:block"></div>

                                <div className="hidden sm:flex items-center gap-4 lg:gap-10">
                                    <div>
                                        <p className="text-[10px] sm:text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-1">Current Price</p>
                                        <p className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-white leading-none">
                                            {viewMode === 'indices' ? '' : 'Rs.'}{selectedAsset.currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="h-8 w-[1px] bg-zinc-200 dark:bg-white/10"></div>
                                    <div>
                                        <p className="text-[10px] sm:text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-1">Session</p>
                                        <div className="flex items-center gap-2">
                                            <p className={`text-sm sm:text-base font-black font-mono leading-none ${selectedAsset.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                {selectedAsset.change >= 0 ? '+' : ''}{selectedAsset.change?.toFixed(2)}
                                            </p>
                                            <span className={`text-[11px] sm:text-xs font-bold ${selectedAsset.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                ({selectedAsset.changePercent >= 0 ? '+' : ''}{selectedAsset.changePercent?.toFixed(2)}%)
                                            </span>
                                        </div>
                                    </div>
                                    {viewMode === 'stocks' && selectedAsset.volume && (
                                        <>
                                            <div className="h-8 w-[1px] bg-zinc-200 dark:bg-white/10 hidden lg:block"></div>
                                            <div className="hidden lg:block">
                                                <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-1">Trading Liquidity</p>
                                                <p className="text-sm font-black font-mono text-zinc-900 dark:text-white leading-none">{selectedAsset.volume}</p>
                                            </div>
                                        </>
                                    )}
                                    {viewMode === 'indices' && (dayRange.high != null || dayRange.low != null) && (
                                        <>
                                            <div className="h-8 w-[1px] bg-zinc-200 dark:bg-white/10 hidden lg:block"></div>
                                            <div className="hidden lg:block">
                                                <p className="text-[10px] sm:text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-1">Day High / Low</p>
                                                <div className="flex items-center gap-2 leading-none">
                                                    <span className="text-sm sm:text-base font-black font-mono text-green-500">
                                                        {dayRange.high != null ? dayRange.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                                    </span>
                                                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">/</span>
                                                    <span className="text-sm sm:text-base font-black font-mono text-red-500">
                                                        {dayRange.low != null ? dayRange.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Details + Full Report */}
                        {selectedAsset && viewMode === 'stocks' && (
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => router.push(`/stocks/${encodeURIComponent(selectedAsset.symbol)}`)}
                                    className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-blue-600/10 hover:bg-blue-600 text-blue-600 hover:text-white dark:text-blue-400 dark:hover:text-white text-[10px] sm:text-[11px] font-black uppercase tracking-widest rounded-xl border border-blue-500/30 hover:border-blue-600 transition-all duration-200 group"
                                    title="Open full stock details"
                                >
                                    <LineChart className="w-4 h-4 group-hover:scale-110 transition-transform" strokeWidth={2} />
                                    <span className="hidden sm:inline">Details</span>
                                </button>
                                <button
                                    onClick={() => router.push(`/stocks/report/${selectedAsset.symbol}?exchange=PSX&from=terminal`)}
                                    className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-blue-600/10 hover:bg-blue-600 text-blue-600 hover:text-white dark:text-blue-400 dark:hover:text-white text-[10px] sm:text-[11px] font-black uppercase tracking-widest rounded-xl border border-blue-500/30 hover:border-blue-600 transition-all duration-200 group"
                                >
                                    <ClipboardList className="w-4 h-4 group-hover:scale-110 transition-transform" strokeWidth={2} />
                                    <span className="hidden sm:inline">Full Report</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 p-4 lg:p-6 relative min-h-[320px] lg:min-h-0">
                        {viewMode === 'sectors' ? (
                            <div className="absolute inset-0 p-4 lg:p-6 overflow-y-auto custom-scrollbar">
                                {activeSector ? (
                                    <div className="space-y-4">
                                        {/* Breadth summary */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                                            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-3 text-center">
                                                <p className="text-[10px] font-black text-green-600/80 dark:text-green-400/80 uppercase tracking-widest mb-0.5">Advancers</p>
                                                <p className="text-lg font-black text-green-600 dark:text-green-400 leading-none">{activeSector.advancers}</p>
                                            </div>
                                            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-center">
                                                <p className="text-[10px] font-black text-red-600/80 dark:text-red-400/80 uppercase tracking-widest mb-0.5">Decliners</p>
                                                <p className="text-lg font-black text-red-600 dark:text-red-400 leading-none">{activeSector.decliners}</p>
                                            </div>
                                            <div className="bg-zinc-500/10 border border-zinc-500/20 rounded-2xl p-3 text-center">
                                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-0.5">Unchanged</p>
                                                <p className="text-lg font-black text-zinc-600 dark:text-zinc-300 leading-none">{activeSector.unchanged}</p>
                                            </div>
                                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 text-center">
                                                <p className="text-[10px] font-black text-blue-600/80 dark:text-blue-400/80 uppercase tracking-widest mb-0.5">Volume</p>
                                                <p className="text-lg font-black text-blue-600 dark:text-blue-400 leading-none">{fmtVol(activeSector.totalVolume)}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <p className="text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">Constituents · {activeSector.count}</p>
                                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Click to open chart →</p>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 pb-4">
                                            {activeSector.stocks.map((s: any) => {
                                                const pos = (s.changePercent || 0) >= 0;
                                                return (
                                                    <button
                                                        key={s.symbol}
                                                        onClick={() => { setViewMode('stocks'); setSelectedAsset(s); }}
                                                        className={`text-left p-3 rounded-2xl border transition-all hover:scale-[1.02] hover:shadow-lg ${pos ? 'bg-green-500/[0.06] border-green-500/20 hover:border-green-500/40' : 'bg-red-500/[0.06] border-red-500/20 hover:border-red-500/40'}`}
                                                    >
                                                        <div className="flex items-center justify-between gap-1 mb-1">
                                                            <span className="text-xs font-black uppercase tracking-tighter text-zinc-900 dark:text-white truncate">{s.symbol}</span>
                                                            <span className={`text-[11px] font-black tabular-nums shrink-0 ${pos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{pos ? '▲' : '▼'}{Math.abs(s.changePercent || 0).toFixed(2)}%</span>
                                                        </div>
                                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest truncate mb-1">{s.name || s.symbol}</p>
                                                        <p className="text-sm font-black font-mono tabular-nums text-zinc-900 dark:text-white">Rs.{(s.currentPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex items-center justify-center">
                                        <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Select a sector</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="absolute inset-0 p-4 lg:p-6 flex flex-col">
                                <div className="card flex-1 overflow-hidden shadow-[0_0_50px_-12px_rgba(37,99,235,0.15)] transition-all duration-1000 relative">
                                    <div className="h-full w-full relative px-3 sm:px-5 py-2">
                                        {chartLoading && (
                                            <div className="absolute inset-0 z-20 bg-white/50 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                                    <p className="text-[11px] font-black uppercase text-blue-600 tracking-widest">Fetching Real History...</p>
                                                </div>
                                            </div>
                                        )}
                                        <TradingChart
                                            title={`${selectedAsset?.symbol} Strategic Roadmap`}
                                            data={candles}
                                            currentTimeframe={timeframe}
                                            onTimeframeChange={setTimeframe}
                                            currencySymbol={viewMode === 'indices' ? '' : 'Rs.'}
                                            seamless={true}
                                            priceLines={srPriceLines}
                                        />
                                    </div>
                                </div>

                                {/* Support / Resistance (pivot levels from session high/low) */}
                                <div className="mt-4 lg:mt-6 shrink-0 pb-2">
                                    {srLevels ? (
                                        <>
                                            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                                                <p className="text-[10px] lg:text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">Support / Resistance · Pivot Levels</p>
                                                <div className="flex items-center gap-2 sm:gap-3">
                                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                                                        <span className="text-[10px] font-black text-green-600/80 dark:text-green-400/80 uppercase tracking-widest">Next Support</span>
                                                        <span className="text-xs font-black font-mono text-green-600 dark:text-green-400 tabular-nums">{fmtSR(srNext.nextSupport)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                                                        <span className="text-[10px] font-black text-red-600/80 dark:text-red-400/80 uppercase tracking-widest">Next Resistance</span>
                                                        <span className="text-xs font-black font-mono text-red-600 dark:text-red-400 tabular-nums">{fmtSR(srNext.nextResistance)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-3">
                                                {[
                                                    { label: 'S3', val: srLevels.s3, tone: 'text-green-600 dark:text-green-400' },
                                                    { label: 'S2', val: srLevels.s2, tone: 'text-green-600 dark:text-green-400' },
                                                    { label: 'S1', val: srLevels.s1, tone: 'text-green-600 dark:text-green-400' },
                                                    { label: 'PIVOT', val: srLevels.pivot, tone: 'text-zinc-900 dark:text-white' },
                                                    { label: 'R1', val: srLevels.r1, tone: 'text-red-600 dark:text-red-400' },
                                                    { label: 'R2', val: srLevels.r2, tone: 'text-red-600 dark:text-red-400' },
                                                    { label: 'R3', val: srLevels.r3, tone: 'text-red-600 dark:text-red-400' },
                                                ].map((lvl) => (
                                                    <div key={lvl.label} className="card-inset px-2 py-2 sm:py-2.5 text-center backdrop-blur-md">
                                                        <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-0.5">{lvl.label}</p>
                                                        <p className={`text-[11px] lg:text-xs font-black font-mono tabular-nums truncate ${lvl.tone}`}>{fmtSR(lvl.val)}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="card-inset px-4 py-4 text-center backdrop-blur-md">
                                            <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Support / resistance unavailable — no session range yet</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 10px;
                }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.05);
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(0, 0, 0, 0.2);
                }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
            `}</style>
        </div>
    );
}
