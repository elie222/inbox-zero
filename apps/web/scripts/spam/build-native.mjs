import { mkdirSync, renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform === "darwin") {
  const directory = fileURLToPath(new URL("../../.native/", import.meta.url));
  mkdirSync(directory, { recursive: true });
  const temporary = `${directory}/spam-extractor-${process.pid}`;
  const result = spawnSync(
    "/usr/bin/xcrun",
    [
      "swiftc",
      "-O",
      fileURLToPath(new URL("./native/Extractor.swift", import.meta.url)),
      "-o",
      temporary,
    ],
    { stdio: "inherit", timeout: 120_000 },
  );
  if (result.status !== 0) {
    rmSync(temporary, { force: true });
    process.exit(result.status ?? 1);
  }
  renameSync(temporary, `${directory}/spam-extractor`);
}
