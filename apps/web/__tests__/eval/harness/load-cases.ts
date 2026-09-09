import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";

export type LoadIssue = {
  file: string;
  line: number;
  caseId: string | null;
  reason: "invalid_json" | "schema_invalid" | "duplicate_id" | "suite_mismatch";
  message: string;
};

export type LoadedCase<T> = T & { __sourceRoot: string };

export type LoadCasesResult<T> = {
  cases: LoadedCase<T>[];
  issues: LoadIssue[];
  roots: string[];
};

/**
 * Case data lives outside this repository. `EVAL_DATA_DIRS` is a colon-separated
 * list of dataset roots; later roots win on id collision so an overlay can patch
 * a case without editing the file it came from.
 *
 * Empty is a supported state, not an error: this repo is open source and most
 * contributors will never have the private dataset. Suites skip themselves.
 */
export function getEvalDataDirs(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return splitDirs(env.EVAL_DATA_DIRS ?? "");
}

export function loadEvalCases<TSchema extends z.ZodType>({
  suite,
  schema,
  roots = getEvalDataDirs(),
}: {
  suite: string;
  schema: TSchema;
  roots?: string[];
}): LoadCasesResult<z.infer<TSchema>> {
  const issues: LoadIssue[] = [];
  const byId = new Map<string, LoadedCase<z.infer<TSchema>>>();

  for (const root of roots) {
    const suiteDir = path.join(root, suite);
    if (!existsSync(suiteDir)) continue;

    const seenInRoot = new Set<string>();

    for (const file of listJsonlFiles(suiteDir)) {
      const lines = readFileSync(file, "utf8").split("\n");

      for (const [index, rawLine] of lines.entries()) {
        const line = rawLine.trim();
        if (!line) continue;

        const lineNumber = index + 1;
        const parsedJson = parseJson(line);
        if (!parsedJson.ok) {
          issues.push({
            file,
            line: lineNumber,
            caseId: null,
            reason: "invalid_json",
            message: parsedJson.message,
          });
          continue;
        }

        const parsed = schema.safeParse(parsedJson.value);
        if (!parsed.success) {
          issues.push({
            file,
            line: lineNumber,
            caseId: readId(parsedJson.value),
            reason: "schema_invalid",
            message: formatZodIssues(parsed.error),
          });
          continue;
        }

        const evalCase = parsed.data as z.infer<TSchema>;
        const id = readId(evalCase);
        const caseSuite = readSuite(evalCase);

        if (!id) continue;

        if (caseSuite && caseSuite !== suite) {
          issues.push({
            file,
            line: lineNumber,
            caseId: id,
            reason: "suite_mismatch",
            message: `case declares suite "${caseSuite}" but lives under "${suite}"`,
          });
          continue;
        }

        if (seenInRoot.has(id)) {
          issues.push({
            file,
            line: lineNumber,
            caseId: id,
            reason: "duplicate_id",
            message: `duplicate id "${id}" within ${root}`,
          });
          continue;
        }

        seenInRoot.add(id);
        byId.set(id, {
          ...(evalCase as object),
          __sourceRoot: root,
        } as LoadedCase<z.infer<TSchema>>);
      }
    }
  }

  const cases = [...byId.values()].sort((a, b) =>
    String(readId(a)).localeCompare(String(readId(b))),
  );

  return { cases, issues, roots };
}

export function formatLoadIssues(issues: LoadIssue[]): string {
  return issues
    .map(
      (issue) =>
        `${issue.file}:${issue.line} [${issue.reason}]${
          issue.caseId ? ` ${issue.caseId}` : ""
        } ${issue.message}`,
    )
    .join("\n");
}

function splitDirs(value: string): string[] {
  return value
    .split(":")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

function listJsonlFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .map((name) => path.join(dir, name));
}

function parseJson(
  line: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(line) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "unparseable line",
    };
  }
}

function readId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function readSuite(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const suite = (value as { suite?: unknown }).suite;
  return typeof suite === "string" ? suite : null;
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}
