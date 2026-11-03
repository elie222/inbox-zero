import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SPEC = path.join(import.meta.dirname, "compose-send.qnt");
// Run the CLI through Node so no shell has to parse the paths.
const QUINT_CLI = path.join(
  import.meta.dirname,
  "..",
  "node_modules",
  "@informalsystems",
  "quint",
  "dist",
  "src",
  "cli.js",
);

describe("compose send model", { timeout: 60_000 }, () => {
  it.each([
    "serverSend",
    "serverSendTabCloses",
    "reconcileSend",
    "waitForSave",
  ])("%s keeps every send property", (main) => {
    expect(simulate(main, "safety", 3000)).toEqual({ violated: false });
  });

  // The model must be able to see the bugs it guards against, or a passing
  // run proves nothing.
  it.each([
    ["naiveSend", "deliversWhatWasSent"],
    ["naiveSend", "noDraftLeftAfterSend"],
    // Why cleanup moved to the server: a tab closed before a draft save
    // answers cannot remove the draft that save created.
    ["reconcileSendTabCloses", "noDraftLeftAfterSend"],
  ])("%s violates %s", (main, invariant) => {
    // A run stops at the first violation, so a large budget costs little.
    expect(simulate(main, invariant, 50_000)).toEqual({ violated: true });
  });
});

function simulate(main: string, invariant: string, samples: number) {
  const result = spawnSync(
    process.execPath,
    [
      QUINT_CLI,
      "run",
      SPEC,
      `--main=${main}`,
      `--invariant=${invariant}`,
      // Pure Node, so the test needs no downloaded evaluator.
      "--backend=typescript",
      `--max-samples=${samples}`,
      "--max-steps=30",
      "--seed=1",
    ],
    {
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  const output = `${result.stdout}${result.stderr}`;
  if (output.includes("[ok] No violation found")) return { violated: false };
  if (output.includes("[violation] Found an issue")) return { violated: true };
  throw new Error(`Quint did not finish:\n${output}`);
}
