"use client";

import { Star, Folder, Trash2, BarChart3, Plus, X } from "lucide-react";

import PageSkeleton from "../components/PageSkeleton";
import { useState, useEffect } from "react";
import StockCard from "../components/StockCard";
import PriceCard from "../components/PriceCard";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { useSettings } from "../context/SettingsContext";
import CurrencyToggle from "../components/CurrencyToggle";
import { MARKET_CURRENCY } from "../lib/currency";
import WatchlistAddBar from "../components/WatchlistAddBar";
import { fetchAllPrices, priceKey, type PriceBook, type AssetType } from "../lib/prices";

const TYPE_LABEL: Record<AssetType, string> = {
  PSX: "PSX Stock", NASDAQ: "NASDAQ", CRYPTO: "Crypto", FOREX: "Forex", COMMODITY: "Metals / Commodity",
};
const TYPE_OPTIONS: AssetType[] = ["PSX", "NASDAQ", "CRYPTO", "FOREX", "COMMODITY"];

export default function WatchlistPage() {
  const { success, error } = useToast();
  const confirm = useConfirm();
  const { settings } = useSettings();
  const [watchlists, setWatchlists] = useState<any[]>([]);
  const [selectedWlId, setSelectedWlId] = useState<string | null>(null);
  const [stocksData, setStocksData] = useState<any[]>([]);
  const [book, setBook] = useState<PriceBook>({ map: {}, rate: 278, updated: "" });
  const [loading, setLoading] = useState(true);

  // Create-category form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AssetType>("PSX");

  const activeWatchlist = watchlists.find(wl => wl._id === selectedWlId) || watchlists[0];

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [wlRes, stockRes] = await Promise.all([
        fetch('/api/watchlists'),
        fetch('/api/psx-stocks'),
      ]);

      const wlJson = await wlRes.json();
      const stockJson = await stockRes.json();

      if (wlJson.success) {
        setWatchlists(wlJson.data);
        if (wlJson.data.length > 0 && !selectedWlId) {
          setSelectedWlId(wlJson.data[0]._id);
        }
      }

      setStocksData(stockJson.data || []);
    } catch (err) {
      console.error("Failed to load watchlist data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Multi-asset price book — powers non-PSX cards and the add-bar's per-type search.
  useEffect(() => {
    let active = true;
    const load = async () => { const b = await fetchAllPrices(); if (active) setBook(b); };
    load();
    const iv = settings.refreshInterval && settings.refreshInterval > 0
      ? setInterval(load, Math.max(30, settings.refreshInterval) * 1000)
      : null;
    return () => { active = false; if (iv) clearInterval(iv); };
  }, [settings.refreshInterval]);

  const handleRemoveSymbol = async (watchlistId: string, symbol: string) => {
    const wl = watchlists.find(w => w._id === watchlistId);
    if (!wl || !symbol) return;
    const currentSymbols = wl.symbols || [];
    const newSymbols = currentSymbols.filter((s: string) => s !== symbol.toUpperCase());

    try {
      const res = await fetch(`/api/watchlists/${watchlistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: newSymbols })
      });
      const json = await res.json();
      if (json.success) {
        setWatchlists(watchlists.map(w => w._id === watchlistId ? json.data : w));
        success(`${symbol.toUpperCase()} removed from "${wl.name}"`);
      } else {
        error(json.error || "Couldn't remove symbol");
      }
    } catch (err) {
      console.error("Error removing symbol", err);
      error("Network error — couldn't remove symbol");
    }
  };

  const handleAddToWatchlist = async (watchlistId: string, symbol: string, type?: AssetType) => {
    const watchlist = watchlists.find(wl => wl._id === watchlistId);
    if (!watchlist || !symbol) return;
    const currentSymbols = watchlist.symbols || [];
    if (currentSymbols.includes(symbol.toUpperCase())) return;
    const newSymbols = [...currentSymbols, symbol.toUpperCase()];
    // The first symbol locks the category's market type; later adds keep it.
    const newType: AssetType = currentSymbols.length === 0 && type ? type : (watchlist.type || 'PSX');

    try {
      const res = await fetch(`/api/watchlists/${watchlistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: newSymbols, type: newType }),
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

  const handleCreateWatchlist = async () => {
    const name = newName.trim();
    if (!name) { error("Enter a category name"); return; }
    try {
      const res = await fetch('/api/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: newType, symbols: [] }),
      });
      const json = await res.json();
      if (json.success) {
        setWatchlists([json.data, ...watchlists]);
        setSelectedWlId(json.data._id);
        setNewName("");
        setNewType("PSX");
        setShowCreate(false);
        success(`Category "${name}" created — ${TYPE_LABEL[newType]}`);
      } else {
        error(json.error || "Couldn't create category");
      }
    } catch (err) {
      console.error('Failed to create category', err);
      error("Network error — couldn't create category");
    }
  };

  const handleDeleteWatchlist = async (id: string) => {
    const target = watchlists.find(w => w._id === id);
    if (!(await confirm({
      title: `Delete watchlist${target?.name ? ` "${target.name}"` : ""}?`,
      message: "Its saved symbols will be removed too.",
      destructive: true,
    }))) return;
    try {
      const res = await fetch(`/api/watchlists/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        const remaining = watchlists.filter(w => w._id !== id);
        setWatchlists(remaining);
        if (remaining.length > 0) setSelectedWlId(remaining[0]._id);
        else setSelectedWlId(null);
        success(`Watchlist "${target?.name ?? ''}" deleted`);
      } else {
        error(json.error || "Couldn't delete watchlist");
      }
    } catch (err) {
      console.error("Error deleting watchlist", err);
      error("Network error — couldn't delete watchlist");
    }
  };

  // Each category renders by its market type: PSX as rich StockCards (full OHLC),
  // every other market as a PriceCard priced from the multi-asset book.
  const activeType: AssetType = (activeWatchlist?.type || 'PSX') as AssetType;
  const watchlistItems = (activeWatchlist?.symbols || []).map((sym: string) => {
    if (activeType === 'PSX') {
      const live = stocksData.find((s: any) => s.symbol?.toUpperCase() === sym.toUpperCase());
      if (live) return { kind: 'stock', ...live };
    }
    const info = book.map[priceKey(activeType, sym)];
    return {
      kind: 'price',
      symbol: sym,
      title: info?.name || sym,
      usdPrice: info?.usd ?? undefined,
      pkrPrice: info?.pkr ?? undefined,
      change: info && info.changePct != null ? ((info.usd ?? info.pkr ?? 0) * (info.changePct / 100)) : 0,
      changePercent: info?.changePct ?? 0,
    };
  });

  // Calculations
  const totalItems = watchlistItems.length;
  const avgChange = totalItems > 0
    ? watchlistItems.reduce((acc: number, curr: any) => acc + (curr.changePercent || 0), 0) / totalItems
    : 0;

  const bestPerformer = [...watchlistItems].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))[0];
  const worstPerformer = [...watchlistItems].sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0))[0];

  if (loading && stocksData.length === 0) return <PageSkeleton variant="cards" />;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white">
      {/* Header */}
      <header className="safe-top sticky top-0 z-50 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
        {/* One row at every width — the currency pill sits beside the heading on
            phones too, rather than dropping to a second line. */}
        <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-black tracking-tighter italic uppercase text-zinc-900 dark:text-white leading-none flex items-center gap-2 sm:gap-2.5">
              <Star className="w-5 h-5 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400 shrink-0" strokeWidth={2} /> My <span className="text-blue-500">Watchlists</span>
            </h1>
            <p className="text-zinc-500 dark:text-zinc-500 text-[10px] sm:text-xs font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] mt-1 leading-relaxed">
              Personalized Asset Monitoring Engine
            </p>
          </div>
          {/* PSX and NASDAQ categories ignore this — they render in PKR / USD. */}
          <div className="shrink-0"><CurrencyToggle /></div>
        </div>
      </header>

      {/* Watchlist Hub Tabs */}
      <div className="bg-zinc-100 dark:bg-black/30 backdrop-blur-sm border-b border-zinc-200 dark:border-white/5 px-4 sm:px-8 py-2 overflow-x-auto no-scrollbar flex items-center gap-2">
        {watchlists.map(wl => (
          <button
            key={wl._id}
            onClick={() => setSelectedWlId(wl._id)}
            className={`px-4 py-2 rounded-lg text-xs font-black whitespace-nowrap transition-all flex items-center gap-2 ${selectedWlId === wl._id
              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/10"
              : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
          >
            <Folder className="w-3.5 h-3.5 shrink-0" strokeWidth={2} /> {wl.name}
            <span className={`px-1 py-0.5 rounded text-[10px] uppercase tracking-wider ${selectedWlId === wl._id ? 'bg-white/20 text-white' : 'bg-blue-500/10 text-blue-500'}`}>
              {wl.type || 'PSX'}
            </span>
            <span className={`px-1.5 py-0.5 rounded-md text-[11px] ${selectedWlId === wl._id ? 'bg-white/20' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
              {wl.symbols?.length || 0}
            </span>
          </button>
        ))}
        <button
          onClick={() => setShowCreate(s => !s)}
          className={`px-3 py-2 rounded-lg text-xs font-black whitespace-nowrap flex items-center gap-1.5 border border-dashed transition-all ${showCreate ? 'bg-blue-600 text-white border-blue-600' : 'text-blue-600 dark:text-blue-400 border-blue-500/40 hover:bg-blue-500/10'}`}
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> New
        </button>
        {watchlists.length > 0 && (
          <button
            onClick={() => handleDeleteWatchlist(selectedWlId!)}
            className="ml-auto p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
            title="Delete this category"
          >
            <Trash2 className="w-4 h-4" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Create-category form */}
      {showCreate && (
        <div className="bg-white dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-white/5 px-4 sm:px-8 py-3">
          <div className="page-shell mx-auto flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest shrink-0">New Category</span>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateWatchlist()}
              placeholder="Name (e.g. Tech Bets, Metals)"
              autoFocus
              className="flex-1 min-w-[160px] px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-900 dark:text-white placeholder-zinc-400 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select value={newType} onChange={e => setNewType(e.target.value as AssetType)} className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-black text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 shrink-0" title="Market type for this category">
              {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <button onClick={handleCreateWatchlist} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shrink-0">Create</button>
            <button onClick={() => { setShowCreate(false); setNewName(""); }} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 shrink-0" title="Cancel"><X className="w-4 h-4" strokeWidth={2} /></button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="page-shell mx-auto p-4 sm:p-8">
        {/* Add symbols to a chosen watchlist — they render as cards below */}
        {watchlists.length > 0 && (
          <div className="mb-6 sm:mb-8">
            <WatchlistAddBar
              watchlists={watchlists}
              activeId={selectedWlId ?? activeWatchlist?._id ?? null}
              book={book}
              onAdd={handleAddToWatchlist}
              onSelectCategory={setSelectedWlId}
            />
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : watchlists.length === 0 ? (
          <div className="card p-8 sm:p-16 text-center">
            <Star className="w-10 h-10 mx-auto mb-6 text-zinc-400" strokeWidth={1.5} />
            <h2 className="text-xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-50 mb-3 uppercase tracking-tighter">
              No Categories Yet
            </h2>
            <p className="text-zinc-500 font-medium mb-8 max-w-md mx-auto">
              Create a watchlist category — pick a market (PSX, Metals, Forex, Crypto, NASDAQ) and add symbols to it. Each category tracks one market.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} /> Create Category
            </button>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {watchlistItems.map((item: any) => (
                <div key={item.symbol || item.id} className="relative group/wrapper">
                  <button
                    onClick={() => handleRemoveSymbol(selectedWlId!, item.symbol)}
                    className="absolute -top-2 -right-2 z-50 bg-white dark:bg-zinc-800 text-red-500 rounded-full w-8 h-8 flex items-center justify-center font-bold shadow-xl border border-zinc-200 dark:border-zinc-700 opacity-100 sm:opacity-0 sm:group-hover/wrapper:opacity-100 transition-all hover:bg-red-50"
                    title="Remove from Watchlist"
                  >
                    <X className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                  {item.kind === 'stock' ? (
                    <StockCard
                      {...item}
                      watchlists={watchlists}
                      onAddToWatchlist={handleAddToWatchlist}
                      onRemoveFromWatchlist={handleRemoveSymbol}
                      onWatchlistCreated={(newList) => setWatchlists([newList, ...watchlists])}
                    />
                  ) : (
                    // NASDAQ categories stay in USD; everything else follows the display currency.
                    <PriceCard {...item} currency={MARKET_CURRENCY[activeType]} lastUpdated={book.updated || "Live"} />
                  )}
                </div>
              ))}
              {watchlistItems.length === 0 && (
                <div className="col-span-full py-16 text-center bg-zinc-100/50 dark:bg-zinc-900/50 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                  <p className="text-zinc-400 font-black uppercase tracking-widest text-xs">This {TYPE_LABEL[activeType]} watchlist is empty</p>
                  <p className="text-zinc-500 text-sm mt-1">Use “Add to Watchlist” above to add {TYPE_LABEL[activeType]} symbols</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats & Insights */}
        {watchlistItems.length > 0 && (
          <div className="mt-8 sm:mt-12 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-sm rounded-2xl sm:rounded-[3rem] shadow-2xl p-5 sm:p-10 border border-zinc-200 dark:border-white/5">
            <div className="flex items-center gap-3 mb-6 sm:mb-10">
              <BarChart3 className="w-6 h-6 text-blue-500 shrink-0" strokeWidth={2} />
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white italic uppercase tracking-tighter">
                Portfolio <span className="text-blue-500">Intelligence</span>
              </h2>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-8">
              <div className="bg-zinc-100 dark:bg-white/5 p-4 sm:p-8 rounded-[2rem] border border-zinc-200 dark:border-white/5 group hover:bg-zinc-200 dark:hover:bg-white/[0.08] transition-all">
                <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-3">Active Monitors</p>
                <div className="flex items-end gap-2">
                  <p className="text-3xl sm:text-5xl font-black text-zinc-900 dark:text-white tracking-tighter italic">{watchlistItems.length}</p>
                  <p className="text-[11px] font-black text-zinc-500 pb-2 uppercase tracking-widest">Assets</p>
                </div>
              </div>

              <div className="bg-zinc-100 dark:bg-white/5 p-4 sm:p-8 rounded-[2rem] border border-zinc-200 dark:border-white/5 group hover:bg-zinc-200 dark:hover:bg-white/[0.08] transition-all">
                <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-3">Session Alpha</p>
                <div className="flex items-end gap-1">
                  <p className={`text-3xl sm:text-5xl font-black tracking-tighter italic ${avgChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
                  </p>
                </div>
              </div>

              {bestPerformer && (
                <div className="bg-green-500/5 p-4 sm:p-8 rounded-[2rem] border border-green-500/10 group hover:bg-green-500/10 transition-all">
                  <p className="text-[11px] font-black text-green-500/70 uppercase tracking-[0.2em] mb-3">Alpha Leader</p>
                  <p className="text-2xl font-black text-green-400 truncate tracking-tight uppercase italic">{bestPerformer.symbol}</p>
                  <p className="text-lg font-black text-green-500 font-mono mt-1">+{bestPerformer.changePercent?.toFixed(2)}%</p>
                </div>
              )}

              {worstPerformer && (
                <div className="bg-red-500/5 p-4 sm:p-8 rounded-[2rem] border border-red-500/10 group hover:bg-red-500/10 transition-all">
                  <p className="text-[11px] font-black text-red-500/70 uppercase tracking-[0.2em] mb-3">Session Laggard</p>
                  <p className="text-2xl font-black text-red-400 truncate tracking-tight uppercase italic">{worstPerformer.symbol}</p>
                  <p className="text-lg font-black text-red-500 font-mono mt-1">{worstPerformer.changePercent?.toFixed(2)}%</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
