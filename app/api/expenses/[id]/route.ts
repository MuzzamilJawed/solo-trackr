import { NextResponse } from "next/server";
import dbConnect from "../../../lib/mongodb";
import Expense from "../../../models/Expense";
import { requireUser, fail } from "../../../lib/apiAuth";
import { normalizeExpense } from "../shape";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireUser();
  if (!session) return response;
  const { id } = await params;
  try {
    const exp = normalizeExpense(await request.json());
    if ("error" in exp) return NextResponse.json({ success: false, error: exp.error }, { status: 400 });
    await dbConnect();
    const updated = await Expense.findOneAndUpdate(
      { _id: id, userId: session.uid },
      { $set: exp, ...(exp.notes ? {} : { $unset: { notes: "" } }) },
      { new: true, runValidators: true },
    );
    if (!updated) return NextResponse.json({ success: false, error: "Expense not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[expenses] PATCH failed:", error);
    return fail(error, "Failed to update the expense");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireUser();
  if (!session) return response;
  const { id } = await params;
  try {
    await dbConnect();
    const result = await Expense.deleteOne({ _id: id, userId: session.uid });
    if (result.deletedCount === 0) return NextResponse.json({ success: false, error: "Expense not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error("[expenses] DELETE failed:", error);
    return fail(error, "Failed to delete the expense");
  }
}
