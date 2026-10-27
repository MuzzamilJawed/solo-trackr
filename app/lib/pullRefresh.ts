"use client";

import { useEffect, useRef } from "react";

// Pull-to-refresh plumbing. <PullToRefresh> fires REFRESH_EVENT; a screen opts
// in with usePullRefresh(fn) and returns the promise of its reload so the
// spinner stays until it settles.

export const REFRESH_EVENT = "app:refresh";

export interface RefreshDetail {
    tasks: Promise<unknown>[];
}

export function usePullRefresh(refresh: () => unknown | Promise<unknown>) {
    const ref = useRef(refresh);
    useEffect(() => { ref.current = refresh; });

    useEffect(() => {
        const onRefresh = (e: Event) => {
            (e as CustomEvent<RefreshDetail>).detail.tasks.push(Promise.resolve(ref.current()));
        };
        window.addEventListener(REFRESH_EVENT, onRefresh);
        return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
    }, []);
}
