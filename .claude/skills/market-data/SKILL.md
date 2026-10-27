---
name: market-data
description: Where SoloTrackr gets PSX/market data, caching, and what is blocked or unlicensed. Use before adding or changing any data fetch (stocks, history, news, forex, dividends).
---

# Market data

- **PSX list**: `/api/psx-stocks` scrapes psx.com.pk/market-summary (~5 s). Server keeps last good answer 20 s and shares one in-flight request; it falls back to a mock list with a `note` on failure (a known P0 gap: should return an honest error). Response has no `success` field — read `json.data`. Client uses `getPsxStocks()` (`app/lib/psxStocksCache.ts`, 2 min cache) — always go through it.
- **History**: Yahoo `.KA` symbols. dps.psx.com.pk timeseries returns 403 and Stooq 403 — do NOT circumvent; report instead. KSE100 benchmark has no licensed source.
- **News**: RSS feeds via `/api/psx-news`; matching to holdings in `app/lib/news.ts` (`matchSymbols`).
- **Forex % change**: `/api/forex-change` + `lib/fxChange.ts` (server-side; the browser must not call Yahoo directly — CORS).
- **Dividends / book closure**: manual entry (`CorporateAction` model); no automatic feed.
- Indicators/technical analysis live under `app/stocks/analysis`.
- Licensing question for PSX data was raised; don't scrape beyond what is already used without checking terms.
