"use client";

import { useEffect, useRef } from "react";

// Android's hardware/gesture Back button should dismiss the topmost overlay
// (drawer, sheet, modal) before it navigates. Overlays register a handler while
// they are open; <BackButtonHandler> walks them newest-first.

type Handler = () => void;
const stack: Handler[] = [];

/** Pops the newest registered overlay. Returns true when one was closed. */
export function runBackHandler(): boolean {
    const top = stack[stack.length - 1];
    if (!top) return false;
    top();
    return true;
}

/** While `active`, Back calls `onBack` (which should close the overlay). */
export function useBackHandler(active: boolean, onBack: Handler) {
    const ref = useRef(onBack);
    useEffect(() => { ref.current = onBack; });

    useEffect(() => {
        if (!active) return;
        const h: Handler = () => ref.current();
        stack.push(h);
        return () => {
            const i = stack.lastIndexOf(h);
            if (i >= 0) stack.splice(i, 1);
        };
    }, [active]);
}
