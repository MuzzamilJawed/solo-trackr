import { NextResponse } from "next/server";
import dbConnect from "../../../lib/mongodb";
import CorporateAction from "../../../models/CorporateAction";
import { requireUser, fail } from "../../../lib/apiAuth";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireUser();
  if (!session) return response;
  const { id } = await params;
  try {
    await dbConnect();
    const result = await CorporateAction.deleteOne({ _id: id, userId: session.uid });
    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, error: "Announcement not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error("[corporate-actions] DELETE failed:", error);
    return fail(error, "Failed to delete the announcement");
  }
}
