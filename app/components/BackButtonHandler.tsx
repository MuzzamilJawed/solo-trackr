"use client";

import { useEffect } from "react";
import { runBackHandler } from "../lib/backStack";

const isNativeShell = () => {
    if (typeof window === "undefined") return false;
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
};

/**
 * Android Back inside the Capacitor shell: close the topmost overlay, else go
 * back in history, else leave the app. Without a listener Capacitor's default
 * is to exit (or walk WebView history) even with the drawer open.
 */
export default function BackButtonHandler() {
    useEffect(() => {
        if (!isNativeShell()) return;
        let remove: (() => void) | undefined;
        let cancelled = false;

        (async () => {
            try {
                const { App } = await import("@capacitor/app");
                const handle = await App.addListener("backButton", ({ canGoBack }) => {
                    if (runBackHandler()) return;
                    if (canGoBack || window.history.length > 1) window.history.back();
                    else App.exitApp();
                });
                if (cancelled) handle.remove();
                else remove = () => handle.remove();
            } catch {
                /* plugin missing (browser/PWA) — nothing to wire */
            }
        })();

        return () => {
            cancelled = true;
            remove?.();
        };
    }, []);

    return null;
}
