export function priceFor(user: { tier?: string; coupon?: { rate?: number } }, base: number) {
  if (user) {
    if (user.tier) {
      if (user.tier === "gold") {
        if (user.coupon) {
          if (user.coupon.rate) {
            return base * (1 - user.coupon.rate) * 0.8;
          }
        }
      }
    }
  }
  return base;
}
