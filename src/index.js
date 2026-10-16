import readline from "node:readline";
import { connectDb, closeDb } from "./db.js";
import { createAgent } from "./agent.js";
import { config } from "./config.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const askLine = prompt => new Promise(resolve => rl.question(prompt, resolve));

async function main() {
  if (!config.groqApiKey) {
    console.error("Missing GROQ_API_KEY. Add your Groq API key to .env.");
    process.exitCode = 1;
    return;
  }

  let db;
  try {
    db = await connectDb();
    const users = await db.collection("users").find({}, { projection: { _id: 0, user_id: 1, name: 1 } }).toArray();
    if (!users.length) {
      console.log("No users found. Run `npm run seed` first.");
      return;
    }

    console.log("\nHi! I'm PaisaPal, your Personal Expense & Budget Coach.");
    console.log("Choose a demo user:");
    users.forEach(user => console.log(`  ${user.user_id} - ${user.name}`));
    const userId = (await askLine("User ID: ")).trim().toUpperCase();
    const user = users.find(item => item.user_id === userId);
    if (!user) {
      console.log("That user ID wasn't found. Run `npm run seed` or choose a listed ID.");
      return;
    }

    const agent = createAgent(db, userId);
    console.log(`\nWelcome, ${user.name}. Ask about spending, budgets, or transactions.`);
    console.log("Type `exit` to quit. For deleting, PaisaPal will ask for confirmation.\n");
    while (true) {
      const input = (await askLine("You: ")).trim();
      if (["exit", "quit"].includes(input.toLowerCase())) break;
      if (!input) continue;
      console.log(`PaisaPal: ${await agent.ask(input)}\n`);
    }
  } catch (error) {
    console.error("Startup error:", error.message);
    console.error("Check that MongoDB is running and MONGODB_URI is correct.");
  } finally {
    rl.close();
    await closeDb();
  }
}

main();
