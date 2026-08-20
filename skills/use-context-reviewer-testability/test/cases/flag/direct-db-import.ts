import { db } from "./db";

export async function listOrders(userId: string) {
  return db.query("SELECT * FROM orders WHERE user_id = $1", [userId]);
}
