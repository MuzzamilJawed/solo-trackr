import { NextResponse } from "next/server";
import dbConnect from "../../lib/mongodb";
import CorporateAction from "../../models/CorporateAction";
import { requireUser, fail } from "../../lib/apiAuth";

const KINDS = ["DIVIDEND", "BONUS", "RIGHT", "OTHER"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const optDate = (v: unknown): string | undefined | null => {
  if (v == null || v === "") return undefined;
  return typeof v === "string" && DATE.test(v) ? v : null; // null = invalid
};
const optNum = (v: unknown): number | undefined | null => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function GET() {
  const { session, response } = await requireUser();
  if (!session) return response;
  try {
    await dbConnect();
    const data = await CorporateAction.find({ userId: session.uid }).sort({ closureFrom: -1 }).limit(500);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[corporate-actions] GET failed:", error);
    return fail(error, "Failed to load announcements");
  }
}

export async function POST(request: Request) {
  const { session, response } = await requireUser();
  if (!session) return response;
  try {
    const body = await request.json();
    const symbol = String(body?.symbol || "").trim().toUpperCase();
    const kind = String(body?.kind || "");
    const closureFrom = optDate(body?.closureFrom);
    const closureTo = optDate(body?.closureTo);
    const announcedOn = optDate(body?.announcedOn);
    const exDate = optDate(body?.exDate);
    const paymentDate = optDate(body?.paymentDate);
    const cashPerShare = optNum(body?.cashPerShare);
    const bonusRatio = optNum(body?.bonusRatio);

    const bad = (error: string) => NextResponse.json({ success: false, error }, { status: 400 });
    if (!symbol) return bad("A symbol is required");
    if (!KINDS.includes(kind)) return bad("Unknown announcement type");
    if (!closureFrom || !closureTo) return bad("Book closure start and end dates are required (YYYY-MM-DD)");
    if (closureTo < closureFrom) return bad("Book closure can't end before it starts");
    if (announcedOn === null || exDate === null || paymentDate === null) return bad("Dates must be YYYY-MM-DD");
    if (cashPerShare === null || bonusRatio === null) return bad("Amounts must be zero or greater");

    await dbConnect();
    const created = await CorporateAction.create({
      userId: session.uid,
      symbol,
      kind,
      details: body?.details ? String(body.details).slice(0, 200) : undefined,
      cashPerShare,
      bonusRatio,
      announcedOn,
      exDate,
      closureFrom,
      closureTo,
      paymentDate,
      source: "MANUAL",
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    console.error("[corporate-actions] POST failed:", error);
    return fail(error, "Failed to save the announcement");
  }
}
