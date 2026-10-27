"use client";

import { useEffect, useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { tradeTotal, type Txn } from "../lib/portfolio";

interface Props {
    txns: Txn[];
    /** Current market value of open PSX holdings, in PKR. null if any has no live price. */
    psxValueNow: number | null;
}

interface Close { date: string; close: number }

const pkr = (n: number) =>
    `${n < 0 ? "-" : ""}Rs ${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

// "Me vs KSE100": replays your PSX cash flows into the index. Every BUY puts the
// same rupees into KSE100 on that day, every SELL takes the same rupees out, and
// we compare what that would be worth today with what you actually hold.
export default function BenchmarkCard({ txns, psxValueNow }: Props) {
    const [closes, setCloses] = useState<Close[] | null>(null);
    const [failed, setFailed] = useState(false);

    // Only PKR-denominated PSX trades are comparable to a PKR index.
    const trades = useMemo(
        () => txns.filter(t => t.assetType === "PSX" && t.currency === "PKR").sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
        [txns],
    );

    useEffect(() => {
        if (trades.length === 0) return;
        let cancelled = false;
        fetch("/api/psx-history?symbol=KSE100&timeframe=1M")
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                const rows: Close[] = Array.isArray(json?.data)
                    ? json.data.filter((d: { time: unknown; close: unknown }) => typeof d.time === "string" && Number(d.close) > 0).map((d: { time: string; close: number }) => ({ date: d.time, close: Number(d.close) }))
                    : [];
                if (rows.length) setCloses(rows);
                else setFailed(true);
            })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [trades.length]);

    const result = useMemo(() => {
        if (!closes || trades.length === 0 || psxValueNow == null) return null;
        const last = closes[closes.length - 1].close;
        // Index level on or before a date (markets are closed on weekends/holidays).
        const levelOn = (date: string) => {
            let lo = 0, hi = closes.length - 1, ans = -1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (closes[mid].date <= date) { ans = mid; lo = mid + 1; } else hi = mid - 1;
            }
            return ans >= 0 ? closes[ans].close : null;
        };

        let bought = 0, sold = 0, units = 0, skipped = 0;
        for (const t of trades) {
            const amt = tradeTotal(t);
            const lvl = levelOn(t.date);
            if (lvl == null) { skipped++; continue; } // trade predates the index history we have
            if (t.type === "BUY") { bought += amt; units += amt / lvl; }
            else { sold += amt; units -= amt / lvl; }
        }
        if (bought <= 0) return null;

        const benchNow = units * last;
        const mineGain = psxValueNow + sold - bought;
        const benchGain = benchNow + sold - bought;
        return {
            bought, mineGain, benchGain, skipped,
            minePct: (mineGain / bought) * 100,
            benchPct: (benchGain / bought) * 100,
        };
    }, [closes, trades, psxValueNow]);

    if (trades.length === 0) return null;

    const alpha = result ? result.minePct - result.benchPct : 0;

    return (
        <section aria-label="Portfolio versus KSE100" className="card p-4 sm:p-6">
            <div className="flex items-center gap-2.5 mb-4">
                <Scale className="w-5 h-5 text-blue-500" strokeWidth={2} aria-hidden />
                <div>
                    <h2 className="text-sm font-black text-zinc-900 dark:text-white">You vs KSE100</h2>
                    <p className="text-xs text-zinc-500">Your PSX trades, replayed into the index on the same days</p>
                </div>
            </div>

            {failed && <p role="status" className="text-sm text-amber-600 dark:text-amber-400">Couldn&apos;t load KSE100 history right now.</p>}
            {!failed && !result && psxValueNow == null && closes && (
                <p className="text-sm text-zinc-500">Waiting for live prices on all your PSX holdings…</p>
            )}
            {!failed && !closes && <p className="text-sm text-zinc-500">Loading KSE100 history…</p>}

            {result && (
                <>
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <Stat label="You" value={pct(result.minePct)} sub={pkr(result.mineGain)} good={result.mineGain >= 0} />
                        <Stat label="KSE100" value={pct(result.benchPct)} sub={pkr(result.benchGain)} good={result.benchGain >= 0} />
                        <Stat label={alpha >= 0 ? "Ahead by" : "Behind by"} value={`${Math.abs(alpha).toFixed(1)} pts`} sub={`on ${pkr(result.bought)} invested`} good={alpha >= 0} />
                    </div>
                    <p className="text-xs text-zinc-500 mt-4">
                        Includes brokerage and realised profits. Ignores dividends and tax on both sides.
                        {result.skipped > 0 && ` ${result.skipped} older trade${result.skipped === 1 ? "" : "s"} predate the available index history and are left out of the index side only.`}
                    </p>
                </>
            )}
        </section>
    );
}

function Stat({ label, value, sub, good }: { label: string; value: string; sub: string; good: boolean }) {
    return (
        <div className="card-inset px-2 py-3 min-w-0">
            <p className="text-xs font-bold text-zinc-500">{label}</p>
            <p className={`text-lg sm:text-xl font-black tabular-nums ${good ? "text-emerald-500" : "text-red-500"}`}>{value}</p>
            <p className="text-[11px] text-zinc-500 tabular-nums truncate">{sub}</p>
        </div>
    );
}
