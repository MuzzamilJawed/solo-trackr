# NASDAQ Live Data Scraping Guide

## Overview

The NASDAQ stocks module now implements **live data scraping** with intelligent fallback strategies to ensure reliable data availability even when external APIs are blocked or unavailable.

## Implementation Details

### API Endpoint

**URL**: `/api/nasdaq-stocks`  
**Method**: `GET`  
**Response Format**:

```json
{
  "data": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "currentPrice": 190.5,
      "change": 2.15,
      "changePercent": 1.14,
      "open": 0,
      "high": 0,
      "low": 0,
      "volume": "52500000"
    }
  ],
  "timestamp": "2026-02-17T...",
  "isLive": true
}
```

### Data Scraping Strategy

The NASDAQ endpoint uses a **three-tier fallback system**:

#### Tier 1: NASDAQ API + Yahoo Finance (PRIMARY)

**Status**: When this works, returns **live** market data

- Fetches symbol list from: `https://api.nasdaq.com/api/screener/stocks?exchange=NASDAQ`
- Fetches live quotes from: `https://query1.finance.yahoo.com/v7/finance/quote`
- **Request Batching**: Splits 150 symbols into chunks of 30 to avoid:
  - URL length limits
  - Rate limiting
  - Request timeouts
- **Headers**: Includes browser-like User-Agent and referer to avoid blocks

#### Tier 2: Popular Stocks Fallback (SECONDARY)

**Status**: When Tier 1 fails, returns live data for ~50 popular stocks

- Still fetches real-time data from Yahoo Finance
- Covers major mega-cap and growth stocks:
  - Big Tech: AAPL, MSFT, NVDA, TSLA, AMZN, META, GOOGL
  - Semiconductors: INTC, AMD, QCOM, TXN, AMAT, LRCX, MU
  - Software/SaaS: ADBE, CRWD, ZS, DDOG, NET, SNOW
  - and more...

#### Tier 3: Mock Data (LAST RESORT)

**Status**: When all live sources fail, returns realistic **mock** data

- Uses comprehensive list of 48 NASDAQ stocks with realistic prices
- Response includes `"isLive": false` flag to indicate mock data
- Ensures app functionality even when external APIs are completely blocked

### Response Flags

**`isLive` field**:

- `true`: Data is from live sources (Tier 1 or Tier 2)
- `false`: Data is mock (Tier 3) - shown when live sources unavailable

**Error Handling**:

- Returns HTTP 200 even with mock data (graceful degradation)
- Client can still display data with a note about limited updates
- Server logs indicate which tier provided the data

## Environment Requirements

No environment variables required for NASDAQ scraping.

### Network Requirements

- Outbound HTTPS access to:
  - `api.nasdaq.com` (symbol list)
  - `query1.finance.yahoo.com` (quote data)
- May require firewall/proxy configuration in restricted networks
- If blocked, app gracefully falls back to mock data

## Frontend Integration

The NASDAQ page automatically:

1. Fetches from `/api/nasdaq-stocks`
2. Displays all stocks in a table/grid
3. Shows refresh interval from Settings (default: 30 seconds)
4. Auto-refreshes based on `settings.refreshInterval`

### UI Components Using This API

- **Page**: `app/nasdaq/page.tsx` - NASDAQ stock list
- **Page**: `app/nasdaq/[symbol]/page.tsx` - Individual stock detail
- **Navigation**: Added to sidebar in `app/components/Sidebar.tsx`

## Testing & Debugging

### Test the Endpoint

```bash
# Using curl
curl http://localhost:3000/api/nasdaq-stocks | jq '.data | length'

# Using PowerShell
$r = Invoke-WebRequest -Uri "http://localhost:3000/api/nasdaq-stocks"
($r.Content | ConvertFrom-Json).data.count
```

### View Server Logs

Watch for these console messages:

- `"Scraping NASDAQ stocks via enhanced API call..."` - Tier 1 attempt
- `"Trying alternative market data source..."` - Tier 2 started
- `"Returning mock NASDAQ data..."` - Tier 3 being used
- `"✓ Got XXX symbols from NASDAQ API"` - Tier 1 success
- `"✓ Fetched XXX stock quotes..."` - Quote fetch success

### Common Issues

**Issue**: "Using mock data" in response

- **Cause**: External APIs are blocked or unavailable
- **Solution**:
  1. Check network/firewall restrictions
  2. Verify outbound HTTPS access to nasdaq.com and yahoo.com
  3. Check API endpoint availability
  4. Mock data will work as development data

**Issue**: Timeout errors in logs

- **Cause**: Slow network connection to external APIs
- **Solution**: Increase timeout values in the route (currently 10s/8s)

**Issue**: Some stocks missing from results

- **Cause**: Yahoo Finance may reject very large batch queries
- **Solution**: Batch size is optimized (30 per request); reduce further if needed

## How to Override with Real Data

If you have an alternative data source (paid API, direct stock feed, etc.), modify the `scrapeNASDAQViaAPI()` function to use your source instead.

## Privacy & Data Source Attribution

This implementation uses publicly available APIs:

- **NASDAQ Data**: From `api.nasdaq.com` (official NASDAQ screener)
- **Quote Data**: From `query1.finance.yahoo.com` (Yahoo Finance)
- **Mock Data**: Synthesized realistic data for demo/offline purposes

For production use in a commercial app, verify terms of service and licensing requirements for these data sources.

## Future Improvements

1. **Server-Side Caching**: Cache symbol list (refreshed hourly) to reduce API calls
2. **Historical Data**: Store daily snapshots to calculate trends
3. **Real-Time WebSocket**: Consider WebSocket subscriptions for live updates
4. **Rate Limiting**: Implement request throttling to respect API limits
5. **Custom Alerts**: Notify on price movements above/below thresholds

---

**Last Updated**: Feb 17, 2026  
**Status**: ✅ Live data scraping with intelligent fallbacks implemented
