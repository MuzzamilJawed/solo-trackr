---
name: android-splash
description: How the SoloTrackr Android launch splash works (native overlay + web Splash hand-off) and how to change it. Use when touching Splash.tsx, MainActivity, splash drawables, capacitor.config.ts SplashScreen, or when the phone shows a tiny/static splash or a black screen after it.
---

# Android launch splash

Two splashes that look identical, one after the other:

1. **Native overlay** — `android/app/src/main/java/com/solotrackr/app/MainActivity.java` adds a full-size ImageView (animated `splash_web_launch.xml`) over the content from `onCreate`. Needed because Android 12+ clips a theme launch icon to a ~192dp circle (that is why the old one looked tiny). The theme (`AppTheme.NoActionBarLaunch` in `styles.xml`) only shows the background colour with the empty `splash_icon_none` icon; the Capacitor SplashScreen plugin is off (`launchShowDuration: 0`).
2. **Web `<Splash>`** (`app/components/Splash.tsx`) — takes over once painted, runs the same animation, and calls `window.SoloSplash.hide()` (a JS interface from MainActivity) ~250 ms after mounting to drop the overlay. It stays until the auth check is done AND real content (`main, form, nav`) has painted, min `MIN_MS`, max `MAX_MS` (20 s). Overlay has its own 25 s backstop. `mobile-shell/index.html` `fail()` also calls `SoloSplash.hide()`.

## Keep in sync
- `NATIVE_SCALE` (Splash.tsx, 1.25) ↔ `RING_DP` (MainActivity, 240 = 192 × scale). Drawable canvas 288dp, art ring 144dp (`DRAWN_RING_DP`).
- Drawables are GENERATED: edit `scripts/gen-android-splash.py` and run `python scripts/gen-android-splash.py` (writes `splash_web_icon/anim/intro/launch.xml`). Never hand-edit them. Validate with `aapt2 compile --dir android/app/src/main/res` (SDK build-tools 36.0.0).
- AVD gotchas: `android:ordering` is `together`/`sequentially`; infinite loops use `repeatCount=-1`.

## Dev setup
- Phone loads the LAN dev server: `server.url` in generated `android/app/src/main/assets/capacitor.config.json` (git-ignored; hand-edited because `cap sync` needs Node ≥ 22). Debug manifest allows cleartext.
- Black screen after splash usually = page still compiling/hydrating (Next dev is slow cold over LAN); test with a production build. Uninstall the app before reinstalling splash changes.
