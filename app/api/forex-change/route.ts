import { NextResponse } from "next/server";
import { fetchFxChangeServer } from "../../lib/fxChange";

// Browser-facing wrapper for lib/fxChange (Yahoo can't be called from the browser).
//   /api/forex-change?codes=USD,EUR,AED  ->  { data: { USD: { changePercent: 0.12 }, ... } }
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const codes = [...new Set((searchParams.get("codes") || "").toUpperCase().split(",").map(c => c.trim()).filter(c => /^[A-Z]{3}$/.test(c)))].slice(0, 60);
    if (codes.length === 0) return NextResponse.json({ success: false, error: "No valid currency codes" }, { status: 400 });
    return NextResponse.json({ success: true, data: await fetchFxChangeServer(codes) });
}
