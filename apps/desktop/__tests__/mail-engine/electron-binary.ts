import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const electronBinaryPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../node_modules/electron/dist/electron",
);

export function hasElectronBinary() {
  return existsSync(electronBinaryPath);
}
