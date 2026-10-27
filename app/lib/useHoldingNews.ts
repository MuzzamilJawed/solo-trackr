"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchNews, matchSymbols, type NewsItem, type StockRef } from "./news";
import { usePullRefresh } from "./pullRefresh";

export interface HoldingNewsItem extends NewsItem {
    symbols: string[]; // only symbols you hold
}

const REFRESH_MS = 10 * 60_000;

// Today's headlines that mention a stock you hold (by ticker or company name).
// Refreshes every 10 minutes and on pull-to-refresh while mounted.
export function useHoldingNews(heldSymbols: string[]) {
    const [items, setItems] = useState<NewsItem[]>([]);
    const [stocks, setStocks] = useState<StockRef[]>([]);
    const [failed, setFailed] = useState(false);

    const key = heldSymbols.map(s => s.toUpperCase()).sort().join(",");

    const load = useCallback(async () => {
        const res = await fetchNews(1);
        setFailed(res.failed);
        if (!res.failed) setItems(res.items);
    }, []);

    useEffect(() => {
        if (!key) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
        const t = setInterval(load, REFRESH_MS);
        return () => clearInterval(t);
    }, [key, load]);
    usePullRefresh(() => (key ? load() : undefined));

    // Company names make "Hub Power" match even when the ticker isn't in the text.
    useEffect(() => {
        if (!key) return;
        let cancelled = false;
        fetch("/api/psx-stocks")
            .then(r => r.json())
            .then(j => { if (!cancelled && Array.isArray(j?.data)) setStocks(j.data.map((s: StockRef) => ({ symbol: s.symbol, name: s.name }))); })
            .catch(() => { /* ticker-only matching still works */ });
        return () => { cancelled = true; };
    }, [key]);

    const news = useMemo<HoldingNewsItem[]>(() => {
        if (!key) return [];
        const held = key.split(",");
        const refs: StockRef[] = held.map(sym => stocks.find(s => s.symbol.toUpperCase() === sym) ?? { symbol: sym });
        return items
            .map(i => ({ ...i, symbols: matchSymbols(i, refs) }))
            .filter(i => i.symbols.length > 0);
    }, [items, stocks, key]);

    return { news, failed, reload: load };
}
