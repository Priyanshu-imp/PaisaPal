import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { currentMonth, dateOnly, monthRange, parseDate } from "./dates.js";

const CATEGORIES = ["Food", "Travel", "Rent", "Shopping", "Bills", "Entertainment", "Other"];
const TYPE = ["INCOME", "EXPENSE"];
const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function categoryMatch(input) {
  if (!input) return null;
  return CATEGORIES.find(c => c.toLowerCase() === String(input).trim().toLowerCase()) || null;
}

function makeId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export function createTools(db, userId) {
  const users = db.collection("users");
  const categories = db.collection("categories");
  const transactions = db.collection("transactions");
  const budgets = db.collection("budgets");

  async function categoryId(name) {
    const normalized = categoryMatch(name);
    if (!normalized) return null;
    const found = await categories.findOne({ name: normalized });
    return found?.category_id || null;
  }

  async function budgetStatus(category, month) {
    const catId = await categoryId(category);
    if (!catId) return null;
    const budget = await budgets.findOne({ user_id: userId, category_id: catId, month });
    if (!budget) return { category, month, budgetSet: false };
    const { start, end } = monthRange(month);
    const totals = await transactions.aggregate([
      { $match: { user_id: userId, category_id: catId, type: "EXPENSE", txn_date: { $gte: start, $lt: end } } },
      { $group: { _id: null, spent: { $sum: "$amount" } } }
    ]).toArray();
    const spent = money(totals[0]?.spent || 0);
    const percent = money((spent / budget.limit_amount) * 100);
    return {
      category, month, budget: budget.limit_amount, spent, remaining: money(budget.limit_amount - spent), percent,
      warning: percent > 100 ? "OVER_BUDGET" : percent >= 80 ? "NEAR_LIMIT" : "OK"
    };
  }

  const add_transaction = tool(async ({ amount, type, category, note, date_text, date }) => {
    if (!(Number(amount) > 0)) return "Amount must be a positive number.";
    if (!TYPE.includes(type)) return "Type must be INCOME or EXPENSE.";
    const normalized = categoryMatch(category);
    if (!normalized) return `Please choose a category: ${CATEGORIES.join(", ")}.`;
    const category_id = await categoryId(normalized);
    const txn_date = date || parseDate(date_text || "today") || dateOnly();
    const transaction = {
      txn_id: makeId("TXN"), user_id: userId, amount: money(amount), type,
      category_id, category: normalized, note: String(note || "").trim(), txn_date,
      created_at: new Date()
    };
    await transactions.insertOne(transaction);
    let message = `Saved ${type.toLowerCase()} of ₹${transaction.amount.toFixed(2)} for ${normalized} on ${txn_date}. Transaction ID: ${transaction.txn_id}.`;
    if (type === "EXPENSE") {
      const status = await budgetStatus(normalized, txn_date.slice(0, 7));
      if (status?.warning === "OVER_BUDGET") message += ` ALERT: ${normalized} budget exceeded (${status.percent}% used; ₹${Math.abs(status.remaining).toFixed(2)} over).`;
      else if (status?.warning === "NEAR_LIMIT") message += ` Warning: ${normalized} has used ${status.percent}% of its budget.`;
    }
    return message;
  }, {
    name: "add_transaction",
    description: "Insert one income or expense after extracting amount, category, note, and date from the user's message. Use a positive amount and a supported category. Ask the user for missing amount/category before calling.",
    schema: z.object({
      amount: z.number().positive(),
      type: z.enum(["INCOME", "EXPENSE"]),
      category: z.enum(CATEGORIES),
      note: z.string().default(""),
      date_text: z.string().optional(),
      date: z.string().optional().describe("Optional resolved date in YYYY-MM-DD format")
    })
  });

  const list_transactions = tool(async ({ start_date, end_date, category, type, limit }) => {
    const filter = { user_id: userId };
    if (start_date || end_date) {
      filter.txn_date = {};
      if (start_date) filter.txn_date.$gte = start_date;
      if (end_date) filter.txn_date.$lte = end_date;
    }
    if (category) {
      const normalized = categoryMatch(category);
      if (!normalized) return `Unknown category. Choose: ${CATEGORIES.join(", ")}.`;
      filter.category = normalized;
    }
    if (type) filter.type = type;
    const rows = await transactions.find(filter).sort({ txn_date: -1 }).limit(Math.min(Math.max(limit || 20, 1), 100)).toArray();
    if (!rows.length) return "No transactions matched those filters.";
    return JSON.stringify(rows.map(({ txn_id, amount, type, category, note, txn_date }) => ({ txn_id, amount, type, category, note, txn_date })), null, 2);
  }, {
    name: "list_transactions",
    description: "List this user's transactions, optionally filtered by date range, category, or transaction type.",
    schema: z.object({
      start_date: z.string().optional().describe("YYYY-MM-DD inclusive"),
      end_date: z.string().optional().describe("YYYY-MM-DD inclusive"),
      category: z.enum(CATEGORIES).optional(),
      type: z.enum(TYPE).optional(),
      limit: z.number().int().min(1).max(100).default(20)
    })
  });

  const get_spending_summary = tool(async ({ month }) => {
    const targetMonth = month || currentMonth();
    const { start, end } = monthRange(targetMonth);
    const rows = await transactions.aggregate([
      { $match: { user_id: userId, type: "EXPENSE", txn_date: { $gte: start, $lt: end } } },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
      { $sort: { total: -1 } }
    ]).toArray();
    const total = money(rows.reduce((sum, row) => sum + row.total, 0));
    return JSON.stringify({
      month: targetMonth, total,
      categories: rows.map(row => ({ category: row._id, amount: money(row.total), percent_of_total: total ? money(row.total / total * 100) : 0 }))
    }, null, 2);
  }, {
    name: "get_spending_summary",
    description: "Get this user's expense totals per category and each category's percentage of total expenses for a month (YYYY-MM).",
    schema: z.object({ month: z.string().optional().describe("YYYY-MM; defaults to current month") })
  });

  const set_budget = tool(async ({ category, month, limit_amount }) => {
    if (!(limit_amount > 0)) return "Budget must be a positive amount.";
    const normalized = categoryMatch(category);
    if (!normalized) return `Unknown category. Choose: ${CATEGORIES.join(", ")}.`;
    const category_id = await categoryId(normalized);
    const targetMonth = month || currentMonth();
    await budgets.updateOne(
      { user_id: userId, category_id, month: targetMonth },
      { $set: { limit_amount: money(limit_amount), updated_at: new Date() },
        $setOnInsert: { budget_id: makeId("BUD"), user_id: userId, category_id, category: normalized, month: targetMonth, created_at: new Date() } },
      { upsert: true }
    );
    const status = await budgetStatus(normalized, targetMonth);
    return `Budget saved: ${normalized} for ${targetMonth} is ₹${money(limit_amount).toFixed(2)}. Current status: ${JSON.stringify(status)}.`;
  }, {
    name: "set_budget",
    description: "Create or update a monthly budget for a category. Month defaults to current month.",
    schema: z.object({ category: z.enum(CATEGORIES), month: z.string().optional().describe("YYYY-MM"), limit_amount: z.number().positive() })
  });

  const check_budget_status = tool(async ({ month }) => {
    const targetMonth = month || currentMonth();
    const userBudgets = await budgets.find({ user_id: userId, month: targetMonth }).toArray();
    if (!userBudgets.length) return `No budgets are set for ${targetMonth}.`;
    const results = [];
    for (const budget of userBudgets) results.push(await budgetStatus(budget.category, targetMonth));
    return JSON.stringify({ month: targetMonth, categories: results }, null, 2);
  }, {
    name: "check_budget_status",
    description: "Compare spending with each category budget for a month and identify categories nearing or exceeding limits.",
    schema: z.object({ month: z.string().optional().describe("YYYY-MM; defaults to current month") })
  });

  const delete_transaction = tool(async ({ txn_id, confirmed }) => {
    if (!confirmed) {
      const row = await transactions.findOne({ txn_id, user_id: userId });
      if (!row) return "I couldn't find that transaction for this user.";
      return `CONFIRM_DELETE_REQUIRED: Delete ${row.txn_id}: ₹${row.amount} ${row.type} in ${row.category} on ${row.txn_date} (${row.note || "no note"})? Ask the user to explicitly confirm before calling this tool again with confirmed=true.`;
    }
    const result = await transactions.deleteOne({ txn_id, user_id: userId });
    return result.deletedCount ? `Deleted transaction ${txn_id}.` : "I couldn't find that transaction for this user.";
  }, {
    name: "delete_transaction",
    description: "Delete a transaction. First call with confirmed=false to display it and request confirmation. Only call with confirmed=true after the user explicitly confirms deletion.",
    schema: z.object({ txn_id: z.string(), confirmed: z.boolean().default(false) })
  });

  const compare_months = tool(async ({ month }) => {
    const target = month || currentMonth();
    const [year, mon] = target.split("-").map(Number);
    const previousDate = new Date(year, mon - 2, 1);
    const previous = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`;
    const [thisSummary, previousSummary] = await Promise.all([
      summaryFor(target), summaryFor(previous)
    ]);
    const diff = money(thisSummary.total - previousSummary.total);
    return JSON.stringify({
      current_month: thisSummary, previous_month: previousSummary,
      change: diff, change_percent: previousSummary.total ? money(diff / previousSummary.total * 100) : null
    }, null, 2);
  }, {
    name: "compare_months",
    description: "Compare expense totals and category breakdown for the given month and the previous month.",
    schema: z.object({ month: z.string().optional().describe("YYYY-MM; defaults to current month") })
  });

  async function summaryFor(month) {
    const { start, end } = monthRange(month);
    const rows = await transactions.aggregate([
      { $match: { user_id: userId, type: "EXPENSE", txn_date: { $gte: start, $lt: end } } },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
      { $sort: { total: -1 } }
    ]).toArray();
    return { month, total: money(rows.reduce((sum, row) => sum + row.total, 0)),
      categories: rows.map(row => ({ category: row._id, amount: money(row.total) })) };
  }

  return [add_transaction, list_transactions, get_spending_summary, set_budget, check_budget_status, delete_transaction, compare_months];
}
