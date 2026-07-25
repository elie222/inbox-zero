/**
 * Blocks production-derived data from reaching this public repo.
 *
 * Eval datasets mined from or shaped by real user behavior live in a separate
 * private repo and load at runtime via EVAL_DATA_DIRS. This check is
 * deterministic, runs on every PR, and targets the actual leak vector rather
 * than scanning everything.
 *
 * Two rules:
 *
 * 1. No dataset files (.jsonl) under __tests__ at all. Datasets are JSONL by
 *    convention, so their mere presence here means the private/public boundary
 *    was crossed. Unambiguous, zero false positives.
 * 2. Content scan of the directories that hold generated or simulated inbox
 *    content, where a real address could realistically slip in.
 *
 * Hand-authored .test.ts files are deliberately out of scope. They are written
 * and reviewed by humans and are not the leak vector; several legitimately name
 * real public companies (categorize-senders tests real newsletter senders), so
 * scanning them produces noise that trains people to ignore this check.
 *
 * Usage:
 *   tsx scripts/lint-no-pii.ts            # scan default paths
 *   tsx scripts/lint-no-pii.ts --staged   # staged files only (pre-commit)
 */

import { execFileSync } from "node:child_process";
import { globSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "tldts";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

/** Datasets are JSONL. None may exist in this repo. */
const FORBIDDEN_GLOBS = ["apps/web/__tests__/**/*.jsonl"];

/** Directories holding generated or simulated content, scanned for real entities. */
const SCANNED_GLOBS = [
  "apps/web/__tests__/sim/**/*.{ts,json,md}",
  "apps/web/__tests__/eval/data/**/*.{ts,json,md}",
  "apps/web/__tests__/eval/harness/**/*.{ts,json,md}",
];

/**
 * Domains that cannot belong to a real person. RFC 2606 + RFC 6761, plus
 * test.com, which is this repo's long-standing fixture convention (the default
 * in `getEmail`). test.com is a registered domain, so it is a mild anti-pattern
 * for new code, but it carries no user data and rejecting it would flag
 * hundreds of existing fixtures.
 */
const RESERVED_SUFFIXES = [
  "example.com",
  "example.org",
  "example.net",
  "example.edu",
  "test.com",
  "test",
  "example",
  "invalid",
  "localhost",
];

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_PATTERN = /https?:\/\/[A-Za-z0-9.-]+(?:\.[A-Za-z]{2,})/g;
const LONG_DIGIT_RUN = /(?<![\w.-])\d{9,}(?![\w.-])/g;
const PHONE_PATTERN = /(?<![\w.-])\+\d[\d\s().-]{8,}\d(?![\w.-])/g;

type Finding = {
  column: number;
  file: string;
  line: number;
  reason: string;
  snippet: string;
};

const staged = process.argv.includes("--staged");
const findings = [
  ...findForbiddenDatasets(staged),
  ...scan(collectFiles(staged)),
];

if (findings.length === 0) {
  console.log("lint-no-pii: clean");
  process.exit(0);
}

console.error(`lint-no-pii: ${findings.length} problem(s)\n`);
for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}:${finding.column}`);
  console.error(`    ${finding.reason}: ${finding.snippet}\n`);
}
console.error(
  "Production-derived data must not enter this public repo.\n" +
    "Eval datasets belong in the private evals repo and load at runtime via\n" +
    "EVAL_DATA_DIRS. Synthetic fixtures must use example.com, *.test, or *.invalid.",
);
process.exit(1);

function findForbiddenDatasets(stagedOnly: boolean): Finding[] {
  const files = stagedOnly
    ? stagedFiles().filter((path) => path.endsWith(".jsonl"))
    : FORBIDDEN_GLOBS.flatMap((pattern) =>
        globSync(pattern, { cwd: REPO_ROOT }),
      );

  return files.map((file) => ({
    column: 1,
    file,
    line: 1,
    reason: "dataset file in public repo",
    snippet: "move to the private evals repo and load via EVAL_DATA_DIRS",
  }));
}

function collectFiles(stagedOnly: boolean): string[] {
  if (stagedOnly) {
    return stagedFiles()
      .filter((path) => /\.(ts|json|md)$/.test(path))
      .filter(isScanned)
      .filter((path) => existsAsFile(join(REPO_ROOT, path)));
  }
  return SCANNED_GLOBS.flatMap((pattern) =>
    globSync(pattern, { cwd: REPO_ROOT }),
  );
}

function scan(files: string[]): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    const lines = readFileSync(join(REPO_ROOT, file), "utf8").split("\n");
    // Phone numbers and account numbers appear in email content, not in source.
    // Scanning .ts for digit runs just flags constants like 2**30.
    const isContentFile = !file.endsWith(".ts");

    lines.forEach((line, index) => {
      for (const match of line.matchAll(EMAIL_PATTERN)) {
        const domain = match[0].split("@")[1];
        if (domain && !isReserved(domain)) {
          findings.push(toFinding(file, index, match, "real email domain"));
        }
      }

      for (const match of line.matchAll(URL_PATTERN)) {
        const host = match[0].replace(/^https?:\/\//, "");
        if (!isReserved(host)) {
          findings.push(toFinding(file, index, match, "real URL host"));
        }
      }

      if (!isContentFile) return;

      for (const match of line.matchAll(PHONE_PATTERN)) {
        findings.push(toFinding(file, index, match, "phone-like number"));
      }

      for (const match of line.matchAll(LONG_DIGIT_RUN)) {
        findings.push(toFinding(file, index, match, "long digit run"));
      }
    });
  }

  return findings;
}

function isReserved(host: string): boolean {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  if (
    RESERVED_SUFFIXES.some(
      (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
    )
  ) {
    return true;
  }

  // tldts resolves the registrable domain, so example.com.evil.io cannot pass
  // the suffix check above.
  const parsed = parse(normalized);
  if (!parsed.domain) return true;
  return RESERVED_SUFFIXES.includes(parsed.domain.toLowerCase());
}

function stagedFiles(): string[] {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  return output.split("\n").filter(Boolean);
}

function isScanned(path: string): boolean {
  return (
    path.startsWith("apps/web/__tests__/sim/") ||
    path.startsWith("apps/web/__tests__/eval/data/") ||
    path.startsWith("apps/web/__tests__/eval/harness/")
  );
}

function existsAsFile(absolutePath: string): boolean {
  try {
    return statSync(absolutePath).isFile();
  } catch {
    return false;
  }
}

function toFinding(
  file: string,
  lineIndex: number,
  match: RegExpMatchArray,
  reason: string,
): Finding {
  return {
    column: (match.index ?? 0) + 1,
    file,
    line: lineIndex + 1,
    reason,
    snippet: match[0].slice(0, 80),
  };
}
