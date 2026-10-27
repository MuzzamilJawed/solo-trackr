"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Briefcase, CalendarDays, ClipboardList, Download, RefreshCw, WalletCards } from "lucide-react";
import CurrencyToggle from "../../components/CurrencyToggle";
import FitText from "../../components/FitText";
import { useCurrency } from "../../context/CurrencyContext";
import { useToast } from "../../context/ToastContext";
import { brokerageAmount, computeHoldings, fetchTxns, txnsToCsv, type Txn } from "../../lib/portfolio";
import { convertAmount, currencySymbol } from "../../lib/currency";
import { fetchAllPrices, priceIn, priceKey, type PriceBook } from "../../lib/prices";

type ReportView = "ledger" | "pnl" | "cashflow";

const reportOptions: { value: ReportView; label: string; description: string }[] = [
    { value: "ledger", label: "Complete Ledger", description: "Every past and present trade" },
    { value: "pnl", label: "P/L Summary", description: "Realized and open performance" },
    { value: "cashflow", label: "Cash Flow", description: "Money in, money out, and fees" },
];

const formatDate = (value: string) => {
    const [year, month, day] = value.split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
};

export default function PortfolioReportsPage() {
    const { currency: displayCur, rates } = useCurrency();
    const { error, info } = useToast();
    const [reportView, setReportView] = useState<ReportView>("ledger");
    const [txns, setTxns] = useState<Txn[]>([]);
    const [book, setBook] = useState<PriceBook>({ map: {}, rate: 278, updated: "" });
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const reload = useCallback(async () => {
        setRefreshing(true);
        try {
            const [ledger, prices] = await Promise.all([fetchTxns(), fetchAllPrices()]);
            setTxns(ledger);
            setBook(prices);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        reload();
        const handlePortfolioUpdate = () => reload();
        window.addEventListener("portfolio", handlePortfolioUpdate);
        return () => window.removeEventListener("portfolio", handlePortfolioUpdate);
    }, [reload]);

    const fxRates = useMemo(() => ({ ...rates, PKR: book.rate || rates.PKR, USD: 1 }), [book.rate, rates]);
    const convert = useCallback(
        (amount: number, currency: string) => convertAmount(amount, currency, displayCur, fxRates) ?? 0,
        [displayCur, fxRates],
    );
    const fmt = useCallback((amount: number | null | undefined, currency = displayCur) => (
        amount == null
            ? "—"
            : `${currencySymbol(currency)}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ), [displayCur]);
    const fmtDisplay = (amount: number) => fmt(amount, displayCur);

    const filteredTxns = useMemo(() => [...txns]
        .filter(t => (!from || t.date >= from) && (!to || t.date <= to))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [from, to, txns]);

    const reportTotals = useMemo(() => {
        let bought = 0;
        let sold = 0;
        let fees = 0;
        let net = 0;
        filteredTxns.forEach(t => {
            const gross = convert(t.quantity * t.price, t.currency);
            const fee = convert(brokerageAmount(t), t.currency);
            fees += fee;
            if (t.type === "BUY") {
                bought += gross;
                net -= gross + fee;
            } else {
                sold += gross;
                net += gross - fee;
            }
        });
        return { bought, sold, fees, net };
    }, [convert, filteredTxns]);

    const derived = useMemo(() => computeHoldings(txns), [txns]);
    const positionRows = useMemo(() => derived.holdings.map(holding => {
        const quote = book.map[priceKey(holding.assetType, holding.symbol)];
        const current = priceIn(quote, holding.currency, book.rate);
        const invested = holding.quantity * holding.avgCost;
        const value = current == null ? null : holding.quantity * current;
        return { ...holding, current, invested, value, pnl: value == null ? null : value - invested };
    }), [book, derived.holdings]);

    const pnlTotals = useMemo(() => {
        const invested = positionRows.reduce((sum, row) => sum + convert(row.invested, row.currency), 0);
        const value = positionRows.reduce((sum, row) => sum + (row.value == null ? 0 : convert(row.value, row.currency)), 0);
        const unrealized = value - positionRows.reduce((sum, row) => sum + (row.value == null ? 0 : convert(row.invested, row.currency)), 0);
        const realized = convert(derived.realized.PKR, "PKR") + convert(derived.realized.USD, "USD");
        return { invested, value, unrealized, realized, total: unrealized + realized };
    }, [convert, derived.realized, positionRows]);

    const cashFlowRows = useMemo(() => {
        const byMonth = new Map<string, { bought: number; sold: number; fees: number; net: number }>();
        filteredTxns.forEach(t => {
            const month = t.date.slice(0, 7);
            const current = byMonth.get(month) || { bought: 0, sold: 0, fees: 0, net: 0 };
            const gross = convert(t.quantity * t.price, t.currency);
            const fee = convert(brokerageAmount(t), t.currency);
            current.fees += fee;
            if (t.type === "BUY") {
                current.bought += gross;
                current.net -= gross + fee;
            } else {
                current.sold += gross;
                current.net += gross - fee;
            }
            byMonth.set(month, current);
        });
        return Array.from(byMonth.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([month, values]) => ({ month, ...values }));
    }, [convert, filteredTxns]);

    const downloadReport = () => {
        if (filteredTxns.length === 0) {
            info("There are no records to export");
            return;
        }
        const blob = new Blob([txnsToCsv(filteredTxns)], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `portfolio-report-${from || "all"}_to_${to || "present"}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };

    const activeReport = reportOptions.find(option => option.value === reportView) || reportOptions[0];

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white selection:bg-blue-500/30">
            <header className="safe-top sticky top-0 z-40 bg-white/85 dark:bg-black/60 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
                <div className="page-shell mx-auto pl-16 pr-4 sm:pl-8 sm:pr-8 py-4 sm:py-6 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                            <Link href="/portfolio" className="mt-1 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-100 dark:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors" aria-label="Back to portfolio">
                                <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
                            </Link>
                            <div className="min-w-0">
                                <h1 className="text-xl sm:text-3xl font-black tracking-tighter italic uppercase flex items-center gap-2">
                                    <ClipboardList className="w-6 h-6 sm:w-7 sm:h-7 text-blue-500 shrink-0" strokeWidth={2} />
                                    <FitText className="min-w-0">Portfolio <span className="text-blue-500">Reports</span></FitText>
                                </h1>
                                <p className="text-zinc-500 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] mt-1">Full trading record · Net performance tracking</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                            <button onClick={reload} disabled={refreshing} className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 text-[11px] font-black uppercase tracking-widest disabled:opacity-50" title="Refresh report data">
                                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={2.5} /> Refresh
                            </button>
                            <CurrencyToggle />
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                        <div className="min-w-0">
                            <label htmlFor="report-view" className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Report</label>
                            <select id="report-view" value={reportView} onChange={event => setReportView(event.target.value as ReportView)} className="w-full sm:w-80 h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10">
                                {reportOptions.map(option => <option key={option.value} value={option.value}>{option.label} · {option.description}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center gap-2 h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                                <CalendarDays className="w-3.5 h-3.5 text-zinc-400" strokeWidth={2} />
                                <input type="date" value={from} onChange={event => setFrom(event.target.value)} aria-label="Report start date" className="bg-transparent text-xs font-bold outline-none w-[8.5rem]" />
                                <span className="text-[11px] font-black text-zinc-400">TO</span>
                                <input type="date" value={to} onChange={event => setTo(event.target.value)} aria-label="Report end date" className="bg-transparent text-xs font-bold outline-none w-[8.5rem]" />
                            </div>
                            <button onClick={downloadReport} disabled={filteredTxns.length === 0} className="inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-[11px] font-black uppercase tracking-widest" title="Export the selected report records">
                                <Download className="w-3.5 h-3.5" strokeWidth={2.5} /> Export
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="page-shell mx-auto p-4 sm:p-8 space-y-5 sm:space-y-7">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">{activeReport.label}</p>
                        <p className="text-xs text-zinc-500 mt-1">{filteredTxns.length} record{filteredTxns.length === 1 ? "" : "s"} in selected period</p>
                    </div>
                    <Link href="/portfolio" className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-zinc-500 hover:text-blue-500">Open Portfolio <Briefcase className="w-3.5 h-3.5" /></Link>
                </div>

                {loading ? (
                    <div className="card py-20 text-center text-[11px] font-black text-zinc-400 uppercase tracking-widest">Loading portfolio records</div>
                ) : txns.length === 0 ? (
                    <div className="card py-20 text-center">
                        <WalletCards className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700" />
                        <p className="mt-3 text-[11px] font-black text-zinc-400 uppercase tracking-widest">No portfolio records yet</p>
                        <Link href="/portfolio" className="inline-flex mt-4 h-10 items-center px-4 rounded-xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest">Add First Trade</Link>
                    </div>
                ) : reportView === "ledger" ? (
                    <section className="card overflow-hidden">
                        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-zinc-200 dark:divide-white/10 border-b border-zinc-100 dark:border-white/5">
                            {[
                                ["Bought", fmtDisplay(reportTotals.bought), "text-green-500"],
                                ["Sold", fmtDisplay(reportTotals.sold), "text-red-500"],
                                ["Brokerage", fmtDisplay(reportTotals.fees), "text-amber-500"],
                                ["Net cash flow", fmtDisplay(reportTotals.net), reportTotals.net >= 0 ? "text-green-500" : "text-red-500"],
                            ].map(([label, value, tone]) => (
                                <div key={label} className="p-3 sm:p-4 min-w-0">
                                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{label}</p>
                                    <FitText className={`mt-1 text-sm sm:text-lg font-black font-mono tabular-nums ${tone}`}>{value}</FitText>
                                </div>
                            ))}
                        </div>
                        {filteredTxns.length === 0 ? (
                            <div className="py-16 text-center text-[11px] font-black text-zinc-400 uppercase tracking-widest">No records in this date range</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px] text-left border-collapse">
                                    <thead>
                                        <tr className="text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-white/5">
                                            <th className="px-4 sm:px-6 py-3">Date</th>
                                            <th className="px-4 py-3">Trade</th>
                                            <th className="px-4 py-3">Asset</th>
                                            <th className="px-4 py-3 text-right">Qty</th>
                                            <th className="px-4 py-3 text-right">Price</th>
                                            <th className="px-4 py-3 text-right">Gross</th>
                                            <th className="px-4 py-3 text-right">Brokerage</th>
                                            <th className="px-4 sm:px-6 py-3 text-right">Net cash</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                        {filteredTxns.map(t => {
                                            const gross = t.quantity * t.price;
                                            const fee = brokerageAmount(t);
                                            const net = t.type === "BUY" ? -(gross + fee) : gross - fee;
                                            return (
                                                <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02]">
                                                    <td className="px-4 sm:px-6 py-3 text-xs font-mono tabular-nums text-zinc-500">{formatDate(t.date)}</td>
                                                    <td className="px-4 py-3"><span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded ${t.type === "BUY" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>{t.type}</span></td>
                                                    <td className="px-4 py-3"><div className="text-xs font-black">{t.symbol}</div><div className="text-[10px] text-zinc-400 uppercase tracking-widest">{t.assetType} · {t.currency}</div></td>
                                                    <td className="px-4 py-3 text-right text-xs font-mono tabular-nums">{t.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                                                    <td className="px-4 py-3 text-right text-xs font-mono tabular-nums">{fmt(t.price, t.currency)}</td>
                                                    <td className="px-4 py-3 text-right text-xs font-mono tabular-nums">{fmt(gross, t.currency)}</td>
                                                    <td className="px-4 py-3 text-right text-xs font-mono tabular-nums text-amber-500">{fmt(fee, t.currency)}</td>
                                                    <td className={`px-4 sm:px-6 py-3 text-right text-xs font-black font-mono tabular-nums ${net >= 0 ? "text-green-500" : "text-red-500"}`}>{fmt(net, t.currency)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                ) : reportView === "pnl" ? (
                    <section className="space-y-4">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            {[
                                ["Open cost basis", fmtDisplay(pnlTotals.invested), "text-zinc-900 dark:text-white"],
                                ["Current value", fmtDisplay(pnlTotals.value), "text-blue-500"],
                                ["Realized P/L", fmtDisplay(pnlTotals.realized), pnlTotals.realized >= 0 ? "text-green-500" : "text-red-500"],
                                ["Total P/L", fmtDisplay(pnlTotals.total), pnlTotals.total >= 0 ? "text-green-500" : "text-red-500"],
                            ].map(([label, value, tone]) => (
                                <div key={label} className="rounded-2xl bg-blue-500/[0.04] dark:bg-blue-500/[0.06] border border-blue-500/15 p-4 min-w-0">
                                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{label}</p>
                                    <FitText className={`mt-2 text-lg sm:text-2xl font-black font-mono tabular-nums ${tone}`}>{value}</FitText>
                                </div>
                            ))}
                        </div>
                        <div className="card overflow-hidden">
                            <div className="px-4 sm:px-6 py-4 border-b border-zinc-100 dark:border-white/5 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-500" /><h2 className="text-sm font-black uppercase tracking-tight">Current positions</h2></div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px] text-left border-collapse">
                                    <thead><tr className="text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-white/5"><th className="px-4 sm:px-6 py-3">Position</th><th className="px-4 py-3 text-right">Units</th><th className="px-4 py-3 text-right">Cost basis</th><th className="px-4 py-3 text-right">Current value</th><th className="px-4 sm:px-6 py-3 text-right">P/L</th></tr></thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                        {positionRows.map(row => <tr key={`${row.assetType}:${row.symbol}:${row.currency}`}><td className="px-4 sm:px-6 py-3"><span className="text-xs font-black">{row.symbol}</span><span className="ml-2 text-[10px] font-black text-zinc-400 uppercase">{row.assetType}</span></td><td className="px-4 py-3 text-right text-xs font-mono tabular-nums">{row.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td><td className="px-4 py-3 text-right text-xs font-mono tabular-nums">{fmt(row.invested, row.currency)}</td><td className="px-4 py-3 text-right text-xs font-mono tabular-nums">{fmt(row.value, row.currency)}</td><td className={`px-4 sm:px-6 py-3 text-right text-xs font-black font-mono tabular-nums ${row.pnl == null ? "text-zinc-400" : row.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>{row.pnl == null ? "No price" : fmt(row.pnl, row.currency)}</td></tr>)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                ) : (
                    <section className="card overflow-hidden">
                        <div className="px-4 sm:px-6 py-4 border-b border-zinc-100 dark:border-white/5"><h2 className="text-sm font-black uppercase tracking-tight">Monthly cash flow</h2><p className="text-[10px] text-zinc-400 mt-1">BUY values include brokerage outflow; SELL values show net proceeds.</p></div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[620px] text-left border-collapse">
                                <thead><tr className="text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-white/5"><th className="px-4 sm:px-6 py-3">Month</th><th className="px-4 py-3 text-right">Bought</th><th className="px-4 py-3 text-right">Sold</th><th className="px-4 py-3 text-right">Brokerage</th><th className="px-4 sm:px-6 py-3 text-right">Net flow</th></tr></thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                    {cashFlowRows.map(row => <tr key={row.month}><td className="px-4 sm:px-6 py-3 text-xs font-black">{row.month}</td><td className="px-4 py-3 text-right text-xs font-mono tabular-nums text-green-500">{fmtDisplay(row.bought)}</td><td className="px-4 py-3 text-right text-xs font-mono tabular-nums text-red-500">{fmtDisplay(row.sold)}</td><td className="px-4 py-3 text-right text-xs font-mono tabular-nums text-amber-500">{fmtDisplay(row.fees)}</td><td className={`px-4 sm:px-6 py-3 text-right text-xs font-black font-mono tabular-nums ${row.net >= 0 ? "text-green-500" : "text-red-500"}`}>{fmtDisplay(row.net)}</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
