export function isExpired(issuedAt: number, ttlMs: number) {
  return Date.now() - issuedAt > ttlMs;
}
