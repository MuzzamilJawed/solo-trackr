import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const timeframe = searchParams.get('timeframe') || '1D';

    if (!symbol) {
        return NextResponse.json({ success: false, error: 'Symbol is required' }, { status: 400 });
    }

    try {
        // Map PSX symbols to Yahoo Finance symbols
        let yahooSymbol = symbol.toUpperCase();
        
        const indexMapping: Record<string, string> = {
            'KSE100': '^KSE100',
            'KSE30': '^KSE30',
            'KSEALL': '^KSE',
            'ALLSHR': '^KSE',
            'ALLSHARES': '^KSE',
            'KMI30': '^KMI30',
            'KMIALLSHR': '^KMIALL',
            'KMIALL': '^KMIALL',
            'BKTI': '^BKTI',
            'OGTI': '^OGTI'
        };

        const lookupSymbol = yahooSymbol.toUpperCase();

        // PSX indices are NOT available on Yahoo Finance (every ^KSE100 etc. 404s).
        // Use PSX's own intraday time-series feed to derive the session high/low.
        // This branch ALWAYS returns HTTP 200 (with null high/low on failure) so the
        // client never logs a repeating "failed to load resource" console error.
        if (indexMapping[lookupSymbol]) {
            // PSX indices: build REAL candles from PSX's own time-series feed.
            // Intraday feed powers the 1H view + day high/low; the end-of-day feed
            // powers the 1D/1W/1M history. The feeds are close-only, so each candle
            // is open=previous close, close=this close (no synthetic wicks).
            const psxHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Cache-Control': 'no-cache',
            };
            const toSec = (t: number) => (t > 1e12 ? Math.floor(t / 1000) : Math.floor(t));
            const toDate = (ts: number) => {
                const d = new Date(toSec(ts) * 1000);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            };
            const parsePoints = (json: any) => {
                const rows = Array.isArray(json?.data) ? json.data : [];
                return rows
                    .map((r: any) => ({ t: Number(Array.isArray(r) ? r[0] : r?.[0]), v: Number(Array.isArray(r) ? r[1] : r?.[1]), vol: Number((Array.isArray(r) ? r[2] : 0) || 0) }))
                    .filter((p: any) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0)
                    .sort((a: any, b: any) => a.t - b.t);
            };
            const buildCandles = (pts: any[], intraday: boolean) => {
                let prev = pts.length ? pts[0].v : 0;
                return pts.map((p: any) => {
                    const open = prev; const close = p.v; prev = close;
                    return { time: intraday ? toSec(p.t) : toDate(p.t), open, high: Math.max(open, close), low: Math.min(open, close), close, volume: p.vol };
                });
            };

            let dayHigh: number | null = null;
            let dayLow: number | null = null;
            let intPts: any[] = [];

            // Intraday (current session) — always fetched for day high/low
            try {
                const r = await fetch(`https://dps.psx.com.pk/timeseries/int/${encodeURIComponent(lookupSymbol)}`, { headers: psxHeaders, next: { revalidate: 30 } });
                if (r.ok) {
                    intPts = parsePoints(await r.json());
                    if (intPts.length) {
                        const vs = intPts.map((p: any) => p.v);
                        dayHigh = Math.max(...vs);
                        dayLow = Math.min(...vs);
                    }
                }
            } catch { /* ignore */ }

            let data: any[] = [];
            if (timeframe === '1H') {
                data = buildCandles(intPts, true);
            } else {
                // End-of-day daily history
                try {
                    const r = await fetch(`https://dps.psx.com.pk/timeseries/eod/${encodeURIComponent(lookupSymbol)}`, { headers: psxHeaders, next: { revalidate: 3600 } });
                    if (r.ok) {
                        let pts = parsePoints(await r.json());
                        const maxPoints = timeframe === '1M' ? 1500 : timeframe === '1W' ? 750 : 400;
                        if (pts.length > maxPoints) pts = pts.slice(pts.length - maxPoints);
                        data = buildCandles(pts, false);
                    }
                } catch { /* ignore */ }
                // Fall back to intraday candles if EOD is unavailable
                if (data.length === 0 && intPts.length) data = buildCandles(intPts, true);
            }

            return NextResponse.json({ success: true, symbol: lookupSymbol, dayHigh, dayLow, data });
        }

        if (!yahooSymbol.includes('.') && !yahooSymbol.startsWith('^')) {
            // Most PSX stocks on Yahoo use .KA (Karachi)
            yahooSymbol = `${yahooSymbol}.KA`;
        }

        const encodedSymbol = encodeURIComponent(yahooSymbol);

        // Map timeframes to Yahoo intervals
        const intervalMap: Record<string, string> = {
            '1H': '1h',
            '1D': '1d',
            '1W': '1wk',
            '1M': '1mo'
        };
        const interval = intervalMap[timeframe] || '1d';
        
        const rangeMap: Record<string, string> = {
            '1h': '1mo', // 1 month of hourly data
            '1d': '1y',  // 1 year of daily data
            '1wk': '5y', // 5 years of weekly data
            '1mo': 'max' // All time monthly data
        };
        const range = rangeMap[interval] || '1y';

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=${interval}&range=${range}`;
        
        let response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            },
            cache: 'no-store'
        });

        // Fallback for stocks: if .KA fails, try .K or just the symbol if it's an index
        if (!response.ok && yahooSymbol.endsWith('.KA')) {
            const fallbackSymbol = yahooSymbol.replace('.KA', '.K');
            const fallbackUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${fallbackSymbol}?interval=${interval}&range=${range}`;
            response = await fetch(fallbackUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                }
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Yahoo API error (${response.status}):`, errorText);
            return NextResponse.json({ 
                success: false, 
                error: `Market data provider error (${response.status}). Many PSX stocks may not be available on Yahoo Finance.`,
                symbol: yahooSymbol
            }, { status: response.status });
        }

        const data = await response.json();
        const result = data?.chart?.result?.[0];

        if (!result || !result.timestamp) {
            return NextResponse.json({ success: false, error: 'No historical data available for this asset on Yahoo Finance.' });
        }

        const timestamps = result.timestamp;
        const ohlc = result.indicators.quote[0];
        const volumeData = ohlc.volume || [];

        let formattedData = timestamps.map((ts: number, i: number) => {
            let time: string | number = ts;
            if (timeframe !== '1H') {
                const date = new Date(ts * 1000);
                time = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            }

            return {
                time,
                open: ohlc.open[i] || ohlc.close[i],
                high: ohlc.high[i] || ohlc.close[i],
                low: ohlc.low[i] || ohlc.close[i],
                close: ohlc.close[i],
                volume: volumeData[i] || 0
            };
        }).filter((d: any) => d.open != null && d.close != null);

        const meta = result.meta || {};
        let dayHigh: number | null = meta.regularMarketDayHigh ?? null;
        let dayLow: number | null = meta.regularMarketDayLow ?? null;

        // Yahoo's PSX (.KA) data lags by a day. PSX's company page is live, so use
        // it to update today's candle (or append it when Yahoo hasn't got it yet).
        if (timeframe !== '1H' && formattedData.length && !yahooSymbol.startsWith('^')) {
            try {
                const r = await fetch(`https://dps.psx.com.pk/company/${encodeURIComponent(symbol.toUpperCase())}`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Cache-Control': 'no-cache',
                    },
                    cache: 'no-store',
                });
                if (r.ok) {
                    const $ = cheerio.load(await r.text());
                    const num = (s: string | undefined) => {
                        const m = (s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
                        const n = m ? parseFloat(m[0]) : NaN;
                        return Number.isFinite(n) ? n : null;
                    };
                    const stats: Record<string, string> = {};
                    $('.stats_item').each((_, el) => {
                        const label = $(el).find('.stats_label').text().trim().replace(/[\^*]/g, '').trim().toLowerCase();
                        if (label) stats[label] = $(el).find('.stats_value').text().trim();
                    });
                    const close = num($('.quote__close').first().text());
                    const open = num(stats['open']);
                    const high = num(stats['high']);
                    const low = num(stats['low']);
                    const vol = num(stats['volume']) ?? 0;
                    const ldcp = num(stats['ldcp']);

                    if (close && close > 0) {
                        const hi = Math.max(high ?? close, close);
                        const lo = Math.min(low && low > 0 ? low : close, close);
                        const last = formattedData[formattedData.length - 1];
                        // The page shows the latest session: today once PSX opens (09:15 PKT),
                        // otherwise the previous weekday. Exchange holidays aren't modelled.
                        const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
                        const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
                        const day = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
                        const isWeekday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
                        const prevWeekday = (d: Date) => { const x = new Date(d); do { x.setUTCDate(x.getUTCDate() - 1); } while (!isWeekday(x)); return x; };
                        let session = day;
                        if (!isWeekday(session) || Number(parts.hour) * 60 + Number(parts.minute) < 9 * 60 + 15) session = prevWeekday(session);
                        const iso = (d: Date) => d.toISOString().slice(0, 10);
                        const sessionDate = iso(session);
                        const prevDate = iso(prevWeekday(session));

                        if (String(last.time) >= sessionDate) {
                            // Yahoo already has the current (partial) bar.
                            last.close = close;
                            last.high = Math.max(last.high, hi);
                            last.low = Math.min(last.low, lo);
                            if (timeframe === '1D' && vol > last.volume) last.volume = vol;
                        } else if (timeframe === '1D') {
                            // Yahoo lags: fill the previous session from LDCP (close only), then add the live bar.
                            if (ldcp && String(last.time) === prevDate) {
                                last.close = ldcp;
                                last.high = Math.max(last.high, ldcp);
                                last.low = Math.min(last.low, ldcp);
                            } else if (ldcp && String(last.time) < prevDate) {
                                formattedData.push({ time: prevDate, open: last.close, high: Math.max(last.close, ldcp), low: Math.min(last.close, ldcp), close: ldcp, volume: 0 });
                            }
                            const base = formattedData[formattedData.length - 1];
                            formattedData.push({ time: sessionDate, open: open ?? ldcp ?? base.close, high: hi, low: lo, close, volume: vol });
                        } else {
                            // Weekly/monthly bars are bucketed by Yahoo: just roll the live price into the latest bar.
                            last.close = close;
                            last.high = Math.max(last.high, hi);
                            last.low = Math.min(last.low, lo);
                        }
                        if (high && low) { dayHigh = high; dayLow = low; }
                    }
                }
            } catch { /* Yahoo data still stands */ }
        }

        return NextResponse.json({
            success: true,
            symbol: yahooSymbol,
            dayHigh,
            dayLow,
            data: formattedData
        });

    } catch (error: any) {
        console.error('Historical data fetch failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
