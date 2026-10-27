---
name: ui-conventions
description: SoloTrackr UI rules — Tailwind v4 dark mode, shared card classes, safe areas, mobile nav, theming. Use when adding or restyling components/pages so they stay consistent in light/dark and on the phone shell.
---

# UI conventions

- Tailwind v4: dark mode via `@variant dark` (class based). Use `dark:bg-app-dark` (`--color-app-dark: #050505`), never raw `bg-black`/`bg-[#050505]`.
- Cards use the shared CSS classes in `app/globals.css` (`@layer components`); don't re-style cards per page. Check the card classes there before inventing new ones.
- Mobile shell: bottom tab bar (`BottomNav`, sets `has-tabbar` / `--tabbar-h`), safe areas via `--sa-top` / `--sa-bottom` and `<SafeArea>`; pull-to-refresh is native-shell only (`PullToRefresh`, `usePullRefresh`); Back button via `useBackHandler` (`app/lib/backStack.ts`).
- Loading/stale data: `FreshnessBadge`, `LOADING_CAPTION`; avoid flashing `Rs.0.00` before data loads.
- Alerts are transient notifications (holding news via `HoldingNotifier`), not permanent panels.
- Symbol entry uses `SymbolPicker` (searches all PSX symbols by ticker/name), not a native datalist.
- Audit history and remaining UI debt: `docs/UIUX_AUDIT.md`, `docs/GAP_REPORT.md`.
