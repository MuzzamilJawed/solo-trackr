# SoloTrackr — Mobile App (Android + iOS)

The mobile apps are built with **[Capacitor](https://capacitorjs.com/)**. They wrap the
**exact same Next.js app** in a native shell (a WebView), so you get identical theme,
screens, and 100% of the functionality with **one codebase** — plus real, store-ready
Android and iOS projects, native splash screen, app icon, and status bar.

Because this app relies on server API routes + MongoDB + live scraping, the native
shell **loads your deployed Next.js server** (it is not a fully-offline bundle). You
point it at a URL you control.

---

## 1. One-time setup

Capacitor and the platform packages are already in `package.json`. Install deps:

```bash
npm install
```

### Point the app at your server

Edit the fallback in [`capacitor.config.ts`](./capacitor.config.ts) **or** pass the URL
at sync time via the `CAP_SERVER_URL` env var:

| Scenario   | URL example                          |
| ---------- | ------------------------------------ |
| Production | `https://your-domain.com`            |
| LAN dev    | `http://192.168.1.20:3005` (your PC's LAN IP while `npm run dev` runs) |

> Find your LAN IP: `ipconfig` (Windows) / `ifconfig` (macOS/Linux). The phone must be
> on the **same Wi-Fi** as your dev machine. `http://` (cleartext) is allowed
> automatically only for non-HTTPS URLs, for dev.

---

## 2. Generate the native projects

```bash
# Android (works on Windows / macOS / Linux)
npm run mobile:add:android

# iOS (macOS + Xcode only)
npm run mobile:add:ios
```

This creates `android/` and/or `ios/` folders (standard Android Studio / Xcode projects).

## 3. Generate app icons + splash screens

Source art lives in [`assets/`](./assets) (`logo.svg`, `splash.svg`, `splash-dark.svg`).
Generate every required native size:

```bash
npm run mobile:assets
```

## 4. Sync web config → native, then run

```bash
# Push capacitor.config.ts + plugins into the native projects
CAP_SERVER_URL=https://your-domain.com npm run mobile:sync

# Open in the native IDE…
npm run mobile:open:android      # Android Studio
npm run mobile:open:ios          # Xcode

# …or build+launch straight onto a connected device / emulator
npm run mobile:run:android
npm run mobile:run:ios
```

Re-run `npm run mobile:sync` (with `CAP_SERVER_URL`) whenever you change the config,
switch dev↔prod URLs, or add a Capacitor plugin.

---

## 5. Ship to the stores

- **Android:** in Android Studio → *Build → Generate Signed Bundle / APK* → produce a
  signed **`.aab`** → upload to Google Play Console.
- **iOS:** in Xcode → set your Team/signing → *Product → Archive* → distribute to
  App Store Connect.

Set the app identity in `capacitor.config.ts` before building:
`appId: com.solotrackr.app`, `appName: SoloTrackr` (change to your own bundle id).

---

## What you get out of the box

- ✅ Same UI/theme and **every screen** (dashboard, PSX/NASDAQ, forex, crypto, metals,
  oil, watchlist, portfolio, expenses, settings) — no rewrite.
- ✅ Native **splash screen** + **app icon** (dark `#050505`, α mark).
- ✅ **Status-bar** theming and **safe-area** insets (notch / home indicator) handled in CSS.
- ✅ Installable **PWA** too — on any phone, open the site → *Add to Home Screen*.

## Notes / tips

- The `mobile-shell/` folder is the tiny offline fallback shown while the remote URL
  loads (or if the server is unreachable). It is the Capacitor `webDir`.
- For native **push notifications**, add `@capacitor/push-notifications` and wire it to
  your backend — the current in-app toast/price-alert system stays as-is.
- Keep the server reachable over **HTTPS** in production (required by both stores for
  non-localhost traffic).
- `android/` and `ios/` are generated projects — you can commit them or keep them
  gitignored and regenerate with the `mobile:add:*` scripts.
