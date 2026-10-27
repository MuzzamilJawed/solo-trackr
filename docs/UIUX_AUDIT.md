# SoloTrackr — UI/UX Trace & Audit

Date: 2026-10-26. Method: three parallel read-only audits plus spot checks. Items marked ✔ were verified directly in code; the rest come from the audits (line numbers approximate).

## 1. Architecture

- **Web:** one Next.js 16 + Tailwind 4 app (~30 screens, ~18k lines). Auth is cookie-based, data is MongoDB, and prices come from scraped `/api/*` routes.
- **Mobile:** not a separate codebase. A Capacitor 8 shell (`android/`, `mobile-shell/`, `capacitor.config.ts`) loads the deployed site (`solo-trackr.vercel.app`) in a WebView. So mobile UX = responsive web + native-shell gaps. The only native-aware UI code is `SafeArea.tsx` and `Splash.tsx`.
- **Navigation:** one `Sidebar.tsx` (collapsible rail on desktop, hamburger drawer on phones). There is no bottom tab bar.

## 2. Your existing backlog (`docs/Solotrackr.txt`)

1. Alert for every stock holding
2. Portfolio analytics: me vs KSE100
3. Book-closure announcements (dividends / bonus shares)
4. Portfolio brokerage value incorrect; add edit/delete in the stock dropdown

Items 1 and 4 touch `portfolio/page.tsx` (1308 lines). Split it first. Item 1 depends on the alert-system unification below.

## 3. Cross-cutting issues (fix once, helps every screen)

| # | Sev | Issue | Where |
|---|-----|-------|-------|
| 1 | High | Load failures only `console.error` — blank panels or "empty" instead of error + retry | dashboard, stocks, terminal, [symbol], nasdaq, portfolio, reports, analysis pages, oil detail, CommandPalette |
| 2 | High | No offline detection, no stale-data indicator, no "updated Xs ago" | everywhere |
| 3 | High | Fake "last updated": `new Date()` at render | metals, oil, Sidebar clock |
| 4 | High | 8–10px uppercase `tracking-widest` text (≈70 uses on some pages); FitText can shrink money values to ~6px | all screens |
| 5 | High | Accessibility: unlabeled icon buttons, no dialog semantics (drawer, CommandPalette, admin drawer), settings toggles lack `role="switch"`, auth inputs have no labels, errors not announced | see §5 |
| 6 | Med | Native `confirm()` for deletes and portfolio reset | watchlist, portfolio, expenses |
| 7 | Med | Pages duplicate headers, spinners, refresh effects, watchlist CRUD | need `useFetch`/`usePolling`, `useWatchlists`, `PageHeader` |
| 8 | Med | Colour tokens defined but unused; three different dark blacks (`#050505`, `#0a0a0a`, `black`) | globals.css, layout, AppShell |
| 9 | Med | `body { font-family: Arial }` overrides the Geist font that is loaded ✔ (`globals.css:37`) | globals.css |
| 10 | Low | No i18n, hardcoded PKR rate fallback (278), hex colours in charts | various |

## 4. Mobile / native gaps

| Sev | Gap |
|-----|-----|
| High | **Android back button not handled** — `@capacitor/app` is installed but never imported ✔ (no `backButton` match in `app/`). Back exits the app instead of closing drawers/modals. |
| High | **Server-unreachable screen** — `mobile-shell/index.html` has no timeout, retry or offline message. |
| High | **Push/local notifications missing** — Settings shows "Enable Notifications / System-level push alerts" but nothing is wired. Alerts fire only while the app is open. |
| High | **Google sign-in inside the WebView** is blocked by Google (`disallowed_useragent`); needs a native or system-browser flow. |
| High | **No bottom tab bar**; hamburger covers page headers; main destinations are 2–3 taps away. |
| High | **`window.print()` for the stock report PDF** is unreliable in a WebView; needs share/print plugin or server PDF. |
| Med | No pull-to-refresh; overscroll rule only applies in `display-mode: standalone` (never true in Capacitor). |
| Med | No biometric lock, no deep links (reset-password emails open the browser), keyboard avoidance not handled, no `user-select: none` on chrome. |
| Med | `android:allowBackup="true"` on an app with auth cookies. |
| Low | Native splash `FIT_XY` stretches on tall phones; orientation not locked; haptics absent. |

## 5. Screen-by-screen

**Dashboard (`app/page.tsx`)** — catch only logs; `<a href>` instead of `Link` (full reload in WebView); forex table hides scrollbar; 5-min refresh with no indicator.

**PSX Stocks (`stocks/page.tsx`, 1096 lines)** — extract `usePsxStocks`, filters bar, watchlist panel. No error state; interval doesn't pause when hidden/offline; hover-only add-to-watchlist controls need touch equivalents.

**Stock detail (`stocks/[symbol]`)** — zero `aria-` attributes, 61 tiny-text spots, failures silent, price truncates at `max-w-[45vw]`.

**Terminal** — history failure → silent blank chart; 12px search input triggers iOS zoom; sidebar overlay needs backdrop/focus trap.

**Opportunities** — errors only as toasts; Shariah screen rules hardcoded with substring matching (compliance risk — move to config/API); good tap targets (`min-h-11`) are the model to copy.

**Stock report (1290 lines)** — split into section components; print issue above; 8px toggles; wide tables with no scroll hint; best inline error state in the app.

**NASDAQ list/detail** — calls third-party FX API from the client; detail downloads the whole list to show one symbol; "Route Error" heading is white on light background (invisible in light mode); no watchlist/fundamentals/report parity with PSX detail.

**Shared components** — StockCard compare toggle has `title` only; SectorHeatmap labels unreadable on phones, no keyboard; CommandPalette has Ctrl+K only (no mobile trigger) and no dialog semantics; CompareTray clear button < 40px; TradingChart fullscreen ignores safe areas, hex colours ignore theme.

**Forex / Crypto** — error banner not dismissible, no retry; `<tr onClick>` not keyboard accessible; converter swallows rates failure; chart-history errors swallowed.

**Metals (830 lines) + analysis** — split calculator modal, carat table, charts; all-or-nothing error; analysis page has no loading/error/empty state; candles rescaled to spot (label as approximate).

**Oil + detail + analysis** — ✔ **detail chart candles and volume are generated with `Math.random()`** (`oil/[symbol]/page.tsx:80-93`): fabricated data presented as real. Use real history or label "illustrative". Detail page goes blank when data is null. Alerts live in localStorage only; remove button 24px.

**Watchlist** — two separate alert systems (oil local alerts vs `WatchlistAlerts` signals); remove button 8px with `title` only; `confirm()` delete; no error state on first load.

**Portfolio (1308 lines)** — highest-priority split (form, summary hero, charts, positions table, transactions list, CSV logic). Thin error handling; 8–9px buttons give ~24px tap targets; reset is one `confirm()` (use typed confirmation); "hover to inspect" useless on touch. Reports page: wide `min-w-[760px]` tables with no card fallback, fetch failure shows "No records yet", hardcoded rate 278.

**Expenses** — localStorage only (no backup/sync; lost on WebView clear/reinstall); ✔ unguarded `JSON.parse` can crash the page. (The audit's suspected first-render overwrite is **not** a bug: the load effect reads before the save effect writes.) Amount validation allows 0/negative; in-place `.sort()` during render; no budgets, recurring items or export.

**Auth** — inputs use placeholders only (no labels); errors lack `role="alert"`; tabs lack tab semantics; PasswordField toggle has `tabIndex={-1}`; 2.2s auto-redirect after reset; Google button fixed 320px wide.

**Settings / Profile / Admin** — toggles not accessible; "saved" toast fires before the debounced save, and failure is swallowed; Reset to Default has no confirm; admin role change has no confirm or last-admin guard, table hides columns instead of cards; `/debug` reachable by any signed-in user.

**Toasts** — one live region per toast with `role="status"` for errors too; not keyboard dismissible; auth screens use inline banners while others use toasts.

## 6. Suggested order of work

**Phase 1 — trust & safety (small, high value)**
1. Replace random oil candles; fix real "last updated" timestamps.
2. `useFetch` hook: error, retry, offline banner, "updated Xs ago". Roll out screen by screen.
3. Android back-button handler + offline/retry screen in `mobile-shell`.
4. Guard `JSON.parse` in expenses; fix white-on-light heading in `nasdaq/[symbol]`; remove Arial override.

**Phase 2 — mobile feel**
5. Bottom tab bar (Dashboard, Stocks, Watchlist, Portfolio, More).
6. Type scale (min 11–12px), tap targets ≥ 44px, replace `confirm()` with a dialog + undo toast.
7. Pull-to-refresh, overscroll fix, keyboard avoidance, native share for report/export.

**Phase 3 — accessibility & consistency**
8. Labels, `role="alert"`, switch/dialog semantics, focus-visible, one toast live region.
9. Design tokens (single dark background), shared `PageHeader`, split the 1000+ line pages.

**Phase 4 — features (include yours)**
10. Unified alerts + Capacitor local/push notifications → enables "alert for every holding".
11. Portfolio: fix brokerage value, edit/delete in dropdown, KSE100 benchmark, dividends/book-closure.
12. Expenses to server DB with budgets, export.
13. Native Google sign-in, biometric lock, deep links.
14. *(your new feature — to be added)*

## 7. Phase 1 status (2026-10-27)

Done (typechecks and lints clean; not run in a browser or on a device):
- Oil detail and NASDAQ detail charts now use real history via the new `/api/market-history` (Yahoo). No random candles; "history unavailable" shown when there is no source (propane/naphtha/murban have no mapped symbol). Currency/timeframe switches no longer reload the whole page.
- Oil + NASDAQ detail: failure now shows an error with Retry instead of a blank page or "not found"; invisible white-on-light heading fixed.
- Metals and oil show the real fetch time via `FreshnessBadge`, flag failed background refreshes and offline.
- `LoadErrorBanner` (error + Retry, distinguishes "no data" from "refresh failed") on dashboard, PSX Stocks, NASDAQ.
- Android back button: `BackButtonHandler` + `lib/backStack.ts`; the mobile drawer closes first, then history back, then exit. Other overlays can opt in with `useBackHandler`.
- `mobile-shell/index.html` is now a retry screen and `capacitor.config.ts` sets `server.errorPath`. Its `SERVER_URL` constant must match `CAP_SERVER_URL`.
- Expenses: guarded `JSON.parse`. Body font now uses Geist (was overridden by Arial).

Not done / follow-ups:
- `OilGraphAnalysis` still generates random candles (same fix as the oil detail page).
- `/api/stock-history/[symbol]` is also synthetic (unused by any page).
- Terminal, stock detail, analysis pages, portfolio and reports still swallow load errors; apply `LoadErrorBanner`.
- Other overlays (CommandPalette, admin drawer, sheets) not yet on `useBackHandler`.
- NASDAQ list still calls `open.er-api.com` from the client.

## 8. Phase 2 status (2026-10-27)

Done (typechecks; not run in a browser/device):
- `OilGraphAnalysis`: candles and the Momentum trend now use real history (`/api/market-history`); load failure shows `LoadErrorBanner`.
- Bottom tab bar (`BottomNav`: Home, Stocks, Watchlist, Portfolio, More→drawer), honours hidden modules. Drawer state moved to `SidebarContext`. `--tabbar-h` keeps toasts, compare tray and page padding clear of it.
- `confirm()` replaced by `ConfirmContext` (styled alertdialog, bottom sheet on phones, Back/Escape cancel, focus on Cancel). Portfolio reset requires typing RESET. Used in expenses, portfolio (delete + reset), watchlist.
- Type scale: all 8/9px text → 10px and 10px → 11px across 49 files (excluding `StockCard.tsx`, which had uncommitted edits: 18 spots remain).
- Tap targets ≥40px: portfolio delete, oil alert remove, expenses edit/delete, compare tray "Clear all".
- Native shell: overscroll disabled and chrome non-selectable via `html.native-shell`; pull-to-refresh (`PullToRefresh` + `usePullRefresh`) wired to dashboard, PSX stocks, NASDAQ, metals, oil.

Not done: undo toast after delete; keyboard avoidance and native share/print for the report PDF; pull-to-refresh on remaining screens; still-hover-only controls; text above 10px floor on dense tables unchecked visually.

## 9. Phase 3 status (2026-10-27)

Done (typechecks; not run in a browser or with a screen reader):
- Toasts: persistent live regions (errors `role="alert"`, others polite) replace per-toast roles; real Dismiss button (40px) instead of a click-only icon.
- Settings: toggles are `role="switch"` + `aria-checked`; selects/labels associated via `htmlFor`; currency pills grouped. "System-level push alerts" copy changed to "In-app alerts while SoloTrackr is open" (no native push exists yet).
- Auth: field labels (login, forgot, reset, profile), `role="alert"`/`status` on errors and match hints, sign-in/up `tablist` semantics, password toggle reachable by keyboard (`aria-pressed`, 40px), OTP group label, reset redirect delayed to 6s.
- Dialogs: CommandPalette (`role="dialog"`, combobox/listbox, Tab trap, Android Back, `open-search` event + Search button in the phone drawer), admin user drawer (`role="dialog"`, Android Back), phone nav drawer gets `role="dialog"` while open.
- Global `:focus-visible` outline; one dark page colour token `--color-app-dark` (`dark:bg-app-dark`) replacing `dark:bg-black` / `dark:bg-[#050505]` page backgrounds and the `#0a0a0a` body value.

Not done: splitting `portfolio` / `stocks/report` / `stocks` / `metals` pages and a shared `PageHeader` (large refactors I did not want to make without being able to run the app), `StockCard` / `SectorHeatmap` / `TradingChart` a11y, focus management on drawer open, per-field inline validation errors, hover-only controls, 26 remaining `dark:bg-black` uses.

## 10. Phase 4 status (2026-10-27) — backlog items and features

Verified: `tsc` clean, `next build` succeeds on Node 20, `/api/market-history` returns real WTI candles and a clean 404 for contracts with no source. NOT verified in a browser or on a device; the PSX data feed was unreachable from the build machine, so the KSE100 comparison was not exercised against real data.

Done:
- **Brokerage value (backlog #4):** the ledger showed quantity x price, ignoring fees. Added `tradeTotal()` (BUY = cost + fee, SELL = proceeds - fee), shown as "Net total" in the ledger (phone + table) and as a new CSV column. Holdings/avg-cost maths already included fees and is unchanged. (If the wrong figure you saw was elsewhere, tell me which screen.)
- **Edit trades (backlog #4):** new `PATCH /api/portfolio/[id]` (same validation as create, owner-scoped), `updateTxn()`, and an Edit (pencil) action on every ledger row that reopens the trade form in "Editing" mode. Sell-quantity checks ignore the trade being edited.
- **Alerts for every holding (backlog #1):** `HoldingAlerts` on the portfolio page watches all holdings against stop-loss %, target % (vs average cost) and big-day-move %; thresholds editable, stored in localStorage; one toast per new breach. Runs only while the app is open.
- **Portfolio vs KSE100 (backlog #2):** `BenchmarkCard` on the Analytics tab replays your PSX (PKR) buys/sells into KSE100 on the same dates and compares return and rupee gain, including brokerage and realised profit.
- **Expenses:** monthly per-category budgets (`BudgetPanel`, amber at 80%, red when over), CSV export, amounts must be > 0, fixed in-place sort during render.

Not done:
- **Book-closure / dividend announcements (backlog #3):** needs a reliable announcements data source (PSX company announcements); I could not test any from here, so I did not build it blind.
- Expenses still live in localStorage (server sync/backup not built).
- Push/local notifications, biometric lock, deep links, native Google sign-in (need Capacitor plugins + a device to test).
- Your own new feature — still to be described.

## 11. Book closure / dividend announcements (2026-10-27)

Built source-independent: per-user records (`CorporateAction` model, `/api/corporate-actions`, `lib/corporateActions.ts`) and a "Dividends & book closures" card on the Portfolio page. Entries are added by hand; the card shows closure windows, the last day to own the stock (ex-date, else closure start), what you hold, the expected cash (Rs/share x quantity held before that date) or bonus shares, a heads-up toast within 3 days, and past entries. `source: "PSX"` is reserved for an automated feed.

Data-source findings (checked 2026-10-27):
- PSX DPS (dps.psx.com.pk): `/payouts` and `/announcements/companies` load their tables dynamically, so there is no stable page to scrape; the company page shows announcement titles/dates only (Financial Results / Board Meetings / Others), no payout table. Its terms of use restrict automated/systematic retrieval without written permission (market-data licence enquiries: marketdatarequest@psx.com.pk). The build machine could not reach PSX, so endpoints were not verified.
- Not built: any automated PSX scraper. Options and the recommendation are in the project chat.

## 12. Phase 4 remainder (2026-10-27)

Done (tsc + `next build` pass; not exercised against a database or device):
- **Expenses in the account:** new `Expense` model, `/api/expenses` (+ `[id]` PATCH/DELETE, `/import`), `lib/expenses.ts`. The page now loads/saves via the API, keeps the form filled if a save fails, shows a load-error banner with Retry, and supports pull-to-refresh. First load with an empty account moves any old localStorage expenses up; the local copy is deleted only if every row was accepted. Budgets still live in localStorage.
- **Deep links:** `DeepLinkHandler` (App `appUrlOpen`, same-host paths only) plus an Android intent filter for `https://solo-trackr.vercel.app/reset-password`. `autoVerify` is off until `/.well-known/assetlinks.json` is hosted, so Android may show an app chooser. The host in `AndroidManifest.xml` must match `CAP_SERVER_URL`.
- `android:allowBackup` set to `false` (the app holds auth cookies).

Not done, and why:
- **Local/push notifications:** needs `@capacitor/local-notifications` (or push) installed and a device to test; the npm registry was unreachable from this machine, so I could not add the dependency.
- **Biometric lock** and **native Google sign-in:** need third-party Capacitor plugins plus, for Google, an OAuth client configured in Google Cloud for the Android/iOS app. Cannot be done or tested without those.
- Book-closure auto-feed (see section 11) and your own new feature.

## 13. News, holding notifications, heatmap full screen (2026-10-27)

Verified: `tsc` + `next build` pass; `/api/psx-news` tested live against the real feeds (4/4 sources, ~48 items for today, correctly surfaced "Bank Alfalah ... third interim cash dividend and book closure", Phillips 66 "PSX" false positives filtered). UI not exercised in a browser or on a device.

- **PSX Market News** (`/stocks/news`, sidebar: PSX Stocks > Market News): today (Pakistan calendar day) / 3 / 7 days; filters All, My holdings, Dividends & results; search or symbol; stock tags matched from ticker or company name (can be wrong, noted on page); links go to the publisher. Sources: Business Recorder, Dawn Business, Express Tribune Business RSS + a Google News query (public syndication feeds). Dedupes the same story, 5-minute server cache.
- **News as alerts for every holding:** the Portfolio "Holding alerts" card now lists today's headlines mentioning any PSX stock you hold, shows a count, and toasts each NEW headline once (remembered in the browser; the first run only records, to avoid a flood). Runs while the app is open — there is no push delivery.
- **You vs KSE100:** now its own tab on Portfolio (moved out of Analytics).
- **Holdings edit/delete:** each holding has **Trades** (opens History filtered to that stock, where every trade has Edit/Delete) and **Remove** (deletes all of that stock's trades after typing its symbol).
- **PSX heatmap full screen:** Full screen button on the market map; lays the map out for the real viewport, Esc / Android Back exit, rotates/re-flows.
- Book closures: headlines that are dividend/book-closure notices are tagged on the news page; adding them to the Dividends & book closures card is still manual.

## 14. Technical analysis module (2026-10-27)

"Plugin" built as an in-app module: PSX Stocks > Technical Analysis (`/stocks/analysis?symbol=OGDC`). Type a stock name or symbol (autocomplete from the PSX list), get indicators, Fibonacci levels and a Buy / Hold / Sell lean with reasons.

- `lib/indicators.ts` (pure, no dependencies): SMA, EMA, Wilder RSI, MACD, Bollinger, Stochastic, ATR, ADX/DI, OBV, ROC, Fibonacci retracements/extensions, classic pivots, swing support/resistance. Verified: RSI matches a hand calculation exactly (published worked example differs by <= 0.07 because it uses rounded inputs); identities/edge cases (all-gains = 100, flat = 50, MACD histogram = MACD - signal, Fib 61.8% on a 100-200 swing = 138.2/161.8) tested.
- `lib/analysis.ts`: ~13 weighted signals across Trend / Momentum / Volatility / Volume / Levels -> score -100..+100 -> Strong Sell … Strong Buy, confidence from agreement and history length, caveats (range-bound, overbought-but-bullish, short history, PSX +-7.5% circuit), and reference levels (2xATR stop, next resistance/Fib-extension targets, reward:risk). Sanity-checked on synthetic up/down/sideways markets and real OGDC, LUCK, MEBL, PSO, HBL data.
- Page: verdict card with score meter and top reasons for/against, price chart with Fibonacci/support/resistance lines, indicator table with plain-English notes, Fibonacci and pivot tables, RSI and MACD charts, daily-1y / weekly-5y toggle, loading/error/no-data states, disclaimer.
- Data: Yahoo Finance daily candles via the existing `/api/psx-history`. Not every PSX symbol is covered by Yahoo; the page says so instead of guessing.

**Important finding:** PSX's own timeseries endpoints (`dps.psx.com.pk/timeseries/...`) now return HTTP 403 to server requests, and Stooq 403s too. Yahoo has no KSE-100 series. So the **KSE100 history used by "You vs KSE100" currently has no working source** — that tab will show "Couldn't load KSE100 history" until a source is chosen (licensed PSX data, or another provider). I did not try to bypass the 403s.

## 15. Holding alerts redesign (2026-10-27)

Problem (from a phone screenshot): six full-width alert rows were always open, text overflowed the card, and every alert also fired its own toast.
- The card is now collapsed by default: bell + red count badge, one-line summary, chevron to expand. Expanded rows are two-line (symbol + reason, big % on the right) and wrap/clamp instead of overflowing.
- New alerts/news show once as a self-dismissing notification banner at the top (summary of the biggest moves, "Tap to view", close button, countdown bar, hides after 8 s). It is portalled to `<body>` so the sticky page header can't cover it, and respects reduced motion.
- Each alert is announced once per day (`holdingAlerts.shown.v1`), so reloads don't re-pop it; a new day announces what is still breached.
- Verified in the running dev app at 375px: no horizontal overflow, banner appears on top, auto-hides, expanded list fits.

## 16. Symbol search bug + Add Trade form redesign (2026-10-27)

- **Bug:** typing "PP" in the trade form's Symbol box listed only CPPL; PPL (Pakistan Petroleum) was missing. The suggestions were a native `<datalist>` over the symbol list sorted A-Z and cut to the first 200 of ~500 PSX symbols, so everything after roughly "C" never appeared. Fixed with a new `SymbolPicker` that searches ALL symbols by ticker or company name (ranked: exact > starts-with > name word > contains), keyboard accessible, and still accepts a symbol that isn't listed.
- PSX appends ex-dividend flags to names ("Pak PetroleumXD"); `lib/psxName.ts` strips XD/XB/XR/XW for display and for matching news to companies.
- **Add Trade form:** two clear rows (what: asset, symbol, date; how much: quantity, price, brokerage, currency) instead of eight cramped columns; sentence-case labels with proper `htmlFor`; large Buy/Sell switch; company name + live price under the symbol; the Live button no longer overlaps the price; a live total (trade value, brokerage, total cost / amount you receive, cost per unit or shares left after a sale); clearer buttons ("Add purchase" / "Record sale"). On phones the short fields pair up (form height 1374 -> 908 px).
- Verified in the running app at desktop and 375px widths (PPL listed first for "PP"; 100 x 175.25 with 0.15% brokerage -> fee 26.29, cost 17,551.29). No trade was saved during testing.

## 17. Dashboard review (2026-10-27)

Checked the dashboard live (desktop + 375px): no horizontal overflow, mobile tabs (Overview / Markets / Watchlist) fine. Fixed:
- **Fake zeros:** the Portfolio tile showed "Rs.0 / 0.00%" until live prices arrived, then jumped to the real value (Rs.60,021, -22.98%). It now shows "…  Loading live prices…" until prices are in.
- **Flat moves shown as gains:** every 0.00% change got a green up-arrow. New `lib/change.ts` (`direction()`, flat when the value would display as zero at the shown precision) -> neutral grey "–" in StatCard, PriceCard, MetalStatCard, PortfolioSummary and the dashboard's own tiles/rows.
- **Forex % changes were all 0.00% and the console filled with CORS errors:** the browser called Yahoo directly (blocked, no CORS headers). Now via `/api/forex-change` (server-side; `lib/fxChange.ts` is used directly when running on the server). Real values now show (e.g. EUR -0.8%, USD/PKR +0.01%); no Yahoo requests left in the browser.
- **Ex-dividend flags in names** ("PAK PETROLEUMXD", "HI-TECH LUB.XD") stripped at ingestion.
- **Header:** the page repeated the logo already in the sidebar; from lg up it now reads "Dashboard" + today's date (brand kept on phones). The meaningless "Active" pill is now a real "Updated hh:mm" status that turns amber with Retry if loading fails.
- **Tap targets / navigation:** "All Stocks →", "View →", "Manage →" links are now >= 40px tall; internal `<a>` links became `<Link>` (no full page reload in the WebView).
- **Dead footer links** (Risk Disclosure / Privacy Policy / Data Integrity all `href="#"`) replaced by a one-line disclaimer. Real legal pages will be needed for an app-store release.

## 18. One card system across the app (2026-10-27)

Before: 104 different combinations of radius (lg to 3.5rem), background (/40, /50, /60, /70, solid), border (white/5, white/10, zinc-800) and shadow across 184 card-like elements, so cards looked different screen to screen.

Now (`app/globals.css`, "Card system"):
- `.card` — every panel/section/tile: 16px radius (24px from 640px up), white in light, zinc-900/60 in dark, 1px neutral border, faint shadow in light / none in dark.
- `.card-float` — menus, popovers, trays, toasts (solid, stronger shadow).
- `.card-inset` — a quieter panel nested inside a card.
- `.card-empty` — dashed "nothing here yet" panels.
They live in a CSS layer, so utilities still win (padding, hover:*, overflow, and a colour border only for real state such as selected / error).

Applied by codemod (94 surfaces in 40 files) plus a hand pass (StatCard/dashboard tiles, crypto, trade form, portfolio summary panels, StockCard incl. its dropdowns, command-palette tiles, compare tray, toasts, empty states, 4 nested insets). Verified live: on dashboard, portfolio, stocks, expenses, settings, oil, watchlist and news every `.card` computes to the same radius/background/border (dark: rgba(24,24,27,.6) / white 6%); light mode checked on dashboard and portfolio.

Intentionally unchanged: coloured gradient cards (metal tiles), colour-coded tiles that mean something (support/current/resistance, selected state), inputs/buttons/chips (they have their own field style), skeleton placeholders.
New cards: use `className="card p-4 sm:p-6"` — do not re-create the bg/border/radius/shadow combo.

## 19. Portfolio page loading flash (2026-10-27)

The summary panels showed Rs.0.00 / +0.00% until live prices arrived (the ledger loads first, prices ~7 s later on the dev machine). Now, while loading: Invested shows a placeholder until the ledger is in; Current value, Value vs invested, Unrealized, Day P/L and Total P/L show "…" (grey, no arrows or percentages) with "Loading live prices…"; Realized shows as soon as the ledger loads (it doesn't need prices). Holding cards say "Pricing…" instead of "Pricing unavailable" while prices are still coming. Verified by sampling the live page: no zero state at any point, final values identical to before (Rs.60,020.90, -22.98%).

## 20. Holding alerts become notifications; dividends move to a submenu (2026-10-27)

- The always-visible "Holding alerts" card is gone from the Portfolio page. `HoldingNotifier` (mounted once in `AppShell`) now watches your PSX holdings on ANY screen and pops a self-dismissing notification (top of screen, 9 s, tap a row to open it) only when something happens: price past your stop-loss / target / daily-move limit, a headline about a stock you hold, or a dividend / book-closure cut-off within 3 days. Nothing is shown when nothing happens. Each alert pops once per day; news once ever. Prices: one `/api/psx-stocks` call 3 s after load, then every 5 min. It respects Settings > "Enable Notifications".
- The limits (stop-loss %, target %, big day move %, on/off) moved to Settings > Alert Settings > "Holding notifications" (`HoldingAlertThresholds`, shared `lib/holdingAlertRules.ts`).
- "Dividends & Book Closures" is no longer a card on Portfolio: it is a page, `/portfolio/dividends`, under Portfolio in the sidebar (next to Reports).
- Verified live: notification appears on /settings and /stocks (not just Portfolio), lists UNITY/DCL/GDL with "+3 more", rows link to /portfolio; Portfolio page has neither card; sidebar shows the new item highlighted on its page; threshold edits persist.
- Scope note: the app-wide watcher covers PSX holdings (price + news + dividends). NASDAQ/crypto/commodity holdings are not watched outside the Portfolio screen because that would mean a heavy multi-source price fetch on every page.
