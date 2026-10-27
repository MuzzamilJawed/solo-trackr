import { NextResponse } from "next/server";
import dbConnect from "../../lib/mongodb";
import Expense from "../../models/Expense";
import { requireUser, fail } from "../../lib/apiAuth";
import { normalizeExpense } from "./shape";

export async function GET() {
  const { session, response } = await requireUser();
  if (!session) return response;
  try {
    await dbConnect();
    const data = await Expense.find({ userId: session.uid }).sort({ date: -1, createdAt: -1 }).limit(5000);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[expenses] GET failed:", error);
    return fail(error, "Failed to load your expenses");
  }
}

export async function POST(request: Request) {
  const { session, response } = await requireUser();
  if (!session) return response;
  try {
    const exp = normalizeExpense(await request.json());
    if ("error" in exp) return NextResponse.json({ success: false, error: exp.error }, { status: 400 });
    await dbConnect();
    const created = await Expense.create({ ...exp, userId: session.uid });
    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    console.error("[expenses] POST failed:", error);
    return fail(error, "Failed to save the expense");
  }
}
