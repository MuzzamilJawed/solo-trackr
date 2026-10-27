"use client";

import { useEffect, useMemo, useState } from "react";
import { PiggyBank, Pencil, Check } from "lucide-react";

interface Spend { category: string; amount: number; date: string }

const KEY = "expenses.budgets.v1";
const load = (): Record<string, number> => {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
        return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch {
        return {};
    }
};

// Monthly per-category budgets for the CURRENT calendar month, with a bar that
// turns amber at 80% and red when the limit is passed.
export default function BudgetPanel({ expenses, categories, currency = "PKR" }: { expenses: Spend[]; categories: string[]; currency?: string }) {
    const [budgets, setBudgets] = useState<Record<string, number>>({});
    const [loaded, setLoaded] = useState(false);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBudgets(load());
        setLoaded(true);
    }, []);
    useEffect(() => {
        if (!loaded) return;
        try { localStorage.setItem(KEY, JSON.stringify(budgets)); } catch { /* private mode */ }
    }, [budgets, loaded]);

    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const spent = useMemo(() => {
        const m: Record<string, number> = {};
        for (const e of expenses) if (e.date?.startsWith(month)) m[e.category] = (m[e.category] || 0) + e.amount;
        return m;
    }, [expenses, month]);

    const fmt = (n: number) => `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const withBudget = categories.filter(c => (budgets[c] ?? 0) > 0);
    const over = withBudget.filter(c => (spent[c] || 0) > budgets[c]);

    return (
        <section aria-label="Monthly budgets" className="card p-5 sm:p-6 mb-8">
            <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5 min-w-0">
                    <PiggyBank className="w-5 h-5 text-blue-500 shrink-0" strokeWidth={2} aria-hidden />
                    <div className="min-w-0">
                        <h2 className="text-sm font-black text-zinc-900 dark:text-white">Monthly budgets</h2>
                        <p className="text-xs text-zinc-500">
                            {withBudget.length === 0 ? "Set a limit per category to track this month" : over.length ? `${over.length} over budget this month` : "All within budget this month"}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setEditing(e => !e)}
                    className="shrink-0 min-h-10 px-3 inline-flex items-center gap-1.5 rounded-xl bg-zinc-100 dark:bg-white/5 text-xs font-bold text-zinc-700 dark:text-zinc-300"
                >
                    {editing ? <><Check className="w-4 h-4" aria-hidden /> Done</> : <><Pencil className="w-4 h-4" aria-hidden /> Set budgets</>}
                </button>
            </div>

            {editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {categories.map(c => (
                        <label key={c} className="block">
                            <span className="text-xs font-bold text-zinc-500">{c}</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="any"
                                value={budgets[c] ?? ""}
                                placeholder="No limit"
                                onChange={e => {
                                    const v = parseFloat(e.target.value);
                                    setBudgets(b => {
                                        const next = { ...b };
                                        if (Number.isFinite(v) && v > 0) next[c] = v; else delete next[c];
                                        return next;
                                    });
                                }}
                                className="mt-1 w-full min-h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 text-base outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                            />
                        </label>
                    ))}
                </div>
            ) : (
                <ul className="space-y-4">
                    {withBudget.map(c => {
                        const s = spent[c] || 0;
                        const ratio = s / budgets[c];
                        const state = ratio > 1 ? "over" : ratio >= 0.8 ? "near" : "ok";
                        return (
                            <li key={c}>
                                <div className="flex items-baseline justify-between gap-3 text-sm">
                                    <span className="font-bold text-zinc-800 dark:text-zinc-200">{c}</span>
                                    <span className={`tabular-nums text-xs font-bold ${state === "over" ? "text-red-500" : state === "near" ? "text-amber-600 dark:text-amber-400" : "text-zinc-500"}`}>
                                        {fmt(s)} of {fmt(budgets[c])}{state === "over" ? ` · ${fmt(s - budgets[c])} over` : state === "near" ? " · nearly there" : ""}
                                    </span>
                                </div>
                                <div
                                    role="progressbar"
                                    aria-label={`${c} budget used`}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={Math.min(100, Math.round(ratio * 100))}
                                    className="mt-1.5 h-2 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden"
                                >
                                    <div className={`h-full rounded-full ${state === "over" ? "bg-red-500" : state === "near" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
