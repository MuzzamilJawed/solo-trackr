// 24h % change per currency, from Yahoo's daily chart meta. SERVER-SIDE ONLY:
// Yahoo sends no CORS headers (browser calls fail) and browsers refuse to set the
// User-Agent it expects. Browser code goes through /api/forex-change instead.
//
// USD is measured as USD/PKR ("PKR=X"); every other code as <CODE>USD=X.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type FxChange = Record<string, { changePercent: number | null }>;

export async function fetchFxChangeServer(codes: string[]): Promise<FxChange> {
    const out: FxChange = {};
    await Promise.all(codes.map(async (code) => {
        try {
            const sym = code === "USD" ? "PKR=X" : `${code}USD=X`;
            const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`, {
                headers: { "User-Agent": UA, Accept: "application/json" },
                signal: AbortSignal.timeout(8000),
                next: { revalidate: 300 },
            });
            if (!r.ok) { out[code] = { changePercent: null }; return; }
            const meta = (await r.json())?.chart?.result?.[0]?.meta || {};
            const price = meta.regularMarketPrice ?? null;
            const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
            out[code] = { changePercent: price != null && prev ? ((price - prev) / prev) * 100 : null };
        } catch {
            out[code] = { changePercent: null };
        }
    }));
    return out;
}
