import mongoose from "mongoose";
import { registerModel } from "../lib/registerModel";

// One personal expense, owned by a user. (Previously kept only in the browser's
// localStorage — see lib/expenses.ts for the one-time hand-off.)
export interface IExpense extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  description: string;
  amount: number; // PKR
  category: string;
  date: string; // YYYY-MM-DD
  paymentMethod: "cash" | "card" | "transfer" | "other";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseSchema = new mongoose.Schema<IExpense>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    amount: { type: Number, required: true, min: [0, "Amount must be positive"] },
    category: { type: String, required: true, trim: true, maxlength: 40 },
    date: { type: String, required: true, match: [/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"] },
    paymentMethod: { type: String, enum: ["cash", "card", "transfer", "other"], default: "cash" },
    notes: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

ExpenseSchema.index({ userId: 1, date: -1 });

export default registerModel<IExpense>("Expense", ExpenseSchema);
