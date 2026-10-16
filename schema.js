// MongoDB collection design. Indexes are created by src/db.js.
// users:        { user_id, name, monthly_income }
// categories:   { category_id, name }
// transactions: { txn_id, user_id, amount, type, category_id, category, note, txn_date, created_at }
// budgets:      { budget_id, user_id, category_id, category, month, limit_amount, created_at, updated_at }
//
// Relationships:
// transactions.user_id -> users.user_id
// budgets.user_id -> users.user_id
// transactions.category_id -> categories.category_id
// budgets.category_id -> categories.category_id
//
// Dates are stored as YYYY-MM-DD strings for consistent inclusive date filtering.
// Amounts are positive numeric values; transaction type determines income vs expense.
