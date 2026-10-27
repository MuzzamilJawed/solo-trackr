"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useBackHandler } from "../lib/backStack";

export interface ConfirmOptions {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Red confirm button — for deletes and other irreversible actions. */
    destructive?: boolean;
    /** The user must type this exact text before Confirm enables (e.g. "RESET"). */
    requireText?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

interface Pending extends ConfirmOptions {
    resolve: (ok: boolean) => void;
}

// Styled replacement for window.confirm(), which is jarring (and unstyled) in a
// WebView. `const ok = await confirm({ title: "Delete?", destructive: true })`.
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [pending, setPending] = useState<Pending | null>(null);
    const [typed, setTyped] = useState("");
    const cancelRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const confirm = useCallback<ConfirmFn>((opts) => new Promise<boolean>((resolve) => {
        setTyped("");
        setPending({ ...opts, resolve });
    }), []);

    const close = useCallback((ok: boolean) => {
        setPending((p) => {
            p?.resolve(ok);
            return null;
        });
    }, []);

    // Android Back / Escape cancel.
    useBackHandler(!!pending, () => close(false));
    useEffect(() => {
        if (!pending) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [pending, close]);

    // Land on the safe choice (Cancel), or on the input when typing is required.
    useEffect(() => {
        if (!pending) return;
        (pending.requireText ? inputRef.current : cancelRef.current)?.focus();
    }, [pending]);

    const canConfirm = !pending?.requireText || typed.trim() === pending.requireText;

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {pending && (
                <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => close(false)} />
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="confirm-title"
                        aria-describedby={pending.message ? "confirm-message" : undefined}
                        className="card relative w-full sm:max-w-md rounded-t-3xl p-6 pb-[max(1.5rem,var(--sa-bottom))] space-y-4"
                    >
                        <h2 id="confirm-title" className="text-lg font-black text-zinc-900 dark:text-white">{pending.title}</h2>
                        {pending.message && (
                            <p id="confirm-message" className="text-sm text-zinc-600 dark:text-zinc-400">{pending.message}</p>
                        )}
                        {pending.requireText && (
                            <div className="space-y-1.5">
                                <label htmlFor="confirm-input" className="text-xs font-bold text-zinc-500">
                                    Type <span className="font-mono text-zinc-900 dark:text-white">{pending.requireText}</span> to confirm
                                </label>
                                <input
                                    id="confirm-input"
                                    ref={inputRef}
                                    value={typed}
                                    onChange={(e) => setTyped(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) close(true); }}
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    className="w-full min-h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-4 text-base outline-none focus:ring-2 focus:ring-red-500 dark:text-white"
                                />
                            </div>
                        )}
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                            <button
                                ref={cancelRef}
                                type="button"
                                onClick={() => close(false)}
                                className="min-h-12 px-6 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold active:scale-95 transition-transform"
                            >
                                {pending.cancelLabel ?? "Cancel"}
                            </button>
                            <button
                                type="button"
                                disabled={!canConfirm}
                                onClick={() => close(true)}
                                className={`min-h-12 px-6 rounded-xl text-white text-sm font-bold active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 ${pending.destructive ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500"}`}
                            >
                                {pending.confirmLabel ?? (pending.destructive ? "Delete" : "Confirm")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

export function useConfirm(): ConfirmFn {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
    return ctx;
}
