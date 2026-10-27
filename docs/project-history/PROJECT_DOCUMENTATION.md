# SoloTrackr Dashboard Project

This repository houses a comprehensive real-time dashboard built with Next.js 13+ (App Router) that aggregates market data across multiple asset classes and exchanges.

## Key Modules

- **PSX Stocks** (`/stocks`)
  - Pulls live quotes from PSX website via server-side scraping (`app/api/psx-stocks/route.ts`).
  - Includes index selectors, sector filters, watchlist management, search, sorting, and both card/grid views.
  - Provides per-symbol detail pages with interactive charts.

- **NASDAQ Stocks** (`/nasdaq`)
  - Queries Nasdaq screener API for symbol list, then fetches quotes from Yahoo Finance (`app/api/nasdaq-stocks/route.ts`).
  - Features identical UI/UX to PSX module, including filters and detail pages.
  - Fully live data; no mock fallback.

- **Shared Components**
  - `StockCard` renders a stock summary card (extended to display exchange label).
  - `Sidebar` for application navigation (now includes NASDAQ link).
  - `SettingsContext` provides refresh intervals and other global settings.
  - Utility code in `lib/` (api helpers, MongoDB, etc.).

## Architecture Highlights

- **Client/Server Components:** Most pages are client-only (`"use client"`), enabling rich interactivity (charts, filters).
- **API Routes:** Custom Next.js API endpoints handle scraping and third-party calls.
- **State Management:** React `useState`/`useEffect` in pages, with central settings via context.
- **Styling:** Tailwind CSS with dark mode support.
- **Data Handling:** Robust filtering, sorting, pagination, and graceful error handling.

## Supporting Features

- ElevenLabs Text‑to‑Speech integration: a new TTS API is available at `/api/tts` which proxies requests to ElevenLabs. Set `ELEVENLABS_API_KEY` and optional `ELEVENLABS_VOICE_ID` in environment to enable audio playback from the UI.

## Directory Structure

```
app/
  api/
    psx-stocks/route.ts
    nasdaq-stocks/route.ts
    watchlists/...
  stocks/
    page.tsx
    [symbol]/page.tsx
  nasdaq/
    page.tsx
    [symbol]/page.tsx
  components/
    StockCard.tsx
    Sidebar.tsx
    ThemeProvider.tsx
  context/
    SettingsContext.tsx
  lib/
    api.ts
    mongodb.ts
    utils.ts
  ...
```

## Development Notes

- Refresh interval is controlled in settings (default behaviour applied to both stock pages).
- API rate limits and potential CORS issues managed via user-agent headers and error handling.
- All UI components designed for responsiveness and accessibility.

---

Maintained by the project author; see README.md for quickstart instructions and additional documentation.
