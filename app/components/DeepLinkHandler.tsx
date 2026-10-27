"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const isNativeShell = () => {
    if (typeof window === "undefined") return false;
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
};

/**
 * Opens links that Android/iOS hand to the app (e.g. the password-reset email)
 * inside the app instead of leaving them in the browser. Only links to the SAME
 * host the app is already serving are followed, and only as in-app paths.
 */
export default function DeepLinkHandler() {
    const router = useRouter();

    useEffect(() => {
        if (!isNativeShell()) return;
        let remove: (() => void) | undefined;
        let cancelled = false;

        (async () => {
            try {
                const { App } = await import("@capacitor/app");
                const handle = await App.addListener("appUrlOpen", ({ url }) => {
                    try {
                        const u = new URL(url);
                        if (u.host !== window.location.host) return;
                        router.push(`${u.pathname}${u.search}`);
                    } catch {
                        /* malformed link — ignore */
                    }
                });
                if (cancelled) handle.remove();
                else remove = () => handle.remove();
            } catch {
                /* plugin missing (browser/PWA) */
            }
        })();

        return () => {
            cancelled = true;
            remove?.();
        };
    }, [router]);

    return null;
}
