"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { REFRESH_EVENT, type RefreshDetail } from "../lib/pullRefresh";

const TRIGGER = 40; // resisted pull distance (px) that fires a refresh — ~80px of finger travel
const MAX_PULL = 100;

const isNativeShell = () => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
};

// Native-shell only: browsers bring their own pull-to-refresh, and the native
// WebView has overscroll disabled (globals.css), so this supplies one.
export default function PullToRefresh() {
    const [pull, setPull] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const startY = useRef<number | null>(null);
    const pullRef = useRef(0);
    const busy = useRef(false);

    useEffect(() => {
        if (!isNativeShell()) return;

        // Don't hijack gestures that already mean something: charts pan, tables and
        // carousels scroll sideways, modals/drawers scroll themselves.
        const blocked = (el: EventTarget | null) =>
            el instanceof Element && !!el.closest("canvas, svg, input, textarea, select, [role='dialog'], [role='alertdialog'], aside, .overflow-x-auto, [data-no-ptr]");

        const onStart = (e: TouchEvent) => {
            startY.current = !busy.current && window.scrollY <= 0 && !blocked(e.target) ? e.touches[0].clientY : null;
        };
        const onMove = (e: TouchEvent) => {
            if (startY.current === null) return;
            const dy = e.touches[0].clientY - startY.current;
            if (dy <= 0 || window.scrollY > 0) {
                pullRef.current = 0;
                setPull(0);
                return;
            }
            pullRef.current = Math.min(MAX_PULL, dy * 0.5);
            setPull(pullRef.current);
        };
        const onEnd = async () => {
            const reached = pullRef.current >= TRIGGER && startY.current !== null;
            startY.current = null;
            pullRef.current = 0;
            setPull(0);
            if (!reached || busy.current) return;

            busy.current = true;
            setRefreshing(true);
            const detail: RefreshDetail = { tasks: [] };
            window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail }));
            // Keep the spinner up for at least a beat even if nothing listens.
            await Promise.allSettled([...detail.tasks, new Promise((r) => setTimeout(r, 600))]);
            setRefreshing(false);
            busy.current = false;
        };

        document.addEventListener("touchstart", onStart, { passive: true });
        document.addEventListener("touchmove", onMove, { passive: true });
        document.addEventListener("touchend", onEnd);
        document.addEventListener("touchcancel", onEnd);
        return () => {
            document.removeEventListener("touchstart", onStart);
            document.removeEventListener("touchmove", onMove);
            document.removeEventListener("touchend", onEnd);
            document.removeEventListener("touchcancel", onEnd);
        };
    }, []);

    const visible = refreshing || pull > 4;
    if (!visible) return null;

    const progress = Math.min(1, pull / TRIGGER);
    return (
        <div
            aria-hidden
            className="fixed left-1/2 z-[250] pointer-events-none -translate-x-1/2"
            style={{ top: `calc(var(--sa-top) + ${refreshing ? 12 : Math.max(0, pull - 28)}px)` }}
        >
            <div className="w-10 h-10 rounded-full bg-white dark:bg-zinc-800 shadow-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-blue-600">
                <RefreshCw
                    className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
                    style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)`, opacity: 0.4 + progress * 0.6 }}
                    strokeWidth={2.5}
                />
            </div>
        </div>
    );
}
