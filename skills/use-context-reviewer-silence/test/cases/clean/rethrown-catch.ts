export async function loadProfile(
  id: string,
  fetchProfile: (id: string) => Promise<unknown>,
  logger: { error: (e: unknown) => void },
) {
  try {
    return await fetchProfile(id);
  } catch (e) {
    logger.error(e);
    throw e;
  }
}
