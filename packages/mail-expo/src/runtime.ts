import { createHostRuntime } from "@inboxzero/mail-core/engine";
import type { HostRuntime } from "@inboxzero/mail-core/ports/runtime";
import { randomId, sha256Bytes } from "./sha256";

export const MOBILE_STORAGE_FREE_BYTES = 64 * 1024 * 1024;

export { randomId, sha256Bytes };

export function createExpoHostRuntime(
  overrides?: Partial<HostRuntime>,
): HostRuntime {
  return createHostRuntime({
    randomId,
    sha256: sha256Bytes,
    storagePressure: expoStoragePressure,
    ...overrides,
  });
}

export async function expoStoragePressure(
  readAvailable: () => number | Promise<number> = readAvailableDiskSpace,
): Promise<boolean> {
  try {
    const available = await readAvailable();
    if (!Number.isFinite(available) || available < 0) return false;
    return available < MOBILE_STORAGE_FREE_BYTES;
  } catch {
    return false;
  }
}

async function readAvailableDiskSpace() {
  const fileSystem = (await import("expo-file-system")) as unknown as {
    Paths: { availableDiskSpace: number };
  };
  return fileSystem.Paths.availableDiskSpace;
}
