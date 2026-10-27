"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2, X } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import type { Txn } from "../lib/portfolio";
import {
    addAction, daysBetween, deleteAction, entitlementDate, entitlementFor, fetchActions, todayStr,
    type ActionKind, type CorporateAction,
} from "../lib/corporateActions";

const KIND_LABEL: Record<ActionKind, string> = { DIVIDEND: "Dividend", BONUS: "Bonus shares", RIGHT: "Right issue", OTHER: "Other" };
const KIND_TONE: Record<ActionKind, string> = {
    DIVIDEND: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    BONUS: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    RIGHT: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    OTHER: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const rs = (n: number) => `Rs ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const inputCls = "mt-1 w-full min-h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 text-base outline-none focus:ring-2 focus:ring-blue-500 dark:text-white";

const blank = { symbol: "", kind: "DIVIDEND" as ActionKind, details: "", cashPerShare: "", bonusRatio: "", closureFrom: "", closureTo: "", exDate: "", paymentDate: "" };

// Upcoming dividends / bonuses / rights with their book-closure windows, matched
// against what you actually held, so it can say what you'd receive and the last
// day to own the shares. Entries are added by hand for now.
export default function CorporateActionsCard({ txns, heldSymbols }: { txns: Txn[]; heldSymbols: string[] }) {
    const { success, error } = useToast();
    const confirm = useConfirm();
    const [actions, setActions] = useState<CorporateAction[]>([]);
    const [loadFailed, setLoadFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(blank);
    const [saving, setSaving] = useState(false);
    const [showPast, setShowPast] = useState(false);

    const reload = useCallback(async () => {
        const res = await fetchActions();
        setActions(res.data);
        setLoadFailed(res.failed);
        setLoaded(true);
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        reload();
    }, [reload]);

    const today = todayStr();
    const held = useMemo(() => new Set(heldSymbols.map(s => s.toUpperCase())), [heldSymbols]);

    const { upcoming, past } = useMemo(() => {
        const up = actions.filter(a => a.closureTo >= today).sort((a, b) => (a.closureFrom < b.closureFrom ? -1 : 1));
        const pa = actions.filter(a => a.closureTo < today).sort((a, b) => (a.closureTo < b.closureTo ? 1 : -1));
        return { upcoming: up, past: pa };
    }, [actions, today]);

    const set = (patch: Partial<typeof blank>) => setForm(f => ({ ...f, ...patch }));

    const submit = async () => {
        if (saving) return;
        const symbol = form.symbol.trim().toUpperCase();
        if (!symbol) { error("Enter a symbol"); return; }
        if (!form.closureFrom || !form.closureTo) { error("Enter the book closure start and end dates"); return; }
        if (form.closureTo < form.closureFrom) { error("Book closure can't end before it starts"); return; }
        if (form.exDate && form.exDate > form.closureFrom) { error("The ex-date should be on or before the closure starts"); return; }
        setSaving(true);
        const res = await addAction({
            symbol,
            kind: form.kind,
            details: form.details.trim() || undefined,
            cashPerShare: form.kind === "DIVIDEND" && form.cashPerShare !== "" ? Number(form.cashPerShare) : undefined,
            bonusRatio: form.kind === "BONUS" && form.bonusRatio !== "" ? Number(form.bonusRatio) : undefined,
            closureFrom: form.closureFrom,
            closureTo: form.closureTo,
            exDate: form.exDate || undefined,
            paymentDate: form.paymentDate || undefined,
        });
        setSaving(false);
        if (res.error) { error(res.error); return; }
        success(`${symbol} ${KIND_LABEL[form.kind].toLowerCase()} saved`);
        setForm(blank);
        setShowForm(false);
        reload();
    };

    const remove = async (a: CorporateAction) => {
        if (!(await confirm({ title: `Delete ${a.symbol} announcement?`, message: `${KIND_LABEL[a.kind]} · closure ${fmtDate(a.closureFrom)}`, destructive: true }))) return;
        if (await deleteAction(a.id)) { success("Announcement deleted"); reload(); } else error("Couldn't delete that announcement");
    };

    const row = (a: CorporateAction, isPast: boolean) => {
        const ent = entitlementFor(a, txns);
        const isHeld = ent.quantity > 0;
        const entDate = entitlementDate(a);
        const toEnt = daysBetween(today, entDate);
        const open = a.closureFrom <= today && today <= a.closureTo;
        return (
            <li key={a.id} className={`card-inset px-4 py-3 ${isPast ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-zinc-900 dark:text-white">{a.symbol}</span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${KIND_TONE[a.kind]}`}>{KIND_LABEL[a.kind]}</span>
                            {a.cashPerShare != null && <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">{rs(a.cashPerShare)}/share</span>}
                            {a.bonusRatio != null && <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">{a.bonusRatio} per 100</span>}
                        </div>
                        {a.details && <p className="text-xs text-zinc-500 mt-0.5">{a.details}</p>}
                        <p className="text-xs text-zinc-500 mt-1 tabular-nums">
                            Book closure {fmtDate(a.closureFrom)} – {fmtDate(a.closureTo)}
                            {a.exDate && ` · ex-date ${fmtDate(a.exDate)}`}
                            {a.paymentDate && ` · paid ${fmtDate(a.paymentDate)}`}
                        </p>
                    </div>
                    <button type="button" onClick={() => remove(a)} aria-label={`Delete ${a.symbol} announcement`} className="shrink-0 -m-2 min-w-10 min-h-10 inline-flex items-center justify-center text-zinc-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                </div>
                {!isPast && (
                    <p className={`text-xs font-bold mt-2 ${isHeld ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-500"}`}>
                        {open ? "Book closure is open now. " : ""}
                        {toEnt >= 0
                            ? <>{isHeld ? `You hold ${ent.quantity.toLocaleString()} — ` : "Not held — "}{toEnt === 0 ? "last day to own it is today" : `buy by ${fmtDate(entDate)} (${toEnt} day${toEnt === 1 ? "" : "s"})`}</>
                            : isHeld ? `Entitled with ${ent.quantity.toLocaleString()} shares` : "Entitlement date has passed"}
                        {isHeld && ent.cash != null && <span className="text-emerald-600 dark:text-emerald-400"> · expect {rs(ent.cash)} before tax</span>}
                        {isHeld && ent.bonusShares != null && <span className="text-blue-600 dark:text-blue-400"> · expect {ent.bonusShares.toLocaleString()} bonus shares</span>}
                    </p>
                )}
            </li>
        );
    };

    return (
        <section aria-label="Dividends and book closures" className="card ">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <CalendarClock className="w-5 h-5 shrink-0 text-blue-500" strokeWidth={2} aria-hidden />
                    <div className="min-w-0">
                        <h2 className="text-sm font-black text-zinc-900 dark:text-white">Dividends &amp; book closures</h2>
                        <p className="text-xs text-zinc-500 truncate">
                            {!loaded ? "Loading…" : upcoming.length ? `${upcoming.length} upcoming · ${upcoming.filter(a => held.has(a.symbol)).length} on stocks you hold` : "Nothing upcoming"}
                        </p>
                    </div>
                </div>
                <button type="button" onClick={() => setShowForm(s => !s)} className="shrink-0 min-h-10 px-3 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">
                    {showForm ? <><X className="w-4 h-4" aria-hidden /> Close</> : <><Plus className="w-4 h-4" aria-hidden /> Add</>}
                </button>
            </div>

            {loadFailed && <p role="alert" className="px-4 sm:px-6 pb-3 text-sm text-amber-600 dark:text-amber-400">Couldn&apos;t load your announcements. <button type="button" onClick={reload} className="underline">Retry</button></p>}

            {showForm && (
                <div className="border-t border-zinc-100 dark:border-white/5 px-4 sm:px-6 py-4 space-y-3">
                    <p className="text-xs text-zinc-500">Copy the dates from the company&apos;s book-closure notice on PSX. Nothing is fetched automatically yet.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <label className="block"><span className="text-xs font-bold text-zinc-500">Symbol</span>
                            <input list="ca-symbols" value={form.symbol} onChange={e => set({ symbol: e.target.value.toUpperCase() })} autoCapitalize="characters" placeholder="e.g. HUBC" className={inputCls} />
                            <datalist id="ca-symbols">{heldSymbols.map(s => <option key={s} value={s} />)}</datalist>
                        </label>
                        <label className="block"><span className="text-xs font-bold text-zinc-500">Type</span>
                            <select value={form.kind} onChange={e => set({ kind: e.target.value as ActionKind })} className={inputCls}>
                                {(Object.keys(KIND_LABEL) as ActionKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                            </select>
                        </label>
                        {form.kind === "DIVIDEND" && (
                            <label className="block"><span className="text-xs font-bold text-zinc-500">Cash per share (Rs)</span>
                                <input type="number" inputMode="decimal" min="0" step="any" value={form.cashPerShare} onChange={e => set({ cashPerShare: e.target.value })} placeholder="e.g. 2.5" className={inputCls} />
                            </label>
                        )}
                        {form.kind === "BONUS" && (
                            <label className="block"><span className="text-xs font-bold text-zinc-500">Bonus shares per 100 held</span>
                                <input type="number" inputMode="decimal" min="0" step="any" value={form.bonusRatio} onChange={e => set({ bonusRatio: e.target.value })} placeholder="e.g. 10" className={inputCls} />
                            </label>
                        )}
                        <label className="block"><span className="text-xs font-bold text-zinc-500">Note (optional)</span>
                            <input value={form.details} maxLength={200} onChange={e => set({ details: e.target.value })} placeholder="e.g. Final cash dividend 25%" className={inputCls} />
                        </label>
                        <label className="block"><span className="text-xs font-bold text-zinc-500">Closure starts</span>
                            <input type="date" value={form.closureFrom} onChange={e => set({ closureFrom: e.target.value, closureTo: form.closureTo || e.target.value })} className={inputCls} />
                        </label>
                        <label className="block"><span className="text-xs font-bold text-zinc-500">Closure ends</span>
                            <input type="date" value={form.closureTo} min={form.closureFrom || undefined} onChange={e => set({ closureTo: e.target.value })} className={inputCls} />
                        </label>
                        <label className="block"><span className="text-xs font-bold text-zinc-500">Ex-date (optional)</span>
                            <input type="date" value={form.exDate} onChange={e => set({ exDate: e.target.value })} className={inputCls} />
                        </label>
                        <label className="block"><span className="text-xs font-bold text-zinc-500">Payment date (optional)</span>
                            <input type="date" value={form.paymentDate} onChange={e => set({ paymentDate: e.target.value })} className={inputCls} />
                        </label>
                    </div>
                    <div className="flex justify-end">
                        <button type="button" onClick={submit} disabled={saving} className="min-h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold">{saving ? "Saving…" : "Save announcement"}</button>
                    </div>
                </div>
            )}

            {loaded && upcoming.length > 0 && <ul className="px-4 sm:px-6 pb-4 space-y-2.5">{upcoming.map(a => row(a, false))}</ul>}
            {loaded && upcoming.length === 0 && !showForm && !loadFailed && (
                <p className="px-4 sm:px-6 pb-4 text-xs text-zinc-500">Add a book-closure announcement to see when to hold a stock by and what you&apos;d receive.</p>
            )}

            {past.length > 0 && (
                <div className="border-t border-zinc-100 dark:border-white/5 px-4 sm:px-6 py-3">
                    <button type="button" onClick={() => setShowPast(s => !s)} aria-expanded={showPast} className="text-xs font-bold text-zinc-500 min-h-10">
                        {showPast ? "Hide" : "Show"} past announcements ({past.length})
                    </button>
                    {showPast && <ul className="mt-2 space-y-2.5">{past.map(a => row(a, true))}</ul>}
                </div>
            )}
        </section>
    );
}
