# PaisaPal mandatory test prompts

The prompts below are the five required T3 acceptance tests. Replies are **illustrative expected behavior**, not transcripts from a live API run; exact wording and amounts depend on the seeded data, selected user, current date, and model response. Run each prompt in the CLI to capture the actual output for submission.

## 1. Prompt
**User:** Spent 250 on pizza yesterday and 120 on an auto today.

**Expected behavior:** PaisaPal records two expenses (Food ₹250 yesterday, Travel ₹120 today) as separate database transactions. It should use the actual calendar dates and report any applicable budget warning. If the model can't reliably separate the two expenses, it should ask a clarifying question rather than silently dropping one.

## 2. Prompt
**User:** How much did I spend on food this month?

**Expected behavior:** PaisaPal calls `get_spending_summary` for the current `YYYY-MM` and reports the Food total from MongoDB, not a hard-coded amount.

## 3. Prompt
**User:** Set my shopping budget to 3000 for this month.

**Expected behavior:** PaisaPal calls `set_budget` for Shopping and the current month, stores ₹3000, and reports the saved limit and current status.

## 4. Prompt
**User:** Am I over budget anywhere?

**Expected behavior:** PaisaPal calls `check_budget_status`, reports categories over 100%, and separately flags categories that have reached at least 80%. If no budgets exist, it says so.

## 5. Prompt
**User:** Compare my spending this month with last month and give me 3 saving tips.

**Expected behavior:** PaisaPal calls `compare_months`, explains the change using database totals, then gives three practical tips tied to the returned category breakdown.

## Business rule violation test

**User:** Add an expense of ₹0 for Food.

**Expected behavior:** PaisaPal must refuse to save it because amounts must be positive. No transaction should be inserted.

## Confirmation test

**User:** Delete transaction TXN-SEED-0001.

**Expected behavior:** PaisaPal first displays the transaction and asks for explicit confirmation. It must not delete until the user replies clearly that they confirm. If the user says no, the record remains.

## How to record actual replies for submission

1. Start MongoDB, run `npm run seed`, then `npm start`.
2. Select `U101` and enter each mandatory prompt.
3. Copy the exact agent reply into this file under the corresponding prompt.
4. Run the business-rule and delete-confirmation tests too.
