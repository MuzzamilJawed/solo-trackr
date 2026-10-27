"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, BarChart3, Target, Bell, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import dynamic from 'next/dynamic';
const TradingChart = dynamic(() => import('../../components/TradingChart'), { ssr: false });
import { useSettings } from "../../context/SettingsContext";
import { useCurrency } from "../../context/CurrencyContext";
import CurrencyToggle from "../../components/CurrencyToggle";
import FitText from "../../components/FitText";
import { rateOf } from "../../lib/currency";
import { useToast } from "../../context/ToastContext";
import { fetchOilPrices } from "../../lib/api";
import { type OilAlert, type AlertCondition, loadAlerts, persistAlerts, makeAlertId } from "../../lib/oilAlerts";
import { LOADING_CAPTION } from "../../lib/caption";

export default function OilDetailPage() {
    const params = useParams();
    const router = useRouter();
    const symbol = params.symbol as string;
    const { settings } = useSettings();
    const { success, info, error: toastError } = useToast();
    const { currency: tableCurrency, sym: priceSymbol, conv, rates } = useCurrency();

    const [loading, setLoading] = useState(true);
    const [item, setItem] = useState<any>(null);
    const [loadError, setLoadError] = useState(false);
    const [rawCandles, setRawCandles] = useState<any[]>([]);
    const [historyState, setHistoryState] = useState<"loading" | "ok" | "unavailable">("loading");
    const [timeframe, setTimeframe] = useState("1D");

    // Local price alerts (shared with the Energy Markets list)
    const [alerts, setAlerts] = useState<OilAlert[]>([]);
    const [alertCondition, setAlertCondition] = useState<AlertCondition>("above");
    const [alertPrice, setAlertPrice] = useState("");

    useEffect(() => {
        setAlerts(loadAlerts());
    }, []);

    const loadDetail = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const data = await fetchOilPrices();
            if (!data) {
                setLoadError(true);
                return;
            }

            // Find the item in featured keys or allEnergy
            let found = data[symbol];
            if (!found && data.allEnergy) {
                found = data.allEnergy.find((i: any) => i.key === symbol);
            }
            setItem(found ?? null);
        } catch (err) {
            console.error("Failed to load oil detail:", err);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [symbol]);

    useEffect(() => { loadDetail(); }, [loadDetail]);

    // Real futures history (USD). Scaled to the display currency below, so a
    // currency or timeframe switch never regenerates the data.
    useEffect(() => {
        let cancelled = false;
        setHistoryState("loading");
        fetch(`/api/market-history?oil=${encodeURIComponent(symbol)}&timeframe=${timeframe}`)
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                if (json?.success && Array.isArray(json.data) && json.data.length) {
                    setRawCandles(json.data);
                    setHistoryState("ok");
                } else {
                    setRawCandles([]);
                    setHistoryState("unavailable");
                }
            })
            .catch(() => {
                if (cancelled) return;
                setRawCandles([]);
                setHistoryState("unavailable");
            });
        return () => { cancelled = true; };
    }, [symbol, timeframe]);

    // USD → display currency, using the same factor as the live price.
    const candles = useMemo(() => {
        if (!item?.price) return [];
        const scale = (conv(item.price, item.pkrPrice) ?? 0) / item.price;
        const s = (n: number) => parseFloat((n * scale).toFixed(4));
        return rawCandles.map(c => ({ ...c, open: s(c.open), high: s(c.high), low: s(c.low), close: s(c.close) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawCandles, item, tableCurrency]);

    const formatPrice = (val: number) => {
        if (typeof val !== 'number') return '---';
        return val.toLocaleString(undefined, {
            minimumFractionDigits: val < 10 ? 4 : 2,
            maximumFractionDigits: val < 10 ? 4 : 2
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-app-dark flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-zinc-500 font-black uppercase text-[11px] tracking-widest">{LOADING_CAPTION}</p>
                </div>
            </div>
        );
    }

    if (!item) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-app-dark flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-4xl font-black text-zinc-900 dark:text-white italic uppercase mb-4">{loadError ? "Couldn't load prices" : "Asset not found"}</h1>
                    <p className="text-zinc-500 mb-8 uppercase text-xs tracking-widest font-black">
                        {loadError ? "Check your connection and try again" : "This contract isn't in the energy market feed"}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        {loadError && (
                            <button onClick={loadDetail} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-500 transition-all">Retry</button>
                        )}
                        <button onClick={() => router.push('/oil')} className={`px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all ${loadError ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white" : "bg-blue-600 text-white hover:bg-blue-500"}`}>Back to Energy Markets</button>
                    </div>
                </div>
            </div>
        );
    }

    const currentPrice = conv(item.price, item.pkrPrice) ?? 0;
    const rate = item.pkrPrice && item.price ? item.pkrPrice / item.price : rateOf(rates, 'PKR');

    // Real multi-timeframe performance for this contract
    const perf = [
        { label: "24 Hour", value: Number(item.changePercent ?? 0) },
        { label: "7 Day", value: Number(item.weekly ?? 0) },
        { label: "30 Day", value: Number(item.monthly ?? 0) },
        { label: "52 Week", value: Number(item.yearly ?? 0) },
    ];
    const perfMaxAbs = Math.max(1, ...perf.map((p) => Math.abs(p.value)));

    // Technical bands derived from live price
    const support = currentPrice * 0.94;
    const resistance = currentPrice * 1.07;

    const myAlerts = alerts.filter((a) => a.key === symbol);

    // Alerts are stored in USD; show and accept them in the active currency.
    const displayTarget = (al: OilAlert) =>
        `${priceSymbol}${formatPrice(conv(al.targetUsd, al.targetUsd * rate) ?? 0)}`;

    const handleAddAlert = () => {
        const parsed = parseFloat(alertPrice.replace(/,/g, ""));
        if (!Number.isFinite(parsed) || parsed <= 0) {
            toastError("Enter a valid target price");
            return;
        }
        const targetUsd = tableCurrency === 'USD' ? parsed
            : tableCurrency === 'PKR' ? parsed / rate
                : parsed / rateOf(rates, tableCurrency);
        const triggered = alertCondition === 'above' ? item.price >= targetUsd : item.price <= targetUsd;
        const next: OilAlert[] = [
            { id: makeAlertId(), key: symbol, name: item.name, condition: alertCondition, targetUsd, createdAt: Date.now(), triggered },
            ...alerts,
        ];
        setAlerts(next);
        persistAlerts(next);
        success(`Alert set — ${item.name} ${alertCondition} ${priceSymbol}${formatPrice(parsed)}`);
        setAlertPrice("");
    };

    const handleRemoveAlert = (id: string) => {
        const next = alerts.filter((a) => a.id !== id);
        setAlerts(next);
        persistAlerts(next);
        info("Alert removed");
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark selection:bg-blue-500/30">
            {/* Header */}
            <div className="safe-top sticky top-0 z-50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
                <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6 flex justify-between items-center gap-3">
                    <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
                        <button onClick={() => router.push('/oil')} aria-label="Back to Energy Markets" className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-xl sm:rounded-2xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center group">
                            <ArrowLeft className="w-5 h-5 text-zinc-500 group-hover:text-blue-500 transition-colors" strokeWidth={2} />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-3xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter leading-none truncate">{item.name}</h1>
                            <div className="flex items-center gap-2 mt-1 sm:mt-2 min-w-0">
                                <span className="bg-blue-500/10 text-blue-500 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded truncate">Terminal ID: {symbol}</span>
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            </div>
                        </div>
                    </div>
                    <CurrencyToggle />
                </div>
            </div>

            <main className="page-shell mx-auto p-4 sm:p-8 space-y-8 sm:space-y-12">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-8">
                    {[
                        { label: "Execution Price", value: `${priceSymbol}${formatPrice(currentPrice)}`, sub: `${(item.changePercent ?? 0) >= 0 ? '+' : ''}${(item.changePercent ?? 0).toFixed(2)}%`, color: (item.changePercent ?? 0) >= 0 ? 'text-green-500' : 'text-red-500' },
                        { label: "Weekly Momentum", value: `${item.weekly > 0 ? '+' : ''}${item.weekly}%`, sub: "7D Analysis", color: item.weekly >= 0 ? 'text-green-500' : 'text-red-500' },
                        { label: "Monthly Outlook", value: `${item.monthly > 0 ? '+' : ''}${item.monthly}%`, sub: "30D Projection", color: item.monthly >= 0 ? 'text-green-500' : 'text-red-500' },
                        { label: "Yearly Trend", value: `${(item.yearly ?? 0) > 0 ? '+' : ''}${item.yearly ?? 0}%`, sub: "52W Performance", color: (item.yearly ?? 0) >= 0 ? 'text-green-500' : 'text-red-500' },
                    ].map((stat, i) => (
                        <div key={i} className="card p-5 sm:p-8">
                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">{stat.label}</p>
                            <FitText className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter mb-1">{stat.value}</FitText>
                            <div className={`text-[11px] font-black ${stat.color}`}>{stat.sub}</div>
                        </div>
                    ))}
                </div>

                {/* Main Technical Chart */}
                <div className="card p-5 sm:p-10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                        <span className="text-[12rem] font-black italic text-blue-500 uppercase select-none">{symbol}</span>
                    </div>

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-6 sm:mb-12 relative z-10">
                        <div>
                            <h2 className="text-2xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter">Satellite Technical Analysis</h2>
                            <p className="text-zinc-500 text-[11px] font-black uppercase tracking-widest mt-1">High-Precision Candlestick Feed / SMA (20)</p>
                        </div>
                    </div>

                    <div className="h-[360px] sm:h-[600px] w-full relative z-10">
                        {historyState === "unavailable" ? (
                            <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                                <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Price history unavailable for {item.name}</p>
                                <div className="flex gap-2">
                                    {["1H", "1D", "1W"].map(tf => (
                                        <button key={tf} onClick={() => setTimeframe(tf)} className={`min-h-10 px-4 rounded-xl text-xs font-black ${timeframe === tf ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-white/5 text-zinc-500"}`}>{tf}</button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <TradingChart
                                title={`${item.name} Market Analysis`}
                                data={candles}
                                currentTimeframe={timeframe}
                                onTimeframeChange={setTimeframe}
                                currencySymbol={priceSymbol}
                            />
                        )}
                    </div>
                </div>

                {/* Analytics: real performance + levels + working alerts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12">
                    {/* Left: Performance breakdown + key levels */}
                    <div className="space-y-6 sm:space-y-8">
                        <div className="card p-5 sm:p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <BarChart3 className="w-6 h-6 shrink-0 text-blue-500" strokeWidth={2} />
                                <h3 className="text-xl font-black uppercase italic tracking-tighter dark:text-white">Performance Breakdown</h3>
                            </div>
                            <div className="space-y-4">
                                {perf.map((p) => {
                                    const pos = p.value >= 0;
                                    const w = (Math.abs(p.value) / perfMaxAbs) * 50;
                                    return (
                                        <div key={p.label} className="flex items-center gap-3">
                                            <span className="w-16 shrink-0 text-[11px] font-black uppercase tracking-widest text-zinc-400">{p.label}</span>
                                            <div className="flex-1 flex items-center h-5 relative">
                                                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-200 dark:bg-zinc-700" />
                                                <div className="w-1/2 flex justify-end">
                                                    {!pos && <div className="h-3 rounded-l-md bg-red-500" style={{ width: `${w * 2}%` }} />}
                                                </div>
                                                <div className="w-1/2 flex justify-start">
                                                    {pos && <div className="h-3 rounded-r-md bg-green-500" style={{ width: `${w * 2}%` }} />}
                                                </div>
                                            </div>
                                            <span className={`w-16 shrink-0 text-right text-xs font-black font-mono tabular-nums ${pos ? 'text-green-500' : 'text-red-500'}`}>
                                                {pos ? '+' : ''}{p.value.toFixed(2)}%
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="card p-5 sm:p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <Target className="w-6 h-6 shrink-0 text-blue-500" strokeWidth={2} />
                                <h3 className="text-xl font-black uppercase italic tracking-tighter dark:text-white">Key Price Levels</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                                <div className="bg-green-500/[0.06] border border-green-500/15 p-2.5 sm:p-4 rounded-2xl text-center min-w-0">
                                    <p className="text-[10px] font-black text-green-600/70 dark:text-green-400/70 uppercase tracking-widest mb-1">Support</p>
                                    <FitText className="text-sm sm:text-base font-black text-green-600 dark:text-green-400 font-mono">{priceSymbol}{formatPrice(support)}</FitText>
                                </div>
                                <div className="bg-blue-500/[0.06] border border-blue-500/15 p-2.5 sm:p-4 rounded-2xl text-center min-w-0">
                                    <p className="text-[10px] font-black text-blue-600/70 dark:text-blue-400/70 uppercase tracking-widest mb-1">Current</p>
                                    <FitText className="text-sm sm:text-base font-black text-zinc-900 dark:text-white font-mono">{priceSymbol}{formatPrice(currentPrice)}</FitText>
                                </div>
                                <div className="bg-red-500/[0.05] border border-red-500/15 p-2.5 sm:p-4 rounded-2xl text-center min-w-0">
                                    <p className="text-[10px] font-black text-red-600/70 dark:text-red-400/70 uppercase tracking-widest mb-1">Resistance</p>
                                    <FitText className="text-sm sm:text-base font-black text-red-600 dark:text-red-400 font-mono">{priceSymbol}{formatPrice(resistance)}</FitText>
                                </div>
                            </div>
                            {/* Position within the support→resistance band */}
                            <div className="mt-5">
                                <div className="relative h-2 rounded-full bg-gradient-to-r from-green-500/40 via-zinc-200 dark:via-zinc-700 to-red-500/40">
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-600 border-2 border-white dark:border-zinc-900 shadow"
                                        style={{ left: `${Math.min(100, Math.max(0, ((currentPrice - support) / (resistance - support)) * 100))}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest text-center mt-2">Technical band (±% of live price)</p>
                            </div>
                        </div>
                    </div>

                    {/* Right: Working price alerts for this contract */}
                    <div className="card p-5 sm:p-8 flex flex-col">
                        <div className="flex items-center gap-3 mb-6">
                            <Bell className="w-6 h-6 shrink-0 text-blue-500" strokeWidth={2} />
                            <div>
                                <h3 className="text-xl font-black uppercase italic tracking-tighter dark:text-white">Price Alerts</h3>
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">Get notified when {item.name} hits your level</p>
                            </div>
                        </div>

                        {/* Create */}
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-white/5 space-y-3">
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

                        {/* Existing alerts for this contract */}
                        <div className="mt-4 space-y-3 flex-1">
                            {myAlerts.length === 0 ? (
                                <div className="py-8 text-center">
                                    <p className="text-zinc-400 text-[11px] font-black uppercase tracking-widest">No alerts on {item.name}</p>
                                    <p className="text-zinc-400 text-[11px] mt-1">Set one above — it also shows on the Energy Markets screen.</p>
                                </div>
                            ) : myAlerts.map((al) => (
                                <div key={al.id} className={`flex items-center justify-between gap-2 p-4 rounded-2xl border transition-colors ${al.triggered ? 'bg-red-500/5 border-red-500/20' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-100 dark:border-white/5'}`}>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-black uppercase dark:text-zinc-200 tracking-tight">
                                            {al.condition === 'above' ? '≥' : '≤'} {displayTarget(al)}
                                        </p>
                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                                            {al.triggered ? 'Condition met' : 'Watching live price'}
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
            </main>
        </div>
    );
}
