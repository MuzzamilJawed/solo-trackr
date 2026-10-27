"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { BellRing, CalendarClock, Newspaper, TrendingDown, TrendingUp, X, Zap } from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import { computeHoldings, fetchTxns, type Txn } from "../lib/portfolio";
import { daysBetween, entitlementDate, entitlementFor, fetchActions, todayStr, type CorporateAction } from "../lib/corporateActions";
import { useHoldingNews } from "../lib/useHoldingNews";
import { loadSeen, saveSeen } from "../lib/news";
import { loadRules, DEFAULT_RULES, type HoldingAlertRules } from "../lib/holdingAlertRules";

// Pops a self-dismissing notification, on ANY screen, when something happens to a
// stock you hold: it crosses your stop-loss / target / daily-move threshold, a
// headline mentions it, or a dividend / book-closure cut-off is close. There is no
// alerts card — when nothing is happening nothing is shown. Thresholds live in
// Settings. Checked while SoloTrackr is open (no background push yet).

const BANNER_MS = 9000;
const PRICE_REFRESH_MS = 5 * 60_000;
const SHOWN_KEY = "holdingAlerts.shown.v1";

interface Row {
    id: string;
    kind: "stop" | "target" | "day-up" | "day-down" | "news" | "action";
    symbol: string;
    text: string;
    sub?: string;
    href: string;
    external?: boolean;
    magnitude: number; // for ordering
}

interface PriceInfo { price: number; day: number }

const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;

const loadShown = (): Set<string> => {
    try {
        const raw = JSON.parse(localStorage.getItem(SHOWN_KEY) || "null");
        return new Set(raw?.d === todayStr() && Array.isArray(raw.ids) ? raw.ids : []);
    } catch {
        return new Set();
    }
};
const saveShown = (ids: Set<string>) => {
    try { localStorage.setItem(SHOWN_KEY, JSON.stringify({ d: todayStr(), ids: [...ids] })); } catch { /* private mode */ }
};

export default function HoldingNotifier() {
    const { settings } = useSettings();
    const allowed = settings.notifications !== false;

    const [rules, setRules] = useState<HoldingAlertRules>(DEFAULT_RULES);
    const [txns, setTxns] = useState<Txn[]>([]);
    const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
    const [actions, setActions] = useState<CorporateAction[]>([]);
    const [banner, setBanner] = useState<Row[] | null>(null);
    const [bannerIn, setBannerIn] = useState(false);
    const [mounted, setMounted] = useState(false);
    const shown = useRef<Set<string> | null>(null);
    const seenNews = useRef<Set<string> | null>(null);

    // Rules (re-read when Settings changes them)
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRules(loadRules());
        setMounted(true);
        const h = () => setRules(loadRules());
        window.addEventListener("holding-alert-rules", h);
        return () => window.removeEventListener("holding-alert-rules", h);
    }, []);

    // Your ledger
    useEffect(() => {
        let alive = true;
        const load = () => fetchTxns().then(t => { if (alive) setTxns(t); });
        load();
        window.addEventListener("portfolio", load);
        return () => { alive = false; window.removeEventListener("portfolio", load); };
    }, []);

    const held = useMemo(
        () => computeHoldings(txns).holdings.filter(h => h.assetType === "PSX" && h.currency === "PKR"),
        [txns],
    );
    const heldKey = held.map(h => h.symbol).sort().join(",");

    // Live PSX prices for what you hold — one request, every 5 minutes.
    const loadPrices = useCallback(async () => {
        try {
            const j = await (await fetch("/api/psx-stocks")).json();
            const map: Record<string, PriceInfo> = {};
            (j?.data || []).forEach((s: { symbol?: string; currentPrice?: number; changePercent?: number }) => {
                if (s?.symbol && Number.isFinite(s.currentPrice)) map[s.symbol.toUpperCase()] = { price: s.currentPrice as number, day: Number(s.changePercent) || 0 };
            });
            setPrices(map);
        } catch { /* try again next tick */ }
    }, []);
    useEffect(() => {
        if (!heldKey || !allowed) return;
        // Let the page the user opened load first.
        const first = setTimeout(loadPrices, 3000);
        const every = setInterval(loadPrices, PRICE_REFRESH_MS);
        return () => { clearTimeout(first); clearInterval(every); };
    }, [heldKey, allowed, loadPrices]);

    // Dividend / book-closure announcements you entered
    useEffect(() => {
        if (!heldKey || !allowed) return;
        let alive = true;
        fetchActions().then(r => { if (alive && !r.failed) setActions(r.data); });
        return () => { alive = false; };
    }, [heldKey, allowed]);

    const { news } = useHoldingNews(allowed ? held.map(h => h.symbol) : []);

    const rows = useMemo<Row[]>(() => {
        if (!allowed || !rules.enabled) return [];
        const out: Row[] = [];
        for (const h of held) {
            const p = prices[h.symbol.toUpperCase()];
            if (!p) continue;
            const pnl = h.avgCost > 0 ? ((p.price - h.avgCost) / h.avgCost) * 100 : null;
            if (pnl != null) {
                if (rules.stopLoss > 0 && pnl <= -rules.stopLoss) out.push({ id: `${h.symbol}:stop`, kind: "stop", symbol: h.symbol, text: `${pct(pnl)} vs your average cost`, sub: "below your stop-loss", href: "/portfolio", magnitude: Math.abs(pnl) });
                else if (rules.target > 0 && pnl >= rules.target) out.push({ id: `${h.symbol}:target`, kind: "target", symbol: h.symbol, text: `${pct(pnl)} vs your average cost`, sub: "target reached", href: "/portfolio", magnitude: Math.abs(pnl) });
            }
            if (rules.dayMove > 0 && Math.abs(p.day) >= rules.dayMove) {
                out.push({ id: `${h.symbol}:day`, kind: p.day >= 0 ? "day-up" : "day-down", symbol: h.symbol, text: `${pct(p.day)} today`, href: "/portfolio", magnitude: Math.abs(p.day) });
            }
        }
        // Book closures: cut-off within 3 days for a stock you hold
        const today = todayStr();
        for (const a of actions) {
            if (a.closureTo < today) continue;
            const left = daysBetween(today, entitlementDate(a));
            if (left < 0 || left > 3) continue;
            const ent = entitlementFor(a, txns);
            if (ent.quantity <= 0) continue;
            out.push({
                id: `${a.id}:soon`, kind: "action", symbol: a.symbol,
                text: `${a.kind === "DIVIDEND" ? "Dividend" : a.kind === "BONUS" ? "Bonus shares" : "Corporate action"} — ${left === 0 ? "last day to hold is today" : `${left} day${left === 1 ? "" : "s"} to hold`}`,
                sub: ent.cash != null ? `about Rs ${ent.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })} before tax` : undefined,
                href: "/portfolio/dividends", magnitude: 1000 - left,
            });
        }
        return out.sort((a, b) => b.magnitude - a.magnitude);
    }, [allowed, rules, held, prices, actions, txns]);

    // Announce what's NEW: alerts not yet shown today, headlines never seen. The very
    // first news run only records what's already out so turning this on doesn't flood
    // you with the day's headlines.
    useEffect(() => {
        if (!mounted || !allowed || !rules.enabled) return;
        if (shown.current === null) shown.current = loadShown();
        const freshRows = rows.filter(r => !shown.current!.has(r.id));

        const firstNewsRun = seenNews.current === null && !localStorage.getItem("news.seen.v1");
        if (seenNews.current === null) seenNews.current = loadSeen();
        const freshNews = news.filter(n => !seenNews.current!.has(n.id));

        if (freshRows.length) { freshRows.forEach(r => shown.current!.add(r.id)); saveShown(shown.current); }
        if (freshNews.length) { freshNews.forEach(n => seenNews.current!.add(n.id)); saveSeen(seenNews.current); }

        const newsRows: Row[] = firstNewsRun ? [] : freshNews.map(n => ({
            id: `news:${n.id}`, kind: "news" as const, symbol: n.symbols[0], text: n.title, sub: n.source, href: n.url, external: true, magnitude: 0,
        }));
        const add = [...freshRows, ...newsRows];
        if (add.length === 0) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBanner(b => [...(b ?? []), ...add]);
    }, [rows, news, mounted, allowed, rules.enabled]);

    // Slide in, then go away on its own.
    useEffect(() => {
        if (!banner) { setBannerIn(false); return; }
        // A short timeout (not requestAnimationFrame, which pauses in background tabs).
        const enter = setTimeout(() => setBannerIn(true), 30);
        const t = setTimeout(() => setBannerIn(false), BANNER_MS);
        const gone = setTimeout(() => setBanner(null), BANNER_MS + 400);
        return () => { clearTimeout(enter); clearTimeout(t); clearTimeout(gone); };
    }, [banner]);

    const dismiss = () => { setBannerIn(false); setTimeout(() => setBanner(null), 300); };

    if (!mounted || !banner || banner.length === 0) return null;

    const shownRows = banner.slice(0, 3);
    const more = banner.length - shownRows.length;
    const priceCount = banner.filter(r => r.kind !== "news" && r.kind !== "action").length;
    const title = priceCount && priceCount === banner.length
        ? `${priceCount} alert${priceCount === 1 ? "" : "s"} on your holdings`
        : `${banner.length} update${banner.length === 1 ? "" : "s"} on your holdings`;

    const icon = (k: Row["kind"]) =>
        k === "stop" || k === "day-down" ? <TrendingDown className="w-4 h-4 text-red-500" aria-hidden />
            : k === "target" ? <TrendingUp className="w-4 h-4 text-emerald-500" aria-hidden />
                : k === "day-up" ? <Zap className="w-4 h-4 text-amber-500" aria-hidden />
                    : k === "news" ? <Newspaper className="w-4 h-4 text-blue-500" aria-hidden />
                        : <CalendarClock className="w-4 h-4 text-violet-500" aria-hidden />;

    return createPortal(
        <div
            role="status"
            aria-live="polite"
            className={`fixed z-[180] left-3 right-3 sm:left-auto sm:right-4 sm:w-96 top-[calc(0.75rem+var(--sa-top))] transition-all duration-300 motion-reduce:transition-none ${bannerIn ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0 pointer-events-none"}`}
        >
            <div className="card-float overflow-hidden">
                <div className="flex items-center gap-3 pl-3 pr-1.5 pt-2.5">
                    <span className="shrink-0 w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center"><BellRing className="w-4 h-4" aria-hidden /></span>
                    <p className="flex-1 min-w-0 text-sm font-black text-zinc-900 dark:text-white truncate">{title}</p>
                    <button type="button" onClick={dismiss} aria-label="Dismiss notification" className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
                        <X className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                </div>
                <ul className="px-2 pb-2">
                    {shownRows.map(r => {
                        const body = (
                            <>
                                <span className="shrink-0 mt-0.5">{icon(r.kind)}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug"><span className="font-black">{r.symbol}</span> · <span className={r.kind === "news" ? "" : "tabular-nums"}>{r.text}</span></span>
                                    {r.sub && <span className="block text-xs text-zinc-500">{r.sub}</span>}
                                </span>
                            </>
                        );
                        const cls = "flex items-start gap-2.5 rounded-xl px-2.5 py-2 hover:bg-zinc-100 dark:hover:bg-white/5";
                        return (
                            <li key={r.id}>
                                {r.external
                                    ? <a href={r.href} target="_blank" rel="noopener noreferrer" onClick={dismiss} className={cls}>{body}</a>
                                    : <Link href={r.href} onClick={dismiss} className={cls}>{body}</Link>}
                            </li>
                        );
                    })}
                    {more > 0 && <li><Link href="/portfolio" onClick={dismiss} className="block px-2.5 py-2 text-xs font-bold text-blue-600 dark:text-blue-400">+{more} more — open portfolio</Link></li>}
                </ul>
                {/* Time left before it hides */}
                <div className="h-0.5 bg-amber-500/20"><div className="alert-countdown h-full bg-amber-500 origin-left" style={{ animation: bannerIn ? `alert-shrink ${BANNER_MS}ms linear forwards` : "none" }} /></div>
            </div>
        </div>,
        document.body,
    );
}
