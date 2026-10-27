# SoloTrackr — Gap report

Date: 2026-10-27. What the app is missing, and what it has that it shouldn't. Each item says how I know: **checked** = I looked at the code or ran it; **inferred** = reasonable but not verified. Priority: **P0** fix before real users / store release, **P1** soon, **P2** nice to have.

---

## 1. Security and trust (fix first)

| P | Gap | Evidence | Why it matters |
|---|-----|----------|----------------|
| P0 | **Session secret falls back to a public default.** If `AUTH_SECRET` is missing, `lib/session.ts` signs sessions with `'solo-trackr-insecure-dev-secret'` and only logs a warning. | checked | Anyone can forge a login cookie (including admin) on a deployment that forgot the variable. Production should refuse to start. |
| P0 | **No rate limiting on sign-in or sign-up.** Rate limiting exists only on the three password-reset routes. | checked | Passwords can be guessed without limit. |
| P0 | **Fake prices can be shown as real.** When the PSX scrape fails, `/api/psx-stocks` returns six invented stocks (HBL 85.50, ENGRO 425…) plus a `note`. No screen reads the note. | checked | In a finance app, invented prices with no warning is the worst failure mode. Show an error instead, or label it loudly. |
| P1 | **No security headers** (CSP, X-Frame-Options, Referrer-Policy, HSTS) in `next.config.ts`. | checked | Cheap hardening; the app handles logins and money data. |
| P1 | **`/debug` page has no guard** and calls a third-party API from the browser. | checked | Internal tooling reachable by any signed-in user. Remove or admin-gate. |
| P1 | **No email verification, no 2-step login.** | checked (nothing found) | Anyone can register with someone else's email; accounts rely on password only. |
| P2 | 30-day sessions with no "sign out everywhere" / device list. | checked | Lost phone = session stays valid. |

## 2. Required for app-store release (currently missing)

| P | Gap | Evidence |
|---|-----|----------|
| P0 | **Privacy policy and terms.** The footer links were `href="#"` (now replaced by a disclaimer). Google Play and the App Store both require a real privacy policy URL. | checked |
| P0 | **Account and data deletion.** No way for a user to delete their account. Play requires in-app deletion plus a web link. | checked (no delete route under `/api/profile` or `/api/auth`) |
| P0 | **Data licensing.** The app scrapes psx.com.pk / dps.psx.com.pk, whose terms forbid automated access without permission; Yahoo and Google News are used outside their intended terms for redistribution. Fine for personal use, a risk once other people use it. | checked (terms read 2026-10-27) |
| P1 | **Signed release build + keystore process** (only a debug build was made). | inferred |
| P1 | **Native Google sign-in.** Google blocks sign-in inside embedded WebViews, so the Google button will fail in the Android app. | inferred (known Google policy) |
| P1 | **Real push notifications.** Alerts only run while the app is open. | checked |

## 3. Product gaps (things users will expect)

- **Benchmark data.** "You vs KSE100" has no working data source (PSX feeds return 403; Yahoo has no KSE-100). Needs licensed data. (P1, checked)
- **Automatic book-closure / dividend feed.** Entered by hand today. (P1)
- **Dividends not counted in returns.** Received dividends are not recorded against holdings, so portfolio return understates reality. (P1, checked)
- **Non-PSX holdings are not monitored for alerts** outside the Portfolio screen (NASDAQ, crypto, commodities). (P2)
- **Multi-currency cost basis.** Everything is converted at today's rate; a USD trade's PKR cost is not fixed at the rate on the trade date. (P2, inferred)
- **Tax view.** No capital-gains/dividend-tax summary (Pakistan has holding-period rules). (P2)
- **Price alerts per stock** (set a specific target price). Only global percentage limits exist. (P2)
- **Watchlist ↔ analysis link.** Technical Analysis isn't reachable from a stock's detail page. (P2, checked)
- **Backup / export of everything** (portfolio CSV exists; expenses CSV exists; no single "export my data"). (P2)
- **Expenses budgets live in the browser only** (not synced to the account). (P2, checked)
- **Pagination / limits** on history lists for users with thousands of trades. (P2, inferred)

## 4. Quality and reliability

| P | Gap | Evidence |
|---|-----|----------|
| P0 | **No automated tests.** `playwright.config.ts` points at `tests/e2e`, which doesn't exist. The indicator maths (RSI etc.) was verified by hand scripts that aren't in the repo. | checked |
| P1 | **No CI.** Nothing runs type-check, lint or build on push. | checked |
| P1 | **Lint is failing:** ~239 errors (mostly `any` types), so lint can't be a gate yet. | checked |
| P1 | **No error monitoring or logging service** (Sentry-style). Failures are `console.error` only; scraping breakage would go unnoticed. | checked |
| P1 | **Scraped data is brittle.** The PSX market summary is parsed from HTML tables; a layout change silently breaks or falls back to fake data. No health check or alert. | checked |
| P1 | **Time zones.** "Today" is computed in UTC in 6 places (expenses default date, dividend countdown, alert-once-per-day). In Pakistan (UTC+5) between midnight and 5 am the app thinks it is still yesterday. | checked |
| P2 | Giant files: `portfolio/page.tsx` 1,472 lines, `stocks/report/[symbol]` 1,290, `stocks/page.tsx` 1,105; hard to change safely. | checked |
| P2 | No offline support: no service worker; the mobile app shows a retry screen but cached data is not available. | checked |
| P2 | No i18n (English only); Urdu/RTL would be valuable for the audience. | checked |

## 5. Things that should NOT be there (clean-up)

- **JVM crash logs committed to git:** `hs_err_pid*.log` and `replay_pid*.log` (32 tracked junk files together with `.idea/` files and `__shot.js`). Remove and add to `.gitignore`. (P1, checked)
- **18 overlapping docs in the repo root** (README, README_NEW, START_HERE, QUICKSTART, SETUP_GUIDE, IMPLEMENTATION_SUMMARY, COMPLETION_CHECKLIST, several REAL_TIME_* …). Likely stale and contradictory; fold into one README + `docs/`. (P2, checked)
- **`/api/stock-history/[symbol]` returns random numbers** ("synthetic history for demo") and nothing uses it now. Delete it so it can't be wired in by mistake. (P1, checked)
- **Insecure fallback secret** (see section 1) and **mock stock list in the PSX route** should not exist in production paths.
- **Tracked IDE state** (`.idea/`, Android `.idea/`). (P2)

## 6. Suggested order

1. Production safety: fail on missing `AUTH_SECRET`; rate-limit sign-in/sign-up; replace the fake-price fallback with an honest error; security headers; remove or lock `/debug`; delete the synthetic history route.
2. Store readiness: privacy policy + terms pages, account deletion, signed release build, decide the data-licence route (PSX/Deutsche Börse) or restrict to personal use.
3. Guardrails: a handful of end-to-end tests (sign-in, add trade, net total), unit tests for the indicator and portfolio maths, CI running type-check + build, then reduce lint errors until lint can gate.
4. Observability: error tracking + a scrape health check.
5. Product: dividends in returns, push notifications, native Google sign-in, KSE100 data, Technical Analysis link from stock pages, time-zone fix.
6. Tidy: remove tracked junk and stale docs, split the largest files.

## What was verified for this report

Checked directly: the session secret fallback, rate-limit coverage, security headers, tests/CI presence, tracked junk, root docs, the PSX mock fallback and its unused `note`, the `/debug` page, the synthetic history route, UTC date usage, file sizes, missing account-deletion route. Not verified: production environment settings (whether `AUTH_SECRET` is actually set on Vercel), database backups, Vercel/Mongo plan limits, and anything that needs a real device.
