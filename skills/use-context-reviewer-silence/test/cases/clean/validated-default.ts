export function parsePort(raw: string, logger: { warn: (m: string) => void }) {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    logger.warn(`port is not a number: ${raw}. falling back to 8080`);
    return 8080;
  }
  return parsed;
}
