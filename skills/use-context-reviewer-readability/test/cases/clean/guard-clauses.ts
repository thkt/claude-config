export function priceFor(user: { tier?: string; coupon?: { rate?: number } }, base: number) {
  if (user?.tier !== "gold") return base;
  const rate = user.coupon?.rate;
  if (rate === undefined) return base;
  return base * (1 - rate) * 0.8;
}
