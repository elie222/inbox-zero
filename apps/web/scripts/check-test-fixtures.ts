/**
 * Test fixture hygiene.
 *
 * Two rules:
 *
 * 1. Fixtures use reserved example domains only (RFC 2606 / RFC 6761), so a
 *    test can never send mail, resolve DNS, or name a real party.
 * 2. Eval case data is supplied at runtime via EVAL_DATA_DIRS and is not
 *    committed here, so a stray .jsonl under __tests__ is a mistake.
 *
 * Scope is narrow on purpose. Hand-authored .test.ts files are excluded:
 * several deliberately reference real public services, because that is what
 * they are testing, and flagging those trains people to skip the check.
 *
 *   tsx scripts/check-test-fixtures.ts            # scan default paths
 *   tsx scripts/check-test-fixtures.ts --staged   # staged files only
 */

import { execFileSync } from "node:child_process";
import { globSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "tldts";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

const FORBIDDEN_GLOBS = ["apps/web/__tests__/**/*.jsonl"];

const SCANNED_GLOBS = [
  "apps/web/__tests__/sim/**/*.{ts,json,md}",
  "apps/web/__tests__/eval/data/**/*.{ts,json,md}",
  "apps/web/__tests__/eval/harness/**/*.{ts,json,md}",
  "apps/web/__tests__/eval/suites/**/*.{ts,json,md}",
];

/**
 * test.com is a registered domain and so a mild anti-pattern, but it is this
 * repo's long-standing fixture default and carries nothing. Prefer example.com
 * in new fixtures.
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
  ...findCommittedDatasets(staged),
  ...scan(collectFiles(staged)),
];

if (findings.length === 0) {
  console.log("check-test-fixtures: clean");
  process.exit(0);
}

console.error(`check-test-fixtures: ${findings.length} problem(s)\n`);
for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}:${finding.column}`);
  console.error(`    ${finding.reason}: ${finding.snippet}\n`);
}
console.error(
  "Fixtures must use example.com, *.test, or *.invalid so a test can never\n" +
    "reach a real address or host. Eval case data loads at runtime via\n" +
    "EVAL_DATA_DIRS rather than being committed.",
);
process.exit(1);

function findCommittedDatasets(stagedOnly: boolean): Finding[] {
  const files = stagedOnly
    ? stagedFiles().filter((path) => path.endsWith(".jsonl"))
    : FORBIDDEN_GLOBS.flatMap((pattern) =>
        globSync(pattern, { cwd: REPO_ROOT }),
      );

  return files.map((file) => ({
    column: 1,
    file,
    line: 1,
    reason: "committed eval dataset",
    snippet: "case data loads at runtime via EVAL_DATA_DIRS",
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
    // Phone and account numbers appear in fixture content, not in source.
    // Scanning .ts for digit runs just flags constants like 2**30.
    const isContentFile = !file.endsWith(".ts");

    lines.forEach((line, index) => {
      for (const match of line.matchAll(EMAIL_PATTERN)) {
        const domain = match[0].split("@")[1];
        if (domain && !isReserved(domain)) {
          findings.push(
            toFinding(file, index, match, "non-reserved email domain"),
          );
        }
      }

      for (const match of line.matchAll(URL_PATTERN)) {
        const host = match[0].replace(/^https?:\/\//, "");
        if (!isReserved(host)) {
          findings.push(toFinding(file, index, match, "non-reserved URL host"));
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
    path.startsWith("apps/web/__tests__/eval/harness/") ||
    path.startsWith("apps/web/__tests__/eval/suites/")
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
