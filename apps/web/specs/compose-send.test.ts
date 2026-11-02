import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SPEC = path.join(import.meta.dirname, "compose-send.qnt");
const QUINT = path.join(
  import.meta.dirname,
  "..",
  "node_modules",
  ".bin",
  "quint",
);

describe("compose send model", { timeout: 60_000 }, () => {
  it.each([
    "reconcileSend",
    "waitForSave",
  ])("%s keeps every send property", (main) => {
    expect(simulate(main, "safety")).toEqual({ violated: false });
  });

  // The model must be able to see the bugs it guards against, or a passing
  // run proves nothing.
  it.each([
    ["naiveSend", "deliversWhatWasSent"],
    ["naiveSend", "noDraftLeftAfterSend"],
    // Accepted trade-off: a tab closed before a draft save answers cannot
    // remove the draft that save created.
    ["reconcileSendTabCloses", "noDraftLeftAfterSend"],
  ])("%s violates %s", (main, invariant) => {
    expect(simulate(main, invariant)).toEqual({ violated: true });
  });
});

function simulate(main: string, invariant: string) {
  const result = spawnSync(
    QUINT,
    [
      "run",
      SPEC,
      `--main=${main}`,
      `--invariant=${invariant}`,
      // Pure Node, so the test needs no downloaded evaluator.
      "--backend=typescript",
      "--max-samples=3000",
      "--max-steps=30",
      "--seed=1",
    ],
    { encoding: "utf8", timeout: 120_000 },
  );
  const output = `${result.stdout}${result.stderr}`;
  if (output.includes("[ok] No violation found")) return { violated: false };
  if (output.includes("[violation] Found an issue")) return { violated: true };
  throw new Error(`Quint did not finish:\n${output}`);
}
