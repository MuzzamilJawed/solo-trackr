import { NextResponse } from "next/server";
import dbConnect from "../../../lib/mongodb";
import Expense from "../../../models/Expense";
import { requireUser, fail } from "../../../lib/apiAuth";
import { normalizeExpense, type NormalizedExpense } from "../shape";

// Bulk hand-off of the browser's old localStorage expenses. All-or-nothing on
// validity: rows that fail validation are dropped and counted, never guessed at.
export async function POST(request: Request) {
  const { session, response } = await requireUser();
  if (!session) return response;
  try {
    const body = await request.json();
    const rows: unknown[] = Array.isArray(body?.expenses) ? body.expenses.slice(0, 5000) : [];
    const valid = rows.map(normalizeExpense).filter((r): r is NormalizedExpense => !("error" in r));
    if (valid.length === 0) return NextResponse.json({ success: true, data: { imported: 0, skipped: rows.length } });

    await dbConnect();
    const inserted = await Expense.insertMany(valid.map(r => ({ ...r, userId: session.uid })));
    return NextResponse.json({ success: true, data: { imported: inserted.length, skipped: rows.length - valid.length } });
  } catch (error) {
    console.error("[expenses] import failed:", error);
    return fail(error, "Failed to import expenses");
  }
}
