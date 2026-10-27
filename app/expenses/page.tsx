"use client";

import { Wallet, Pencil, Plus, PieChart as PieChartIcon, LineChart as LineChartIcon, CreditCard, ClipboardList, Inbox, Download } from "lucide-react";

import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import BudgetPanel from "../components/BudgetPanel";
import LoadErrorBanner from "../components/LoadErrorBanner";
import { usePullRefresh } from "../lib/pullRefresh";
import {
  fetchExpenses, addExpense, updateExpense, deleteExpense, migrateLegacyExpenses,
  type Expense,
} from "../lib/expenses";

const CATEGORIES = ["Food", "Transport", "Entertainment", "Utilities", "Healthcare", "Shopping", "Education", "Other"];
const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2"];

export default function ExpensesPage() {
  const { success, error, info } = useToast();
  const confirm = useConfirm();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    category: "Food",
    date: new Date().toISOString().split("T")[0],
    paymentMethod: "cash" as "cash" | "card" | "transfer" | "other",
    notes: "",
  });
  const [filter, setFilter] = useState("all");
  const [timeRange, setTimeRange] = useState("month"); // day, week, month, year
  const [editingId, setEditingId] = useState<string | null>(null);

  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Expenses live in the account. The first load after this change also moves any
  // expenses still sitting in this browser's localStorage up to the account.
  const load = useCallback(async () => {
    let res = await fetchExpenses();
    if (!res.failed && res.data.length === 0 && (await migrateLegacyExpenses()) > 0) {
      res = await fetchExpenses();
      if (!res.failed) info(`Moved ${res.data.length} expenses from this device to your account`);
    }
    setLoadFailed(res.failed);
    if (!res.failed) setExpenses(res.data);
  }, [info]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePullRefresh(load);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!formData.description.trim() || !formData.amount) {
      error("Please fill in description and amount");
      return;
    }
    const amountNum = parseFloat(formData.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      error("Enter an amount greater than zero");
      return;
    }

    const input = {
      description: formData.description.trim(),
      amount: amountNum,
      category: formData.category,
      date: formData.date,
      paymentMethod: formData.paymentMethod,
      notes: formData.notes.trim() || undefined,
    };

    setSaving(true);
    const res = editingId ? await updateExpense(editingId, input) : await addExpense(input);
    setSaving(false);
    if (res.error || !res.expense) {
      error(res.error || "Couldn't save the expense");
      return; // keep the form filled so nothing typed is lost
    }
    const saved = res.expense;

    if (editingId) {
      setExpenses(expenses.map((exp) => (exp.id === editingId ? saved : exp)));
      setEditingId(null);
      success(`"${saved.description}" updated`);
    } else {
      setExpenses([saved, ...expenses]);
      success(`Expense added — PKR ${amountNum.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
    }

    setFormData({
      description: "",
      amount: "",
      category: "Food",
      date: new Date().toISOString().split("T")[0],
      paymentMethod: "cash",
      notes: "",
    });
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingId(expense.id);
    setFormData({
      description: expense.description,
      amount: expense.amount.toString(),
      category: expense.category,
      date: expense.date,
      paymentMethod: expense.paymentMethod,
      notes: expense.notes || "",
    });
  };

  const handleDeleteExpense = async (id: string) => {
    const removed = expenses.find((exp) => exp.id === id);
    if (!(await confirm({
      title: "Delete this expense?",
      message: removed ? `"${removed.description}" will be removed.` : undefined,
      destructive: true,
    }))) return;
    if (!(await deleteExpense(id))) { error("Couldn't delete that expense"); return; }
    setExpenses(expenses.filter((exp) => exp.id !== id));
    info(`"${removed?.description ?? 'Expense'}" deleted`);
  };

  const getDateRange = () => {
    const now = new Date();
    const start = new Date();

    switch (timeRange) {
      case "day":
        start.setDate(now.getDate() - 1);
        break;
      case "week":
        start.setDate(now.getDate() - 7);
        break;
      case "month":
        start.setMonth(now.getMonth() - 1);
        break;
      case "year":
        start.setFullYear(now.getFullYear() - 1);
        break;
    }

    return start;
  };

  const filteredExpenses = expenses.filter((exp) => {
    const expDate = new Date(exp.date);
    const startDate = getDateRange();
    const isInRange = expDate >= startDate;
    const isInCategory = filter === "all" || exp.category === filter;
    return isInRange && isInCategory;
  });

  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const avgExpense = filteredExpenses.length > 0 ? totalExpenses / filteredExpenses.length : 0;

  // Prepare data for charts
  const categoryData = CATEGORIES.map((cat) => ({
    name: cat,
    value: filteredExpenses
      .filter((exp) => exp.category === cat)
      .reduce((sum, exp) => sum + exp.amount, 0),
  })).filter((item) => item.value > 0);

  const dailyData: Record<string, number> = {};
  filteredExpenses.forEach((exp) => {
    const date = exp.date;
    dailyData[date] = (dailyData[date] || 0) + exp.amount;
  });

  const lineChartData = Object.entries(dailyData)
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, amount]) => ({
      date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      amount,
    }));

  const paymentMethodData = ["cash", "card", "transfer", "other"].map((method) => ({
    name: method.charAt(0).toUpperCase() + method.slice(1),
    value: filteredExpenses
      .filter((exp) => exp.paymentMethod === method)
      .reduce((sum, exp) => sum + exp.amount, 0),
  })).filter((item) => item.value > 0);

  const exportCsv = () => {
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["Date", "Description", "Category", "Amount", "Payment method", "Notes"], ...[...filteredExpenses]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(e => [e.date, e.description, e.category, e.amount, e.paymentMethod, e.notes ?? ""])];
    // BOM so Excel reads UTF-8 correctly.
    const blob = new Blob([String.fromCharCode(0xFEFF) + rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    success(`Exported ${filteredExpenses.length} expense${filteredExpenses.length === 1 ? "" : "s"}`);
  };

  const inputClass = "w-full px-3 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all";
  const labelClass = "block text-xs font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white selection:bg-blue-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 dark:bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/5 dark:bg-indigo-600/10 blur-[120px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="safe-top sticky top-0 z-50 bg-white/80 dark:bg-black/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5">
        <div className="page-shell mx-auto pl-16 pr-4 sm:pr-8 lg:pl-8 py-4 sm:py-6">
          <h1 className="text-xl sm:text-3xl font-black tracking-tighter italic uppercase text-zinc-900 dark:text-white leading-none flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Wallet className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400 shrink-0" strokeWidth={2} /> Expense <span className="text-blue-500 text-xl sm:text-2xl">Tracker</span>
          </h1>
          <p className="text-zinc-500 text-[11px] sm:text-xs font-black uppercase tracking-[0.2em] mt-1">
            Spending Intelligence & Analysis
          </p>
        </div>
      </header>

      <main className="page-shell mx-auto p-4 sm:p-8 relative z-10">
        {loadFailed && (
          <div className="mb-6">
            <LoadErrorBanner hasData={expenses.length > 0} what="your expenses" onRetry={load} />
          </div>
        )}
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
          <div className="card p-5 sm:p-6">
            <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2">Total Expenses</p>
            <p className="text-2xl sm:text-3xl font-black font-mono tracking-tighter text-zinc-900 dark:text-white break-words min-w-0">PKR {totalExpenses.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
            <p className="text-xs font-bold text-zinc-400 mt-1">{filteredExpenses.length} transactions</p>
          </div>
          <div className="card p-5 sm:p-6">
            <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2">Average Expense</p>
            <p className="text-2xl sm:text-3xl font-black font-mono tracking-tighter text-zinc-900 dark:text-white break-words min-w-0">PKR {avgExpense.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
            <p className="text-xs font-bold text-zinc-400 mt-1">Per transaction</p>
          </div>
          <div className="card p-5 sm:p-6 flex flex-col justify-between">
            <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2">Time Period</p>
            <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className={inputClass}>
              <option value="day">Last Day</option>
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="year">Last Year</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 mb-8">
          {/* Add Expense Form */}
          <div className="card lg:col-span-1 backdrop-blur-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-100 dark:border-white/5">
              <h2 className="text-base font-black uppercase tracking-tighter italic text-zinc-900 dark:text-white flex items-center gap-2">
                {editingId ? (
                  <><Pencil className="w-4 h-4 shrink-0" strokeWidth={2} /> Edit Expense</>
                ) : (
                  <><Plus className="w-4 h-4 shrink-0" strokeWidth={2} /> Add Expense</>
                )}
              </h2>
            </div>
            <form onSubmit={handleAddExpense} className="p-4 sm:p-6 space-y-4">
              <div>
                <label className={labelClass}>Description</label>
                <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="e.g., Lunch at café" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Amount (PKR)</label>
                <input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" step="0.01" min="0" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Category</label>
                <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className={inputClass}>
                  {CATEGORIES.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Date</label>
                <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Payment Method</label>
                <select value={formData.paymentMethod} onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as "cash" | "card" | "transfer" | "other" })} className={inputClass}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="transfer">Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Notes (Optional)</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Add any notes..." className={inputClass + " resize-none"} rows={2} />
              </div>
              <button type="submit" disabled={saving} className="w-full disabled:opacity-60 bg-blue-600 hover:bg-blue-700 text-white font-black py-3 px-4 rounded-xl transition-all uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-95 shadow-lg shadow-blue-600/20">
                {editingId ? "Update Expense" : "Add Expense"}
              </button>
              {editingId && (
                <button type="button" onClick={() => { setEditingId(null); setFormData({ description: "", amount: "", category: "Food", date: new Date().toISOString().split("T")[0], paymentMethod: "cash", notes: "" }); }} className="w-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-black py-3 px-4 rounded-xl transition-all uppercase tracking-widest text-xs">
                  Cancel
                </button>
              )}
            </form>
          </div>

          {/* Charts */}
          <div className="lg:col-span-2 space-y-6">
            {/* Category Breakdown */}
            {categoryData.length > 0 && (
              <div className="card p-4 sm:p-6">
                <h2 className="text-base font-black uppercase tracking-tighter italic text-zinc-900 dark:text-white mb-4 flex items-center gap-2"><PieChartIcon className="w-4 h-4 shrink-0" strokeWidth={2} /> Spending by Category</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" labelLine={false} outerRadius={90} dataKey="value">
                      {categoryData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "var(--tooltip-bg, #fff)", color: "var(--tooltip-fg, #171717)", border: "1px solid var(--tooltip-border, #e4e4e7)", borderRadius: "0.75rem", fontSize: "12px" }} itemStyle={{ color: "var(--tooltip-fg, #171717)" }} labelStyle={{ color: "var(--tooltip-fg, #171717)" }} formatter={(value: any) => `PKR ${Number(value).toFixed(0)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Daily Trend */}
            {lineChartData.length > 0 && (
              <div className="card p-4 sm:p-6">
                <h2 className="text-base font-black uppercase tracking-tighter italic text-zinc-900 dark:text-white mb-4 flex items-center gap-2"><LineChartIcon className="w-4 h-4 shrink-0" strokeWidth={2} /> Daily Trend</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={lineChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#71717a" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#71717a" }} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--tooltip-bg, #fff)", color: "var(--tooltip-fg, #171717)", border: "1px solid var(--tooltip-border, #e4e4e7)", borderRadius: "0.75rem", fontSize: "12px" }} itemStyle={{ color: "var(--tooltip-fg, #171717)" }} labelStyle={{ color: "var(--tooltip-fg, #171717)" }} formatter={(value: any) => `PKR ${Number(value).toFixed(0)}`} />
                    <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2.5} dot={{ fill: "#3b82f6", r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Payment Method */}
            {paymentMethodData.length > 0 && (
              <div className="card p-4 sm:p-6">
                <h2 className="text-base font-black uppercase tracking-tighter italic text-zinc-900 dark:text-white mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4 shrink-0" strokeWidth={2} /> By Payment Method</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={paymentMethodData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717a" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#71717a" }} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--tooltip-bg, #fff)", color: "var(--tooltip-fg, #171717)", border: "1px solid var(--tooltip-border, #e4e4e7)", borderRadius: "0.75rem", fontSize: "12px" }} itemStyle={{ color: "var(--tooltip-fg, #171717)" }} labelStyle={{ color: "var(--tooltip-fg, #171717)" }} formatter={(value: any) => `PKR ${Number(value).toFixed(0)}`} />
                    <Bar dataKey="value" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Category Filter */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button onClick={() => setFilter("all")} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filter === "all" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "bg-white dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"}`}>
            All ({expenses.length})
          </button>
          {CATEGORIES.map((cat) => {
            const count = expenses.filter((exp) => exp.category === cat).length;
            if (count === 0) return null;
            return (
              <button key={cat} onClick={() => setFilter(cat)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filter === cat ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "bg-white dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"}`}>
                {cat} ({count})
              </button>
            );
          })}
        </div>

        <BudgetPanel expenses={expenses} categories={CATEGORIES} />

        {/* Expenses Table */}
        <div className="card overflow-hidden">
          <div className="px-6 sm:px-8 py-5 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between gap-3">
            <h2 className="text-base font-black uppercase tracking-tighter italic text-zinc-900 dark:text-white flex items-center gap-2"><ClipboardList className="w-4 h-4 shrink-0" strokeWidth={2} /> Recent Expenses</h2>
            <button type="button" onClick={exportCsv} disabled={filteredExpenses.length === 0} className="shrink-0 min-h-10 px-3 inline-flex items-center gap-1.5 rounded-xl bg-zinc-100 dark:bg-white/5 text-xs font-bold text-zinc-700 dark:text-zinc-300 disabled:opacity-40">
              <Download className="w-4 h-4" aria-hidden /> Export CSV
            </button>
          </div>
          {filteredExpenses.length === 0 ? (
            <div className="py-16 text-center">
              <Inbox className="w-10 h-10 mx-auto mb-4 text-zinc-400" strokeWidth={1.5} />
              <p className="text-zinc-400 font-black uppercase tracking-widest text-xs">No expenses found for this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-white/5">
                    <th className="px-4 sm:px-6 py-4 text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em]">Description</th>
                    <th className="px-6 py-4 text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em] hidden sm:table-cell">Category</th>
                    <th className="px-4 sm:px-6 py-4 text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em] text-right">Amount</th>
                    <th className="px-6 py-4 text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em] hidden sm:table-cell">Date</th>
                    <th className="px-6 py-4 text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em] hidden md:table-cell">Method</th>
                    <th className="px-4 sm:px-6 py-4 text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                  {[...filteredExpenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((exp) => (
                    <tr key={exp.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 sm:px-6 py-4">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50 truncate max-w-[160px] sm:max-w-none">{exp.description}</p>
                        {/* Category + date fold under description on mobile */}
                        <p className="sm:hidden text-[11px] font-bold text-zinc-400 uppercase tracking-wide mt-0.5">{exp.category} · {new Date(exp.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                      </td>
                      <td className="px-6 py-4 hidden sm:table-cell">
                        <span className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">{exp.category}</span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right font-mono font-black text-zinc-900 dark:text-white text-sm whitespace-nowrap">PKR {exp.amount.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                      <td className="px-6 py-4 text-xs font-bold text-zinc-500 hidden sm:table-cell">{new Date(exp.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <span className="text-xs font-black text-zinc-500 uppercase tracking-wide">{exp.paymentMethod}</span>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => handleEditExpense(exp)} className="px-3 min-h-10 text-xs font-black text-blue-500 hover:text-blue-600 transition-colors uppercase tracking-wide">Edit</button>
                          <button onClick={() => handleDeleteExpense(exp.id)} className="px-3 min-h-10 text-xs font-black text-red-500 hover:text-red-600 transition-colors uppercase tracking-wide">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
