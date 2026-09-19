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
    const available = Number(info.bavail);
    const blockSize = Number(info.bsize);
    if (
      !Number.isFinite(available) ||
      available < 0 ||
      !Number.isFinite(blockSize) ||
      blockSize <= 0
    ) {
      return false;
    }
    return available * blockSize < DESKTOP_STORAGE_FREE_BYTES;
  } catch {
    return false;
  }
}
