"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastType = "success" | "error" | "info" | "loading";

interface Toast {
    id: number;
    type: ToastType;
    message: string;
    duration: number; // ms; 0 = sticky (must be dismissed manually / updated)
}

interface ToastContextType {
    /** Show a toast. Returns its id so it can be updated or dismissed later. */
    toast: (message: string, type?: ToastType, duration?: number) => number;
    success: (message: string, duration?: number) => number;
    error: (message: string, duration?: number) => number;
    info: (message: string, duration?: number) => number;
    /** Show a sticky "loading" toast — pair with update() once the action settles. */
    loading: (message: string) => number;
    /** Update an existing toast in place (e.g. loading → success). */
    update: (id: number, message: string, type?: ToastType, duration?: number) => void;
    dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const DEFAULT_DURATION = 3500;

const ICONS: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} />,
    error: <XCircle className="w-4 h-4" strokeWidth={2.5} />,
    info: <Info className="w-4 h-4" strokeWidth={2.5} />,
    loading: null,
};

const TONE: Record<ToastType, string> = {
    success: "text-green-500 bg-green-500/10 ring-green-500/20",
    error: "text-red-500 bg-red-500/10 ring-red-500/20",
    info: "text-blue-500 bg-blue-500/10 ring-blue-500/20",
    loading: "text-zinc-400 bg-zinc-500/10 ring-zinc-500/20",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const idRef = useRef(0);
    const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
    }, []);

    const schedule = useCallback((id: number, duration: number) => {
        const existing = timers.current.get(id);
        if (existing) clearTimeout(existing);
        if (duration > 0) {
            timers.current.set(id, setTimeout(() => dismiss(id), duration));
        } else {
            timers.current.delete(id);
        }
    }, [dismiss]);

    const toast = useCallback(
        (message: string, type: ToastType = "info", duration = DEFAULT_DURATION) => {
            const id = ++idRef.current;
            setToasts((prev) => [...prev, { id, type, message, duration }]);
            schedule(id, duration);
            return id;
        },
        [schedule]
    );

    const update = useCallback(
        (id: number, message: string, type: ToastType = "info", duration = DEFAULT_DURATION) => {
            setToasts((prev) => {
                if (!prev.some((t) => t.id === id)) {
                    // Toast already gone — recreate it so the outcome is never lost.
                    return [...prev, { id, type, message, duration }];
                }
                return prev.map((t) => (t.id === id ? { ...t, message, type, duration } : t));
            });
            schedule(id, duration);
        },
        [schedule]
    );

    const success = useCallback((m: string, d?: number) => toast(m, "success", d), [toast]);
    const error = useCallback((m: string, d?: number) => toast(m, "error", d ?? 5000), [toast]);
    const info = useCallback((m: string, d?: number) => toast(m, "info", d), [toast]);
    const loading = useCallback((m: string) => toast(m, "loading", 0), [toast]);

    return (
        <ToastContext.Provider value={{ toast, success, error, info, loading, update, dismiss }}>
            {children}
            <ToastViewport toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    // Screen readers only reliably announce changes inside a live region that
    // already exists, not nodes that arrive with their own role. So two
    // persistent regions mirror the newest toast: errors assertively, the rest
    // politely. The visible cards themselves are not live.
    const lastError = [...toasts].reverse().find((t) => t.type === "error");
    const lastPolite = [...toasts].reverse().find((t) => t.type === "success" || t.type === "info");

    return (
        <>
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {lastPolite && <span key={lastPolite.id}>{lastPolite.message}</span>}
            </div>
            <div className="sr-only" role="alert" aria-atomic="true">
                {lastError && <span key={lastError.id}>{lastError.message}</span>}
            </div>
        <div className="fixed z-[200] bottom-[var(--tabbar-h)] right-4 left-4 sm:left-auto pb-safe flex flex-col gap-2 items-stretch sm:items-end pointer-events-none">
            {toasts.map((t) => (
                <div
                    key={t.id}
                    onClick={() => onDismiss(t.id)}
                    className="card-float toast-item pointer-events-auto cursor-pointer w-full sm:w-auto sm:min-w-[16rem] sm:max-w-sm flex items-center gap-3 pl-3 pr-4 py-3 backdrop-blur-md"
                >
                    <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-black ring-1 ${TONE[t.type]}`}>
                        {t.type === "loading" ? (
                            <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        ) : (
                            ICONS[t.type]
                        )}
                    </span>
                    <p className="flex-1 text-xs font-bold text-zinc-800 dark:text-zinc-100 leading-snug">
                        {t.message}
                    </p>
                    <button
                        type="button"
                        aria-label="Dismiss notification"
                        onClick={(e) => { e.stopPropagation(); onDismiss(t.id); }}
                        className="shrink-0 -mr-2 w-10 h-10 flex items-center justify-center rounded-xl text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                    >
                        <X className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                </div>
            ))}
        </div>
        </>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}
