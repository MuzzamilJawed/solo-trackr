"use client";

import { Fuel, AlertTriangle, Award, TrendingDown, Search, Bell, LineChart, X } from "lucide-react";

import PageSkeleton from "../components/PageSkeleton";
import { usePullRefresh } from "../lib/pullRefresh";

import PriceCard from "../components/PriceCard";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "../context/SettingsContext";
import { useCurrency } from "../context/CurrencyContext";
import CurrencyToggle from "../components/CurrencyToggle";
import FitText from "../components/FitText";
import FreshnessBadge from "../components/FreshnessBadge";
import { rateOf } from "../lib/currency";
import { useToast } from "../context/ToastContext";
import { fetchOilPrices } from "../lib/api";
import { type OilAlert, type AlertCondition, loadAlerts, persistAlerts, makeAlertId } from "../lib/oilAlerts";

type SortKey = "name" | "price" | "changePercent" | "weekly" | "monthly" | "yearly";

export default function OilPage() {
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [error, setError] = useState("");
  const [oilPrices, setOilPrices] = useState<any[]>([]);
  const [allEnergy, setAllEnergy] = useState<any[]>([]);
  const { settings } = useSettings();
  const { success, info, error: toastError } = useToast();
  const { currency: tableCurrency, sym, conv, rates } = useCurrency();
  const router = useRouter();

  // Table controls
  const [tableSearch, setTableSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'changePercent', dir: 'desc' });

  // Alerts
  const [alerts, setAlerts] = useState<OilAlert[]>([]);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertKey, setAlertKey] = useState("");
  const [alertCondition, setAlertCondition] = useState<AlertCondition>("above");
  const [alertPrice, setAlertPrice] = useState("");

  const loadPrices = useCallback(async (isManual = true) => {
    try {
      if (isManual) setLoading(true);
      setError("");

      const data = await fetchOilPrices();

      if (!data) {
        setRefreshFailed(true);
        if (isManual) setError("Could not fetch energy market data.");
        return;
      }

      const now = Date.now();
      const featuredKeys = ['crudeOil', 'brentOil', 'naturalGas', 'heatingOil'];
      const updatedPrices = featuredKeys.map(key => {
        const item = data[key];
        return {
          key,
          title: item?.name || key,
          usdPrice: item?.price,
          pkrPrice: item?.pkrPrice,
          change: item?.change ?? 0,
          changePercent: item?.changePercent ?? 0,
          lastUpdated: new Date(now).toLocaleString(),
          isLoading: !item,
        };
      });

      setOilPrices(updatedPrices);
      setAllEnergy(data.allEnergy || []);
      setFetchedAt(now);
      setRefreshFailed(false);

    } catch (err) {
      console.error("Failed to fetch oil prices:", err);
      setRefreshFailed(true);
      if (isManual) setError("An error occurred while fetching energy data.");
    } finally {
      if (isManual) setLoading(false);
    }
  }, [tableCurrency]);

  usePullRefresh(() => loadPrices(false));

  const openDetail = (item: any) => {
    router.push(`/oil/${item.key}`);
  };

  const formatPrice = (val: number) => {
    return val.toLocaleString(undefined, {
      minimumFractionDigits: val < 10 ? 4 : 2,
      maximumFractionDigits: val < 10 ? 4 : 2
    });
  };

  useEffect(() => {
    loadPrices(true);
  }, [tableCurrency]);

  useEffect(() => {
    if (!settings.refreshInterval || settings.refreshInterval <= 0) return;
    const interval = setInterval(() => loadPrices(false), settings.refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [settings.refreshInterval, loadPrices]);

  // Load persisted alerts once on mount
  useEffect(() => {
    setAlerts(loadAlerts());
  }, []);

  // ─── Real market intelligence, derived from live feeds ──────────────────────
  const intel = useMemo(() => {
    const list = allEnergy.filter((i) => typeof i.changePercent === 'number');
    const total = list.length;
    const advancers = list.filter((i) => (i.changePercent || 0) > 0).length;
    const decliners = list.filter((i) => (i.changePercent || 0) < 0).length;
    const unchanged = total - advancers - decliners;
    const avg = total ? list.reduce((s, i) => s + (i.changePercent || 0), 0) / total : 0;
    const byChange = [...list].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
    const top = byChange[0];
    const bottom = byChange[byChange.length - 1];
    const volatile = [...list].sort((a, b) => Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0))[0];
    return { total, advancers, decliners, unchanged, avg, top, bottom, volatile };
  }, [allEnergy]);

  // ─── Evaluate alerts against live prices; toast on newly triggered ──────────
  useEffect(() => {
    if (allEnergy.length === 0 || alerts.length === 0) return;
    const fired: string[] = [];
    let changed = false;
    const next = alerts.map((al) => {
      const item = allEnergy.find((i) => i.key === al.key);
      if (!item || typeof item.price !== 'number') return al;
      const hit = al.condition === 'above' ? item.price >= al.targetUsd : item.price <= al.targetUsd;
      if (hit !== al.triggered) {
        changed = true;
        if (hit) fired.push(`${al.name} moved ${al.condition} your target`);
        return { ...al, triggered: hit };
      }
      return al;
    });
    if (changed) {
      setAlerts(next);
      persistAlerts(next);
      fired.forEach((m) => success(`${m}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEnergy]);

  const rateFor = (key: string) => {
    const item = allEnergy.find((i) => i.key === key);
    if (item?.pkrPrice && item?.price) return item.pkrPrice / item.price;
    return rateOf(rates, 'PKR');
  };

  // Alerts are stored in USD; show and accept them in the active currency.
  const displayTarget = (al: OilAlert) => {
    const val = conv(al.targetUsd, al.targetUsd * rateFor(al.key)) ?? 0;
    return `${sym}${formatPrice(val)}`;
  };

  const handleAddAlert = () => {
    const key = alertKey || allEnergy[0]?.key;
    const item = allEnergy.find((i) => i.key === key);
    const parsed = parseFloat(alertPrice.replace(/,/g, ""));
    if (!item || !Number.isFinite(parsed) || parsed <= 0) {
      toastError("Enter a valid target price");
      return;
    }
    const rate = item.pkrPrice && item.price ? item.pkrPrice / item.price : rateOf(rates, 'PKR');
    const targetUsd = tableCurrency === 'USD' ? parsed
      : tableCurrency === 'PKR' ? parsed / rate
        : parsed / rateOf(rates, tableCurrency);
    const triggered = alertCondition === 'above' ? item.price >= targetUsd : item.price <= targetUsd;
    const newAlert: OilAlert = {
      id: makeAlertId(),
      key,
      name: item.name,
      condition: alertCondition,
      targetUsd,
      createdAt: Date.now(),
      triggered,
    };
    const next = [newAlert, ...alerts];
    setAlerts(next);
    persistAlerts(next);
    success(`Alert set — ${item.name} ${alertCondition} ${sym}${formatPrice(parsed)}`);
    setAlertPrice("");
    setShowAlertForm(false);
  };

  const handleRemoveAlert = (id: string) => {
    const removed = alerts.find((a) => a.id === id);
    const next = alerts.filter((a) => a.id !== id);
    setAlerts(next);
    persistAlerts(next);
    info(`Alert removed${removed ? ` — ${removed.name}` : ''}`);
  };

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  };

  // ─── Filtered + sorted table rows ───────────────────────────────────────────
  const visibleEnergy = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    let list = allEnergy.filter((i) => !q || (i.name || '').toLowerCase().includes(q) || (i.key || '').toLowerCase().includes(q));
    const dir = sort.dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sort.key === 'name') return (a.name || '').localeCompare(b.name || '') * dir;
      const av = sort.key === 'price' ? (a.price || 0) : (a[sort.key] || 0);
      const bv = sort.key === 'price' ? (b.price || 0) : (b[sort.key] || 0);
      return (av - bv) * dir;
    });
    return list;
  }, [allEnergy, tableSearch, sort]);

  const maxAbsChange = useMemo(
    () => Math.max(1, ...allEnergy.map((i) => Math.abs(i.changePercent || 0))),
    [allEnergy]
  );

  if (loading && oilPrices.length === 0) return <PageSkeleton variant="cards" />;

  const SortArrow = ({ k }: { k: SortKey }) => (
    <span className={`ml-1 text-[10px] ${sort.key === k ? 'text-blue-500' : 'text-zinc-300 dark:text-zinc-600'}`}>
      {sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-app-dark selection:bg-blue-500/30 overflow-x-clip">
      {/* Header */}
      <div className="safe-top sticky top-0 z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 shadow-sm w-full">
        <div className="pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6 page-shell mx-auto">
          <div className="flex flex-row justify-between items-center gap-3 sm:gap-6">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-3xl font-black text-zinc-900 dark:text-zinc-50 flex items-center gap-2 tracking-tighter uppercase italic min-w-0">
                <Fuel className="w-5 h-5 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400 shrink-0" strokeWidth={2} />
                <FitText className="min-w-0 flex-1">Energy Markets</FitText>
                {/* Decorative on a phone — the status line below already says it's live. */}
                <span className="hidden sm:inline-block bg-blue-600 text-white text-[11px] font-black px-2 py-0.5 rounded uppercase tracking-widest animate-pulse shrink-0">
                  Live
                </span>
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400 text-[11px] font-black uppercase tracking-[0.2em] mt-1 sm:mt-2 flex items-center gap-2">
                <span className={`w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full ${loading ? 'bg-amber-500' : 'bg-green-500'} animate-pulse`}></span>
                <FreshnessBadge fetchedAt={fetchedAt} failed={refreshFailed} loading={loading} onRetry={() => loadPrices(true)} />
              </p>
            </div>
            {/* Top-right controls: chart shortcut replaces the full-width Graph
                Analysis banner that used to sit in the page body. */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => router.push('/oil/analysis')}
                aria-label="Open graph analysis"
                title="Graph analysis — candlestick, momentum, performance matrix"
                className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-90 transition-all"
              >
                <LineChart className="w-[18px] h-[18px]" strokeWidth={2.5} />
              </button>
              <CurrencyToggle />
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-8 pb-32 page-shell mx-auto w-full space-y-6 sm:space-y-12">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-6 flex items-center gap-4">
            <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" strokeWidth={2} />
            <p className="text-red-500 font-black uppercase text-xs tracking-widest">{error}</p>
          </div>
        )}

        {/* ── Market Breadth strip (real, computed) ── */}
        {intel.total > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            <div className="card p-4 sm:p-6">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2">Session Bias</p>
              <p className={`text-2xl sm:text-3xl font-black italic tracking-tighter ${intel.avg >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {intel.avg >= 0 ? '+' : ''}{intel.avg.toFixed(2)}%
              </p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Avg across {intel.total} feeds</p>
            </div>
            <div className="card p-4 sm:p-6">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2">Breadth</p>
              <div className="flex items-end gap-2">
                <span className="text-xl sm:text-2xl font-black text-green-500 tabular-nums">{intel.advancers}</span>
                <span className="text-zinc-400 text-xs font-black mb-0.5">/</span>
                <span className="text-xl sm:text-2xl font-black text-red-500 tabular-nums">{intel.decliners}</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex">
                <div className="h-full bg-green-500" style={{ width: `${(intel.advancers / intel.total) * 100}%` }} />
                <div className="h-full bg-zinc-300 dark:bg-zinc-600" style={{ width: `${(intel.unchanged / intel.total) * 100}%` }} />
                <div className="h-full bg-red-500" style={{ width: `${(intel.decliners / intel.total) * 100}%` }} />
              </div>
            </div>
            {intel.top && (
              <button onClick={() => openDetail(intel.top)} className="text-left bg-green-500/[0.06] rounded-2xl sm:rounded-[2rem] border border-green-500/15 p-4 sm:p-6 shadow-sm hover:bg-green-500/10 transition-colors">
                <p className="text-[10px] font-black text-green-600/70 dark:text-green-400/70 uppercase tracking-[0.2em] mb-2 inline-flex items-center gap-1.5"><Award className="w-3.5 h-3.5 shrink-0" strokeWidth={2} /> Top Gainer</p>
                <p className="text-base sm:text-lg font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter truncate">{intel.top.name}</p>
                <p className="text-sm font-black text-green-500 font-mono mt-0.5">+{Math.abs(intel.top.changePercent || 0).toFixed(2)}%</p>
              </button>
            )}
            {intel.bottom && (
              <button onClick={() => openDetail(intel.bottom)} className="text-left bg-red-500/[0.05] rounded-2xl sm:rounded-[2rem] border border-red-500/15 p-4 sm:p-6 shadow-sm hover:bg-red-500/10 transition-colors">
                <p className="text-[10px] font-black text-red-600/70 dark:text-red-400/70 uppercase tracking-[0.2em] mb-2 inline-flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5 shrink-0" strokeWidth={2} /> Top Loser</p>
                <p className="text-base sm:text-lg font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter truncate">{intel.bottom.name}</p>
                <p className="text-sm font-black text-red-500 font-mono mt-0.5">{(intel.bottom.changePercent || 0).toFixed(2)}%</p>
              </button>
            )}
          </div>
        )}

        {/* Price Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-8">
          {oilPrices.map((oil) => (
            <div key={oil.title} className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95" onClick={() => {
              const fullItem = allEnergy.find(i => i.name === oil.title);
              if (fullItem) openDetail(fullItem);
            }}>
              <PriceCard {...oil} />
            </div>
          ))}
        </div>

        {/* Detailed Energy Table Section */}
        <div className="card overflow-hidden">
          <div className="p-5 sm:p-8 border-b border-zinc-200 dark:border-zinc-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-50 uppercase italic tracking-tighter">Energy Contracts Feed</h2>
              <p className="text-zinc-500 text-[11px] font-black uppercase tracking-widest mt-1">Satellite Comparison Benchmark</p>
            </div>
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-3.5 h-3.5" strokeWidth={2} />
                <input
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Search contract..."
                  className="w-full lg:w-56 bg-zinc-100 dark:bg-zinc-800 rounded-xl pl-8 pr-3 py-2.5 text-[11px] font-bold text-zinc-900 dark:text-white placeholder-zinc-400 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div className="text-[11px] font-black text-blue-500 border border-blue-500/20 px-4 py-2.5 rounded-xl uppercase tracking-widest bg-blue-500/5 whitespace-nowrap">
                {visibleEnergy.length}/{allEnergy.length} Feeds
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-white/5 text-[11px] sm:text-xs font-black text-zinc-500 uppercase tracking-[0.2em] bg-zinc-50/50 dark:bg-white/5">
                  <th className="px-4 sm:px-8 py-3 sm:py-5 cursor-pointer select-none hover:text-blue-500 transition-colors" onClick={() => toggleSort('name')}>Scrip<SortArrow k="name" /></th>
                  <th className="px-4 sm:px-8 py-3 sm:py-5 text-right cursor-pointer select-none hover:text-blue-500 transition-colors" onClick={() => toggleSort('price')}>Price<SortArrow k="price" /></th>
                  <th className="px-4 sm:px-8 py-3 sm:py-5 text-right cursor-pointer select-none hover:text-blue-500 transition-colors" onClick={() => toggleSort('changePercent')}>24h%<SortArrow k="changePercent" /></th>
                  <th className="px-4 sm:px-8 py-3 sm:py-5 text-center hidden sm:table-cell cursor-pointer select-none hover:text-blue-500 transition-colors" onClick={() => toggleSort('weekly')}>Weekly<SortArrow k="weekly" /></th>
                  <th className="px-4 sm:px-8 py-3 sm:py-5 text-center hidden sm:table-cell cursor-pointer select-none hover:text-blue-500 transition-colors" onClick={() => toggleSort('monthly')}>Monthly<SortArrow k="monthly" /></th>
                  <th className="px-4 sm:px-8 py-3 sm:py-5 text-center hidden md:table-cell cursor-pointer select-none hover:text-blue-500 transition-colors" onClick={() => toggleSort('yearly')}>YoY<SortArrow k="yearly" /></th>
                  <th className="px-4 sm:px-8 py-3 sm:py-5 text-right hidden lg:table-cell">Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-white/5">
                {visibleEnergy.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-8 py-16 text-center">
                      <p className="text-zinc-400 font-black uppercase tracking-widest text-[11px]">No contracts match "{tableSearch}"</p>
                    </td>
                  </tr>
                ) : visibleEnergy.map((item) => {
                  const isPos = (item.changePercent || 0) >= 0;
                  const barPct = Math.min(100, (Math.abs(item.changePercent || 0) / maxAbsChange) * 100);
                  return (
                    <tr key={item.key} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group cursor-pointer" onClick={() => openDetail(item)}>
                      <td className="px-4 sm:px-8 py-3 sm:py-5">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${item.change >= 0 ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
                          <span className="font-black text-zinc-900 dark:text-white tracking-tight uppercase italic text-[11px] sm:text-sm">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-8 py-3 sm:py-5 text-right font-mono font-black text-zinc-900 dark:text-zinc-400 group-hover:text-blue-500 text-[11px] sm:text-sm">
                        {sym}
                        {formatPrice(conv(item.price, item.pkrPrice) ?? 0)}
                      </td>
                      <td className="px-4 sm:px-8 py-3 sm:py-5">
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[11px] sm:text-xs font-black ${isPos ? 'text-green-500' : 'text-red-500'}`}>
                            {isPos ? '▲' : '▼'}{Math.abs(item.changePercent).toFixed(1)}%
                          </span>
                          <div className="w-16 h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden hidden sm:block">
                            <div className={`h-full rounded-full ${isPos ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${barPct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 sm:px-8 py-3 sm:py-5 text-center text-[11px] sm:text-xs font-bold hidden sm:table-cell ${item.weekly >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.weekly > 0 ? '+' : ''}{item.weekly}%
                      </td>
                      <td className={`px-4 sm:px-8 py-3 sm:py-5 text-center text-[11px] sm:text-xs font-bold hidden sm:table-cell ${item.monthly >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.monthly > 0 ? '+' : ''}{item.monthly}%
                      </td>
                      <td className={`px-4 sm:px-8 py-3 sm:py-5 text-center text-[11px] sm:text-xs font-bold hidden md:table-cell ${(item.yearly || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(item.yearly || 0) > 0 ? '+' : ''}{item.yearly || 0}%
                      </td>
                      <td className="px-4 sm:px-8 py-3 sm:py-5 text-right text-[11px] font-black text-zinc-500 uppercase tracking-widest hidden lg:table-cell">
                        {item.date || 'Live'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Market Intelligence & Price Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12 items-start">
          {/* Real market intelligence */}
          <div className="bg-zinc-900 text-white rounded-2xl sm:rounded-[3rem] p-5 sm:p-10 relative overflow-hidden border border-white/5">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-600/20 to-transparent pointer-events-none"></div>
            <h3 className="relative z-10 text-xl font-black uppercase italic tracking-tighter mb-6">Market Intelligence</h3>
            <div className="relative z-10 space-y-5">
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <span className="text-[11px] font-black uppercase text-zinc-500 tracking-widest">Active Feeds</span>
                <span className="font-mono font-black">{intel.total}</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <span className="text-[11px] font-black uppercase text-zinc-500 tracking-widest">Advancing</span>
                <span className="font-mono font-black text-green-500">{intel.advancers} ▲</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <span className="text-[11px] font-black uppercase text-zinc-500 tracking-widest">Declining</span>
                <span className="font-mono font-black text-red-500">{intel.decliners} ▼</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <span className="text-[11px] font-black uppercase text-zinc-500 tracking-widest">Avg 24h Move</span>
                <span className={`font-mono font-black ${intel.avg >= 0 ? 'text-green-500' : 'text-red-500'}`}>{intel.avg >= 0 ? '+' : ''}{intel.avg.toFixed(2)}%</span>
              </div>
              {intel.volatile && (
                <div className="pt-2">
                  <p className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1">Most Volatile</p>
                  <div className="flex items-center justify-between">
                    <span className="font-black uppercase italic text-sm tracking-tight">{intel.volatile.name}</span>
                    <span className={`font-mono font-black text-sm ${(intel.volatile.changePercent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {(intel.volatile.changePercent || 0) >= 0 ? '+' : ''}{(intel.volatile.changePercent || 0).toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Functional Price Alerts */}
          <div className="card p-5 sm:p-8">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-black uppercase italic tracking-tighter dark:text-white">Price Alerts</h3>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">
                  {alerts.length > 0 ? `${alerts.filter(a => a.triggered).length} triggered · ${alerts.length} total` : 'Track your entry levels'}
                </p>
              </div>
              <button
                onClick={() => { setShowAlertForm((v) => !v); setAlertKey(allEnergy[0]?.key || ''); }}
                className={`text-[11px] font-black uppercase tracking-widest px-3 py-2 rounded-xl transition-all ${showAlertForm ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20'}`}
              >
                {showAlertForm ? 'Close' : '＋ New'}
              </button>
            </div>

            {showAlertForm && (
              <div className="mb-5 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-white/5 space-y-3">
                <select
                  value={alertKey || allEnergy[0]?.key || ''}
                  onChange={(e) => setAlertKey(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-800 rounded-xl px-3 py-2.5 text-[11px] font-black uppercase tracking-widest border border-zinc-200 dark:border-zinc-700 outline-none focus:ring-2 focus:ring-blue-500 dark:text-zinc-200"
                >
                  {allEnergy.map((i) => (<option key={i.key} value={i.key}>{i.name}</option>))}
                </select>
                <div className="flex gap-2">
                  <div className="flex bg-white dark:bg-zinc-800 rounded-xl p-1 border border-zinc-200 dark:border-zinc-700">
                    {(['above', 'below'] as AlertCondition[]).map((c) => (
                      <button
                        key={c}
                        onClick={() => setAlertCondition(c)}
                        className={`px-3 py-1.5 text-[11px] font-black rounded-lg uppercase tracking-widest transition-all ${alertCondition === c ? (c === 'above' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'text-zinc-500'}`}
                      >
                        {c === 'above' ? '≥ Above' : '≤ Below'}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={alertPrice}
                    onChange={(e) => setAlertPrice(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddAlert()}
                    placeholder={`Target (${tableCurrency})`}
                    className="flex-1 min-w-0 bg-white dark:bg-zinc-800 rounded-xl px-3 py-2 text-[11px] font-bold border border-zinc-200 dark:border-zinc-700 outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
                <button onClick={handleAddAlert} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest py-2.5 rounded-xl transition-all">
                  Set Alert
                </button>
              </div>
            )}

            <div className="space-y-3">
              {alerts.length === 0 ? (
                <div className="py-8 text-center">
                  <Bell className="w-8 h-8 mx-auto mb-2 text-zinc-400" strokeWidth={2} />
                  <p className="text-zinc-400 text-[11px] font-black uppercase tracking-widest">No alerts yet</p>
                  <p className="text-zinc-400 text-[11px] mt-1">Get notified when a contract hits your price.</p>
                </div>
              ) : alerts.map((al) => (
                <div key={al.id} className={`flex items-center justify-between gap-2 p-4 rounded-2xl border transition-colors ${al.triggered ? 'bg-red-500/5 border-red-500/20' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-100 dark:border-white/5'}`}>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase dark:text-zinc-200 tracking-tight truncate">{al.name}</p>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                      {al.condition === 'above' ? '≥' : '≤'} {displayTarget(al)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wide ${al.triggered ? 'bg-red-500 text-white' : 'bg-blue-500/10 text-blue-500'}`}>
                      {al.triggered ? 'Triggered' : 'Active'}
                    </span>
                    <button onClick={() => handleRemoveAlert(al.id)} className="w-10 h-10 -m-2 rounded-lg flex items-center justify-center text-zinc-300 dark:text-zinc-600 hover:text-red-500 hover:bg-red-500/10 text-[11px] transition-colors" title="Remove alert" aria-label="Remove alert"><X className="w-3.5 h-3.5" strokeWidth={2.5} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
