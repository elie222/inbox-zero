import { statfs } from "node:fs/promises";
import { dirname } from "node:path";

export const DESKTOP_STORAGE_FREE_BYTES = 64 * 1024 * 1024;

export async function desktopStoragePressure(
  databasePath: string,
  options: {
    statfs?: (path: string) => Promise<{ bavail: number; bsize: number }>;
  } = {},
) {
  const readFs = options.statfs ?? statfs;
  try {
    const info = await readFs(dirname(databasePath));
    const free = Number(info.bavail) * Number(info.bsize);
    if (!Number.isFinite(free) || free < 0) return false;
    return free < DESKTOP_STORAGE_FREE_BYTES;
  } catch {
    return false;
  }
}
