// Validation shared by the single-expense routes and the bulk import.

const METHODS = ["cash", "card", "transfer", "other"];

export interface NormalizedExpense {
  description: string;
  amount: number;
  category: string;
  date: string;
  paymentMethod: "cash" | "card" | "transfer" | "other";
  notes?: string;
}

export function normalizeExpense(body: any): NormalizedExpense | { error: string } {
  const description = String(body?.description || "").trim().slice(0, 200);
  const amount = Number(body?.amount);
  const category = String(body?.category || "").trim().slice(0, 40);
  const date = String(body?.date || "");
  const paymentMethod = METHODS.includes(body?.paymentMethod) ? body.paymentMethod : "cash";

  if (!description) return { error: "A description is required" };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be greater than zero" };
  if (!category) return { error: "A category is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date must be YYYY-MM-DD" };

  return {
    description,
    amount,
    category,
    date,
    paymentMethod,
    notes: body?.notes ? String(body.notes).slice(0, 500) : undefined,
  };
}
