export async function loadProfile(id: string, fetchProfile: (id: string) => Promise<unknown>) {
  try {
    return await fetchProfile(id);
  } catch (e) {}
  return null;
}
