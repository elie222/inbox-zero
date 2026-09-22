import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export const electronBinaryPath = resolveElectronBinaryPath();

export function hasElectronBinary() {
  const found = existsSync(electronBinaryPath);
  if (!found && process.env.MAIL_REQUIRE_ELECTRON === "1") {
    throw new Error(`Electron binary not found at ${electronBinaryPath}`);
  }
  return found;
}

export function electronCommand(
  binary: string,
  args: string[],
): [string, string[]] {
  return process.platform === "linux"
    ? ["xvfb-run", ["-a", binary, ...args]]
    : [binary, args];
}

function resolveElectronBinaryPath() {
  if (process.env.ELECTRON_BINARY) return process.env.ELECTRON_BINARY;
  try {
    // Requiring Electron downloads missing binaries; parallel test workers
    // would then overwrite the executable while another worker launches it.
    const directory = dirname(
      createRequire(import.meta.url).resolve("electron"),
    );
    const executable = readFileSync(join(directory, "path.txt"), "utf8").trim();
    return join(directory, "dist", executable);
  } catch (error) {
    if (process.env.MAIL_REQUIRE_ELECTRON === "1") throw error;
    return "";
  }
}
