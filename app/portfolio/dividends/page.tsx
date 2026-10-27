"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import CorporateActionsCard from "../../components/CorporateActionsCard";
import { computeHoldings, fetchTxns, type Txn } from "../../lib/portfolio";

export default function DividendsPage() {
    const [txns, setTxns] = useState<Txn[]>([]);

    useEffect(() => {
        let alive = true;
        const load = () => fetchTxns().then(t => { if (alive) setTxns(t); });
        load();
        window.addEventListener("portfolio", load);
        return () => { alive = false; window.removeEventListener("portfolio", load); };
    }, []);

    const heldSymbols = useMemo(() => computeHoldings(txns).holdings.filter(h => h.assetType === "PSX").map(h => h.symbol), [txns]);

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white">
            <header className="safe-top sticky top-0 z-40 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
                <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6">
                    <h1 className="text-xl sm:text-3xl font-black tracking-tighter italic uppercase leading-none flex items-center gap-2.5">
                        <CalendarClock className="w-6 h-6 sm:w-7 sm:h-7 text-blue-500 shrink-0" strokeWidth={2} aria-hidden /> Dividends <span className="text-blue-500">&amp; Book Closures</span>
                    </h1>
                    <p className="text-zinc-500 text-xs mt-1.5">When to hold a stock by, and what you&apos;d receive. You&apos;ll get a notification when a cut-off for a stock you hold is within 3 days.</p>
                </div>
            </header>
            <main className="page-shell mx-auto p-4 sm:p-8 max-w-4xl">
                <CorporateActionsCard txns={txns} heldSymbols={heldSymbols} />
            </main>
        </div>
    );
}
