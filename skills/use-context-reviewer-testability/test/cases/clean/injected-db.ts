type Orders = { query: (sql: string, params: string[]) => Promise<unknown> };

export async function listOrders(orders: Orders, userId: string) {
  return orders.query("SELECT * FROM orders WHERE user_id = $1", [userId]);
}
