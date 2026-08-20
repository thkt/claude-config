export function isExpired(now: number, issuedAt: number, ttlMs: number) {
  return now - issuedAt > ttlMs;
}
