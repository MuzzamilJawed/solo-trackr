// One shared, short-lived cache for /api/psx-stocks (it scrapes PSX and takes several
// seconds). The command palette, holding notifier and news matching all need the same
// list; without this each of them fired its own request on every page.

export interface PsxStock {
    symbol: string;
    name?: string;
    currentPrice?: number;
    changePercent?: number;
    [key: string]: unknown;
}

let cache: { at: number; data: PsxStock[] } | null = null;
let inflight: Promise<PsxStock[]> | null = null;

/** The PSX stock list, from cache when it is under `maxAgeMs` old. Rejects on failure. */
export function getPsxStocks(maxAgeMs = 2 * 60_000): Promise<PsxStock[]> {
    if (cache && Date.now() - cache.at < maxAgeMs) return Promise.resolve(cache.data);
    if (inflight) return inflight;
    inflight = fetch("/api/psx-stocks")
        .then(r => r.json())
        .then(j => {
            // The API has no `success` flag — the data array is the contract.
            if (!Array.isArray(j?.data) || j.data.length === 0) throw new Error("empty stock list");
            cache = { at: Date.now(), data: j.data as PsxStock[] };
            return cache.data;
        })
        .finally(() => { inflight = null; });
    return inflight;
}
