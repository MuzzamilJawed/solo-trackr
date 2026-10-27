"use client";

import { useSyncExternalStore } from "react";
import { LOADING_CAPTION } from "../lib/caption";

interface Props {
    /** Epoch ms of the last SUCCESSFUL fetch, or null before the first one. */
    fetchedAt: number | null;
    /** True when the most recent refresh attempt failed. */
    failed?: boolean;
    loading?: boolean;
    onRetry?: () => void;
    prefix?: string;
}

function subscribeOnline(cb: () => void) {
    window.addEventListener("online", cb);
    window.addEventListener("offline", cb);
    return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
    };
}

// "Updated 14:32:07" for fresh data; an amber "refresh failed" with Retry when
// what's on screen is older than the last attempt. Also flags offline.
export default function FreshnessBadge({ fetchedAt, failed, loading, onRetry, prefix = "Updated" }: Props) {
    const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

    if (loading && fetchedAt === null) return <span>{LOADING_CAPTION}</span>;

    const time = fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : null;
    const stale = failed || !online;

    return (
        <span className="inline-flex items-center gap-2 flex-wrap">
            {time && <span>{prefix} {time}</span>}
            {stale && (
                <span role="status" className="text-amber-600 dark:text-amber-400">
                    {!online ? "Offline — showing last prices" : "Refresh failed — showing last prices"}
                </span>
            )}
            {stale && online && onRetry && (
                <button type="button" onClick={onRetry} className="underline min-h-6 px-1">Retry</button>
            )}
        </span>
    );
}
