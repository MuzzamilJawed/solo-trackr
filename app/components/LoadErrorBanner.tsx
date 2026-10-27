"use client";

import { AlertTriangle } from "lucide-react";

interface Props {
    /** True when data is on screen but a refresh failed (shows "last data"). */
    hasData: boolean;
    what: string;
    onRetry: () => void;
}

// Inline, persistent counterpart to the error toast: a failed load must not
// look like "no results".
export default function LoadErrorBanner({ hasData, what, onRetry }: Props) {
    return (
        <div role="alert" className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0" strokeWidth={2} aria-hidden />
            <p className="flex-1 min-w-0 text-sm font-bold">
                {hasData ? `Couldn't refresh ${what} — showing the last data.` : `Couldn't load ${what}.`}
            </p>
            <button
                type="button"
                onClick={onRetry}
                className="shrink-0 min-h-10 px-4 rounded-xl bg-amber-500 text-black text-xs font-black uppercase tracking-widest active:scale-95 transition-transform"
            >
                Retry
            </button>
        </div>
    );
}
