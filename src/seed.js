import { connectDb, closeDb } from "./db.js";

const categories = ["Food", "Travel", "Rent", "Shopping", "Bills", "Entertainment", "Other"];
const users = [
  { user_id: "U101", name: "Aarav Sharma", monthly_income: 28000 },
  { user_id: "U102", name: "Priya Verma", monthly_income: 35000 },
  { user_id: "U103", name: "Kabir Singh", monthly_income: 22000 }
];

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function monthForDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function seed() {
  const db = await connectDb();
  for (const collection of ["users", "categories", "transactions", "budgets"]) {
    await db.collection(collection).deleteMany({});
  }
  await db.collection("users").insertMany(users);
  await db.collection("categories").insertMany(categories.map((name, i) => ({
    category_id: `C${String(i + 1).padStart(3, "0")}`, name
  })));

  const transactions = [];
  const notes = {
    Food: ["Lunch", "Groceries", "Coffee", "Pizza", "Dinner"],
    Travel: ["Auto", "Bus pass", "Metro", "Cab"],
    Rent: ["Monthly rent"],
    Shopping: ["Clothes", "Household items", "Stationery"],
    Bills: ["Electricity", "Mobile recharge", "Internet"],
    Entertainment: ["Movie", "Music subscription", "Game night"],
    Other: ["Pharmacy", "Gift", "Miscellaneous"]
  };
  const amounts = { Food: [120, 250, 340, 90, 480], Travel: [40, 120, 300, 180], Rent: [8000], Shopping: [250, 700, 1200], Bills: [400, 650, 999], Entertainment: [200, 399, 550], Other: [150, 350, 600] };
  let counter = 1;
  for (let userIndex = 0; userIndex < users.length; userIndex++) {
    const user = users[userIndex];
    for (let i = 0; i < 24; i++) {
      const category = categories[(i * 3 + userIndex) % categories.length];
      const daysAgo = (i * 2 + userIndex) % 59;
      transactions.push({
        txn_id: `TXN-SEED-${String(counter++).padStart(4, "0")}`,
        user_id: user.user_id,
        amount: amounts[category][i % amounts[category].length],
        type: i % 12 === 0 ? "INCOME" : "EXPENSE",
        category_id: `C${String(categories.indexOf(category) + 1).padStart(3, "0")}`,
        category, note: notes[category][i % notes[category].length],
        txn_date: dateDaysAgo(daysAgo), created_at: new Date()
      });
    }
  }
  await db.collection("transactions").insertMany(transactions);

  const budgetRows = [];
  for (const user of users) {
    for (const category of ["Food", "Travel", "Shopping", "Entertainment", "Bills"]) {
      budgetRows.push({
        budget_id: `BUD-${user.user_id}-${category.toUpperCase()}`,
        user_id: user.user_id,
        category_id: `C${String(categories.indexOf(category) + 1).padStart(3, "0")}`,
        category, month: monthForDaysAgo(0),
        limit_amount: ({ Food: 4500, Travel: 1800, Shopping: 3000, Entertainment: 1500, Bills: 2200 })[category],
        created_at: new Date()
      });
    }
  }
  await db.collection("budgets").insertMany(budgetRows);
  console.log(`Seed complete: ${users.length} users, ${categories.length} categories, ${transactions.length} transactions, ${budgetRows.length} budgets.`);
  console.log("Demo users: U101 (Aarav), U102 (Priya), U103 (Kabir)");
}

seed().catch(error => {
  console.error("Seed failed:", error.message);
  process.exitCode = 1;
}).finally(closeDb);
