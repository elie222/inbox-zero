export const BROWSER_STORAGE_PRESSURE_RATIO = 0.9;
const ESTIMATE_TIMEOUT_MS = 100;

export async function browserStoragePressure() {
  const storage = globalThis.navigator?.storage;
  if (!storage || typeof storage.estimate !== "function") return false;
  try {
    const { usage, quota } = await Promise.race([
      storage.estimate(),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("storage estimate timeout")),
          ESTIMATE_TIMEOUT_MS,
        );
      }),
    ]);
    if (usage == null || quota == null || quota <= 0) return false;
    return usage / quota >= BROWSER_STORAGE_PRESSURE_RATIO;
  } catch {
    return false;
  }
}
