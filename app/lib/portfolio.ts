// Portfolio ledger — BUY/SELL transactions for the signed-in user, stored in
// MongoDB via /api/portfolio. Holdings and realized/unrealized P/L are derived
// here (average-cost method) so the maths stays in one place.
//
// Components refresh by listening for the "portfolio" window event, which every
// mutation below dispatches.

import type { AssetType } from "./prices";

export interface Txn {
  id: string;
  date: string; // YYYY-MM-DD
  type: "BUY" | "SELL";
  assetType: AssetType;
  symbol: string; // uppercased
  name?: string;
  quantity: number;
  price: number; // per-unit, in `currency`
  currency: "PKR" | "USD";
  brokerage?: number; // fee value, as a percentage or flat amount
  brokerageMode?: BrokerageMode;
  note?: string;
}

export type BrokerageMode = "PERCENT" | "AMOUNT";

const hasWindow = () => typeof window !== "undefined";
const emit = () => {
  if (hasWindow()) window.dispatchEvent(new CustomEvent("portfolio"));
};

const fromApi = (doc: any): Txn => ({
  id: String(doc._id ?? doc.id),
  date: doc.date,
  type: doc.type,
  assetType: doc.assetType,
  symbol: doc.symbol,
  name: doc.name || undefined,
  quantity: Number(doc.quantity) || 0,
  price: Number(doc.price) || 0,
  currency: doc.currency,
  brokerage: Number(doc.brokerage) || 0,
  brokerageMode: doc.brokerageMode === "AMOUNT" ? "AMOUNT" : "PERCENT",
  note: doc.note || undefined,
});

/** All transactions for the signed-in user; empty when signed out. */
export async function fetchTxns(): Promise<Txn[]> {
  try {
    const res = await fetch("/api/portfolio", { cache: "no-store" });
    const json = await res.json();
    return json?.success && Array.isArray(json.data)
      ? json.data.map(fromApi)
      : [];
  } catch {
    return [];
  }
}

export async function addTxn(
  t: Omit<Txn, "id">,
): Promise<{ txn?: Txn; error?: string }> {
  try {
    const res = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...t, symbol: t.symbol.trim().toUpperCase() }),
    });
    const json = await res.json();
    if (!json?.success)
      return { error: json?.error || "Couldn't record the trade" };
    emit();
    return { txn: fromApi(json.data) };
  } catch {
    return { error: "Network error — couldn't record the trade" };
  }
}

export async function updateTxn(
  id: string,
  t: Omit<Txn, "id">,
): Promise<{ txn?: Txn; error?: string }> {
  try {
    const res = await fetch(`/api/portfolio/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...t, symbol: t.symbol.trim().toUpperCase() }),
    });
    const json = await res.json();
    if (!json?.success)
      return { error: json?.error || "Couldn't update the trade" };
    emit();
    return { txn: fromApi(json.data) };
  } catch {
    return { error: "Network error — couldn't update the trade" };
  }
}

export async function deleteTxn(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json?.success) emit();
    return !!json?.success;
  } catch {
    return false;
  }
}

export async function clearTxns(): Promise<{
  success: boolean;
  deleted: number;
}> {
  try {
    const res = await fetch("/api/portfolio", { method: "DELETE" });
    const json = await res.json();
    const success = !!json?.success;
    const deleted = Number(json?.data?.deleted) || 0;
    if (success) emit();
    return { success, deleted };
  } catch {
    return { success: false, deleted: 0 };
  }
}

export async function importTxns(txns: Omit<Txn, "id">[]): Promise<number> {
  try {
    const res = await fetch("/api/portfolio/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txns }),
    });
    const json = await res.json();
    if (json?.success) emit();
    return json?.data?.imported ?? 0;
  } catch {
    return 0;
  }
}

// ── Legacy localStorage ledger (pre-accounts) ───────────────────────────────
// Read once on first sign-in so an existing browser's trades follow the user
// into their account, then dropped.

const LEGACY_KEY = "portfolio.txns.v1";

export function readLegacyTxns(): Txn[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function clearLegacyTxns() {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

// ── Derivation (pure) ───────────────────────────────────────────────────────

export interface Holding {
  assetType: AssetType;
  symbol: string;
  name?: string;
  quantity: number;
  avgCost: number; // per-unit in `currency`
  currency: "PKR" | "USD";
}

export interface Derived {
  holdings: Holding[];
  realized: { PKR: number; USD: number };
}

export function brokerageAmount(
  t: Pick<Txn, "quantity" | "price" | "brokerage" | "brokerageMode">,
  quantity = t.quantity,
): number {
  const feeValue = Math.max(0, Number(t.brokerage) || 0);
  const tradeQuantity = Math.max(0, Number(t.quantity) || 0);
  const appliedQuantity = Math.max(0, Number(quantity) || 0);
  if (t.brokerageMode === "AMOUNT") {
    return tradeQuantity > 0
      ? feeValue * Math.min(1, appliedQuantity / tradeQuantity)
      : 0;
  }
  return (appliedQuantity * (Number(t.price) || 0) * feeValue) / 100;
}

/**
 * What the trade actually cost or returned, brokerage included: a BUY costs
 * gross + fee, a SELL returns gross - fee. (Gross is quantity x price.)
 */
export function tradeTotal(
  t: Pick<Txn, "type" | "quantity" | "price" | "brokerage" | "brokerageMode">,
): number {
  const gross = (Number(t.quantity) || 0) * (Number(t.price) || 0);
  const fee = brokerageAmount(t);
  return t.type === "BUY" ? gross + fee : gross - fee;
}

// Average-cost accounting, processed in chronological order.
export function computeHoldings(txns: Txn[]): Derived {
  const sorted = [...txns].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const book = new Map<string, Holding>();
  const realized = { PKR: 0, USD: 0 };

  for (const t of sorted) {
    const key = `${t.assetType}:${t.symbol.toUpperCase()}:${t.currency}`;
    const h = book.get(key) || {
      assetType: t.assetType,
      symbol: t.symbol.toUpperCase(),
      name: t.name,
      quantity: 0,
      avgCost: 0,
      currency: t.currency,
    };
    const qty = Math.abs(Number(t.quantity) || 0);
    const price = Number(t.price) || 0;
    if (t.name) h.name = t.name;

    if (t.type === "BUY") {
      const newQty = h.quantity + qty;
      h.avgCost =
        newQty > 0
          ? (h.avgCost * h.quantity + price * qty + brokerageAmount(t)) / newQty
          : 0;
      h.quantity = newQty;
    } else {
      const sellQty = Math.min(qty, h.quantity); // can't sell more than held
      realized[t.currency] +=
        (price - h.avgCost) * sellQty - brokerageAmount(t, sellQty);
      h.quantity -= sellQty;
    }
    book.set(key, h);
  }

  const holdings = Array.from(book.values()).filter((h) => h.quantity > 1e-9);
  return { holdings, realized };
}

// CSV export of a set of transactions.
export function txnsToCsv(txns: Txn[]): string {
  const head = [
    "Date",
    "Type",
    "Asset",
    "Symbol",
    "Name",
    "Quantity",
    "Price",
    "Currency",
    "Brokerage",
    "Brokerage Mode",
    "Brokerage Fee",
    "Value",
    "Net Total",
  ];
  const rows = txns.map((t) => [
    t.date,
    t.type,
    t.assetType,
    t.symbol,
    (t.name || "").replace(/,/g, " "),
    String(t.quantity),
    String(t.price),
    t.currency,
    String(t.brokerage || 0),
    t.brokerageMode || "PERCENT",
    String(brokerageAmount(t)),
    String((Number(t.quantity) || 0) * (Number(t.price) || 0)),
    String(tradeTotal(t)),
  ]);
  return [head, ...rows].map((r) => r.join(",")).join("\n");
}
