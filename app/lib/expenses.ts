// Personal expenses, stored per user in MongoDB via /api/expenses.
//
// They used to live only in this browser's localStorage ("expenses"). The first
// load after sign-in hands any such data to the account — see migrateLegacy().

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string; // YYYY-MM-DD
  paymentMethod: "cash" | "card" | "transfer" | "other";
  notes?: string;
}

export type ExpenseInput = Omit<Expense, "id">;

const fromApi = (d: any): Expense => ({
  id: String(d._id ?? d.id),
  description: d.description,
  amount: Number(d.amount) || 0,
  category: d.category,
  date: d.date,
  paymentMethod: d.paymentMethod ?? "cash",
  notes: d.notes || undefined,
});

export async function fetchExpenses(): Promise<{ data: Expense[]; failed: boolean }> {
  try {
    const res = await fetch("/api/expenses", { cache: "no-store" });
    const json = await res.json();
    if (json?.success && Array.isArray(json.data)) return { data: json.data.map(fromApi), failed: false };
    return { data: [], failed: true };
  } catch {
    return { data: [], failed: true };
  }
}

async function send(url: string, method: string, body?: unknown): Promise<{ expense?: Expense; error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!json?.success) return { error: json?.error || "Couldn't save the expense" };
    return { expense: json.data?._id ? fromApi(json.data) : undefined };
  } catch {
    return { error: "Network error — couldn't save the expense" };
  }
}

export const addExpense = (e: ExpenseInput) => send("/api/expenses", "POST", e);
export const updateExpense = (id: string, e: ExpenseInput) => send(`/api/expenses/${id}`, "PATCH", e);
export const deleteExpense = async (id: string) => !(await send(`/api/expenses/${id}`, "DELETE")).error;

// ── Legacy localStorage hand-off ────────────────────────────────────────────

const LEGACY_KEY = "expenses";

export function readLegacyExpenses(): ExpenseInput[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.map((e: any) => ({
          description: String(e?.description ?? ""),
          amount: Number(e?.amount),
          category: String(e?.category ?? "Other"),
          date: String(e?.date ?? ""),
          paymentMethod: e?.paymentMethod,
          notes: e?.notes || undefined,
        }))
      : [];
  } catch {
    return [];
  }
}

/**
 * Moves this browser's old expenses into the account — only when the account has
 * none yet, and the local copy is removed only after EVERY row was accepted, so
 * a failed or partial import never loses data. Returns the number imported.
 */
export async function migrateLegacyExpenses(): Promise<number> {
  const legacy = readLegacyExpenses();
  if (legacy.length === 0) return 0;
  try {
    const res = await fetch("/api/expenses/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expenses: legacy }),
    });
    const json = await res.json();
    const imported = json?.data?.imported ?? 0;
    const skipped = json?.data?.skipped ?? 0;
    // Keep the local copy if anything was rejected, so nothing is silently lost.
    if (json?.success && imported + skipped >= legacy.length && skipped === 0) {
      localStorage.removeItem(LEGACY_KEY);
    }
    return imported;
  } catch {
    return 0;
  }
}
