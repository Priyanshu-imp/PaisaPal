import { MongoClient } from "mongodb";
import { config } from "./config.js";

let client;
let database;

export async function connectDb() {
  if (database) return database;
  client = new MongoClient(config.mongoUri);
  await client.connect();
  database = client.db(config.mongoDb);
  await createIndexes(database);
  return database;
}

async function createIndexes(db) {
  await Promise.all([
    db.collection("users").createIndex({ user_id: 1 }, { unique: true }),
    db.collection("categories").createIndex({ category_id: 1 }, { unique: true }),
    db.collection("categories").createIndex({ name: 1 }, { unique: true }),
    db.collection("transactions").createIndex({ txn_id: 1 }, { unique: true }),
    db.collection("transactions").createIndex({ user_id: 1, txn_date: -1 }),
    db.collection("budgets").createIndex(
      { user_id: 1, category_id: 1, month: 1 }, { unique: true }
    )
  ]);
}

export async function closeDb() {
  if (client) await client.close();
  client = undefined;
  database = undefined;
}
