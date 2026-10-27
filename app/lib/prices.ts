// Client-side price aggregator across every asset class the app tracks.
// Builds a { "TYPE:SYMBOL" -> { usd, pkr, name } } map plus the live USD->PKR
// rate, so the portfolio (and multi-asset watchlist) can price any holding.

import { cleanPsxName } from "./psxName";
import { fetchOilPrices } from "./api";
import { rateOf } from "./currency";

export type AssetType = "PSX" | "NASDAQ" | "CRYPTO" | "FOREX" | "COMMODITY";

export const ASSET_TYPES: { value: AssetType; label: string; currency: "PKR" | "USD" }[] = [
    { value: "PSX", label: "PSX Stock", currency: "PKR" },
    { value: "NASDAQ", label: "NASDAQ Stock", currency: "USD" },
    { value: "CRYPTO", label: "Crypto", currency: "USD" },
    { value: "FOREX", label: "Forex", currency: "USD" },
    { value: "COMMODITY", label: "Commodity", currency: "USD" },
];

export interface PriceInfo {
    usd: number | null;
    pkr: number | null;
    name: string;
    changePct: number | null; // day (24h) percent change
}

const num = (v: any): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

export const priceKey = (type: AssetType | string, symbol: string) =>
    `${type}:${(symbol || "").trim().toUpperCase()}`;

export interface PriceBook {
    map: Record<string, PriceInfo>;
    rate: number; // USD -> PKR
    updated: string;
}

export async function fetchAllPrices(): Promise<PriceBook> {
    const map: Record<string, PriceInfo> = {};
    let rate = 278;

    const jobs: Promise<any>[] = [
        fetch("/api/psx-stocks").then(r => r.json()).then(j => {
            (j?.data || []).forEach((s: any) => {
                if (s?.symbol) map[priceKey("PSX", s.symbol)] = { pkr: num(s.currentPrice), usd: null, name: cleanPsxName(s.name) || s.symbol, changePct: num(s.changePercent) };
            });
        }).catch(() => {}),
        fetch("/api/nasdaq-stocks").then(r => r.json()).then(j => {
            (j?.data || []).forEach((s: any) => {
                if (s?.symbol) map[priceKey("NASDAQ", s.symbol)] = { usd: num(s.currentPrice), pkr: null, name: s.name || s.symbol, changePct: num(s.changePercent) };
            });
        }).catch(() => {}),
        fetch("/api/crypto?per_page=50").then(r => r.json()).then(j => {
            (Array.isArray(j) ? j : []).forEach((c: any) => {
                if (c?.symbol) map[priceKey("CRYPTO", c.symbol)] = { usd: num(c.usdPrice), pkr: num(c.pkrPrice), name: c.name || c.symbol, changePct: num(c.changePercent) };
            });
        }).catch(() => {}),
        fetch("/api/forex").then(r => r.json()).then(j => {
            (Array.isArray(j) ? j : []).forEach((f: any) => {
                if (f?.code) {
                    map[priceKey("FOREX", f.code)] = { usd: num(f.usdPrice), pkr: num(f.pkrPrice), name: f.name || f.code, changePct: num(f.changePercent) };
                    if (f.code === "USD" && num(f.pkrPrice)) rate = num(f.pkrPrice) as number;
                }
            });
        }).catch(() => {}),
        fetch("/api/gold-price").then(r => r.json()).then(j => {
            const g = j?.tola24k;
            if (g) map[priceKey("COMMODITY", "GOLD")] = { usd: num(g.usdPrice), pkr: num(g.pkrPrice), name: "Gold (24K · Tola)", changePct: num(g.changePercent) };
        }).catch(() => {}),
        fetch("/api/silver-price").then(r => r.json()).then(j => {
            const s = j?.ounce;
            if (s) map[priceKey("COMMODITY", "SILVER")] = { usd: num(s.usdPrice), pkr: num(s.pkrPrice), name: "Silver (per Ounce)", changePct: num(s.changePercent) };
        }).catch(() => {}),
    ];

    await Promise.allSettled(jobs);

    try {
        const oil = await fetchOilPrices();
        if (oil?.crudeOil) map[priceKey("COMMODITY", "WTI")] = { usd: num(oil.crudeOil.price), pkr: num(oil.crudeOil.pkrPrice), name: "Crude Oil (WTI)", changePct: num(oil.crudeOil.changePercent) };
        if (oil?.brentOil) map[priceKey("COMMODITY", "BRENT")] = { usd: num(oil.brentOil.price), pkr: num(oil.brentOil.pkrPrice), name: "Brent Crude", changePct: num(oil.brentOil.changePercent) };
    } catch { /* ignore */ }

    return { map, rate, updated: new Date().toLocaleTimeString() };
}

// Price of an asset expressed in a target currency (best-effort conversion).
export function priceIn(info: PriceInfo | undefined, cur: "PKR" | "USD", rate: number): number | null {
    if (!info) return null;
    if (cur === "PKR") return info.pkr ?? (info.usd != null ? info.usd * rate : null);
    return info.usd ?? (info.pkr != null ? info.pkr / rate : null);
}

// Price of an asset in any display currency, using a USD-based rate map.
// (`rates.PKR` should carry the price book's own USD→PKR rate so PKR figures
// stay in step with the feeds.)
export function priceInAny(
    info: PriceInfo | undefined,
    code: string,
    rates: Record<string, number>,
): number | null {
    if (!info) return null;
    const pkrRate = rateOf(rates, "PKR");
    if (code === "PKR") return info.pkr ?? (info.usd != null ? info.usd * pkrRate : null);
    const usd = info.usd ?? (info.pkr != null ? info.pkr / pkrRate : null);
    if (code === "USD") return usd;
    return usd == null ? null : usd * rateOf(rates, code);
}

// Convert an amount between PKR and USD.
export const convert = (amt: number, from: "PKR" | "USD", to: "PKR" | "USD", rate: number): number =>
    from === to ? amt : from === "USD" ? amt * rate : amt / rate;

export const curSymbol = (c: "PKR" | "USD") => (c === "PKR" ? "Rs." : "$");

// Suggested symbols per asset type (for the add-holding helper).
export const COMMODITY_SYMBOLS = ["GOLD", "SILVER", "WTI", "BRENT"];
