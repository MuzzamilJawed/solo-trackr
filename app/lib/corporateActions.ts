// Dividend / bonus / right-issue announcements with book-closure windows.
//
// Records are entered by the user (source "MANUAL"). The type is deliberately
// feed-agnostic: an automated provider (e.g. PSX company announcements) can
// create the same records with source "PSX" without any UI changes.

import type { Txn } from "./portfolio";

export type ActionKind = "DIVIDEND" | "BONUS" | "RIGHT" | "OTHER";

export interface CorporateAction {
  id: string;
  symbol: string;
  kind: ActionKind;
  details?: string;
  cashPerShare?: number;
  bonusRatio?: number;
  announcedOn?: string;
  exDate?: string;
  closureFrom: string;
  closureTo: string;
  paymentDate?: string;
  source: "MANUAL" | "PSX";
}

const fromApi = (d: any): CorporateAction => ({
  id: String(d._id ?? d.id),
  symbol: d.symbol,
  kind: d.kind,
  details: d.details || undefined,
  cashPerShare: d.cashPerShare ?? undefined,
  bonusRatio: d.bonusRatio ?? undefined,
  announcedOn: d.announcedOn || undefined,
  exDate: d.exDate || undefined,
  closureFrom: d.closureFrom,
  closureTo: d.closureTo,
  paymentDate: d.paymentDate || undefined,
  source: d.source === "PSX" ? "PSX" : "MANUAL",
});

export async function fetchActions(): Promise<{ data: CorporateAction[]; failed: boolean }> {
  try {
    const res = await fetch("/api/corporate-actions", { cache: "no-store" });
    const json = await res.json();
    if (json?.success && Array.isArray(json.data)) return { data: json.data.map(fromApi), failed: false };
    return { data: [], failed: true };
  } catch {
    return { data: [], failed: true };
  }
}

export async function addAction(a: Omit<CorporateAction, "id" | "source">): Promise<{ error?: string }> {
  try {
    const res = await fetch("/api/corporate-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a),
    });
    const json = await res.json();
    return json?.success ? {} : { error: json?.error || "Couldn't save the announcement" };
  } catch {
    return { error: "Network error — couldn't save the announcement" };
  }
}

export async function deleteAction(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/corporate-actions/${id}`, { method: "DELETE" });
    return !!(await res.json())?.success;
  } catch {
    return false;
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export const todayStr = () => new Date().toISOString().slice(0, 10);

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);

/**
 * The date by which you must already own the shares: the ex-date if known,
 * otherwise the day book closure starts (a conservative proxy — the real ex-date
 * is usually a business day before closure begins).
 */
export const entitlementDate = (a: CorporateAction) => a.exDate || a.closureFrom;

/** Units of `symbol` held at the START of `date`, from the trade ledger. */
export function quantityHeldBefore(txns: Txn[], symbol: string, date: string): number {
  let q = 0;
  for (const t of txns) {
    if (t.assetType !== "PSX" || t.symbol.toUpperCase() !== symbol.toUpperCase()) continue;
    if (t.date >= date) continue;
    q += t.type === "BUY" ? t.quantity : -t.quantity;
  }
  return Math.max(0, q);
}

export interface Entitlement {
  quantity: number;
  /** Cash expected in Rs, before any tax on dividends. null when not a cash dividend with an amount. */
  cash: number | null;
  /** New shares expected, for bonus issues. null otherwise. */
  bonusShares: number | null;
}

export function entitlementFor(a: CorporateAction, txns: Txn[]): Entitlement {
  const quantity = quantityHeldBefore(txns, a.symbol, entitlementDate(a));
  return {
    quantity,
    cash: a.kind === "DIVIDEND" && a.cashPerShare != null ? quantity * a.cashPerShare : null,
    bonusShares: a.kind === "BONUS" && a.bonusRatio != null ? Math.floor((quantity * a.bonusRatio) / 100) : null,
  };
}
