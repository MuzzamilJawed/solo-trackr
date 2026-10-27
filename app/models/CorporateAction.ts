import mongoose from "mongoose";
import { registerModel } from "../lib/registerModel";

// A dividend / bonus / right-issue announcement with its book-closure window,
// recorded per user. Entered by hand today; the shape is what an automated feed
// (PSX announcements) would also fill — see lib/corporateActions.ts.
export interface ICorporateAction extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  symbol: string;
  kind: "DIVIDEND" | "BONUS" | "RIGHT" | "OTHER";
  details?: string; // free text, e.g. "Final cash dividend 25%"
  cashPerShare?: number; // Rs per share, for DIVIDEND — drives the payout estimate
  bonusRatio?: number; // new shares per 100 held, for BONUS
  announcedOn?: string; // YYYY-MM-DD
  exDate?: string; // first day the share trades without the entitlement
  closureFrom: string; // book closure start, YYYY-MM-DD
  closureTo: string; // book closure end, YYYY-MM-DD
  paymentDate?: string;
  source: "MANUAL" | "PSX";
  createdAt: Date;
  updatedAt: Date;
}

const DATE_RE: [RegExp, string] = [/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD"];

const CorporateActionSchema = new mongoose.Schema<ICorporateAction>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    symbol: { type: String, required: true, uppercase: true, trim: true, maxlength: 30 },
    kind: { type: String, enum: ["DIVIDEND", "BONUS", "RIGHT", "OTHER"], required: true },
    details: { type: String, maxlength: 200 },
    cashPerShare: { type: Number, min: 0 },
    bonusRatio: { type: Number, min: 0 },
    announcedOn: { type: String, match: DATE_RE },
    exDate: { type: String, match: DATE_RE },
    closureFrom: { type: String, required: true, match: DATE_RE },
    closureTo: { type: String, required: true, match: DATE_RE },
    paymentDate: { type: String, match: DATE_RE },
    source: { type: String, enum: ["MANUAL", "PSX"], default: "MANUAL" },
  },
  { timestamps: true },
);

CorporateActionSchema.index({ userId: 1, closureFrom: -1 });

export default registerModel<ICorporateAction>("CorporateAction", CorporateActionSchema);
