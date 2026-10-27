import { NextResponse } from 'next/server';

// Real OHLCV history from Yahoo Finance for symbols the app has no dedicated
// history route for (energy futures, NASDAQ tickers). Same candle shape as
// /api/metals-history so TradingChart can consume either.
//
//   /api/market-history?oil=crudeOil&timeframe=1D
//   /api/market-history?symbol=AAPL&timeframe=1H

const OIL_SYMBOLS: Record<string, string> = {
    crudeOil: 'CL=F',
    brentOil: 'BZ=F',
    naturalGas: 'NG=F',
    gasoline: 'RB=F',
    heatingOil: 'HO=F',
    coal: 'MTF=F',
    ethanol: 'EH=F',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const INTERVALS: Record<string, string> = { '1H': '1h', '1D': '1d', '1W': '1wk', '1M': '1mo' };
const RANGES: Record<string, string> = { '1h': '1mo', '1d': '1y', '1wk': '5y', '1mo': 'max' };

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const oil = searchParams.get('oil');
    const raw = searchParams.get('symbol');
    const timeframe = searchParams.get('timeframe') || '1D';

    const symbol = oil ? OIL_SYMBOLS[oil] : raw && /^[A-Za-z0-9.\-^=]{1,12}$/.test(raw) ? raw.toUpperCase() : undefined;
    if (!symbol) {
        // Not an error the user can fix — the caller shows "history unavailable".
        return NextResponse.json({ success: false, error: 'No history source for this symbol' }, { status: 404 });
    }

    const interval = INTERVALS[timeframe] || '1d';
    const range = RANGES[interval];

    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': UA, Accept: 'application/json' },
            next: { revalidate: 60 },
        });
        if (!res.ok) {
            return NextResponse.json({ success: false, error: `Provider error (${res.status})`, symbol }, { status: 502 });
        }

        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (!result?.timestamp) {
            return NextResponse.json({ success: false, error: 'No historical data available', symbol }, { status: 404 });
        }

        const q = result.indicators?.quote?.[0] || {};
        const data = (result.timestamp as number[])
            .map((ts, i) => {
                let time: string | number = ts;
                if (timeframe !== '1H') {
                    const d = new Date(ts * 1000);
                    time = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                }
                return {
                    time,
                    open: q.open?.[i] ?? q.close?.[i],
                    high: q.high?.[i] ?? q.close?.[i],
                    low: q.low?.[i] ?? q.close?.[i],
                    close: q.close?.[i],
                    volume: q.volume?.[i] || 0,
                };
            })
            .filter(d => d.open != null && d.close != null);

        return NextResponse.json({
            success: true,
            symbol,
            data,
            regularMarketPrice: result.meta?.regularMarketPrice ?? null,
            fetchedAt: Date.now(),
        });
    } catch (err) {
        console.error('market-history fetch failed:', err);
        return NextResponse.json({ success: false, error: 'fetch failed', symbol }, { status: 502 });
    }
}
