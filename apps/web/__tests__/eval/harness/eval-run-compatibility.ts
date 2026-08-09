import type {
  EvalResultRecord,
  EvalRun,
} from "@/__tests__/eval/harness/run-suite";

export function assertComparableEvalRuns(
  baseline: EvalRun,
  variant: EvalRun,
  { allowModelChange = false }: { allowModelChange?: boolean } = {},
): void {
  const issues = [
    ...runIntegrityIssues("baseline", baseline),
    ...runIntegrityIssues("variant", variant),
  ];

  if (baseline.evalName !== variant.evalName) {
    issues.push("eval names differ");
  }
  if (!allowModelChange && baseline.model !== variant.model) {
    issues.push(
      "generator models differ; pass --allow-model-change for an intentional cross-model comparison",
    );
  }
  compareRequiredFingerprint(
    issues,
    "judge",
    baseline.judgeFingerprint,
    variant.judgeFingerprint,
  );
  compareRequiredIdentity(
    issues,
    "judge providers",
    baseline.judgeProvider,
    variant.judgeProvider,
  );
  compareRequiredIdentity(
    issues,
    "judge models",
    baseline.judgeModel,
    variant.judgeModel,
  );
  compareRequiredFingerprint(
    issues,
    "environment",
    baseline.environmentFingerprint,
    variant.environmentFingerprint,
  );

  const baselineCases = describeCases(baseline.records);
  const variantCases = describeCases(variant.records);
  const baselineIds = [...baselineCases.keys()].sort();
  const variantIds = [...variantCases.keys()].sort();

  if (JSON.stringify(baselineIds) !== JSON.stringify(variantIds)) {
    issues.push("case-id sets differ");
  } else {
    for (const caseId of baselineIds) {
      const baselineCase = baselineCases.get(caseId);
      const variantCase = variantCases.get(caseId);
      if (!(baselineCase && variantCase)) continue;

      if (
        baselineCase.caseFingerprint === null ||
        variantCase.caseFingerprint === null
      ) {
        issues.push("at least one case is missing its case fingerprint");
        break;
      }
      if (baselineCase.caseFingerprint !== variantCase.caseFingerprint) {
        issues.push("case fingerprints differ");
        break;
      }
      if (
        JSON.stringify(baselineCase.sampleIndexes) !==
        JSON.stringify(variantCase.sampleIndexes)
      ) {
        issues.push("sample indexes differ");
        break;
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Eval runs are not comparable:\n${[...new Set(issues)].map((issue) => `- ${issue}`).join("\n")}`,
    );
  }
}

function runIntegrityIssues(label: string, run: EvalRun): string[] {
  const issues: string[] = [];
  if (!run.codeFingerprint) issues.push(`${label} is missing code fingerprint`);
  if (!run.judgeFingerprint)
    issues.push(`${label} is missing judge fingerprint`);
  if (!run.judgeProvider) issues.push(`${label} is missing judge provider`);
  if (!run.judgeModel) issues.push(`${label} is missing judge model`);
  if (!run.environmentFingerprint)
    issues.push(`${label} is missing environment fingerprint`);

  const caseCount = new Set(run.records.map((record) => record.caseId)).size;
  if (caseCount !== run.selectedCaseCount) {
    issues.push(`${label} selected-case count does not match its records`);
  }

  for (const record of run.records) {
    if (record.model !== run.model) {
      issues.push(`${label} contains a record from another generator model`);
      break;
    }
    if (record.variantId !== run.variantId) {
      issues.push(`${label} contains a record from another variant`);
      break;
    }
    if (record.codeFingerprint !== run.codeFingerprint) {
      issues.push(`${label} contains inconsistent code fingerprints`);
      break;
    }
    if (record.judgeFingerprint !== run.judgeFingerprint) {
      issues.push(`${label} contains inconsistent judge fingerprints`);
      break;
    }
    if (record.environmentFingerprint !== run.environmentFingerprint) {
      issues.push(`${label} contains inconsistent environment fingerprints`);
      break;
    }
  }

  for (const { caseFingerprint, sampleIndexes } of describeCases(
    run.records,
  ).values()) {
    if (caseFingerprint === null) {
      issues.push(`${label} contains a record without a case fingerprint`);
      break;
    }
    if (new Set(sampleIndexes).size !== sampleIndexes.length) {
      issues.push(`${label} contains duplicate sample indexes`);
      break;
    }
  }

  return issues;
}

function compareRequiredFingerprint(
  issues: string[],
  name: string,
  baseline: string | null,
  variant: string | null,
): void {
  if (!(baseline && variant)) return;
  if (baseline !== variant) issues.push(`${name} fingerprints differ`);
}

function compareRequiredIdentity(
  issues: string[],
  name: string,
  baseline: string | null,
  variant: string | null,
): void {
  if (!(baseline && variant)) return;
  if (baseline !== variant) issues.push(`${name} differ`);
}

function describeCases(
  records: EvalResultRecord[],
): Map<string, { caseFingerprint: string | null; sampleIndexes: number[] }> {
  const cases = new Map<
    string,
    { caseFingerprints: Set<string | null>; sampleIndexes: number[] }
  >();

  for (const record of records) {
    const current = cases.get(record.caseId) ?? {
      caseFingerprints: new Set<string | null>(),
      sampleIndexes: [],
    };
    current.caseFingerprints.add(record.caseFingerprint);
    current.sampleIndexes.push(record.sampleIndex);
    cases.set(record.caseId, current);
  }

  return new Map(
    [...cases.entries()].map(([caseId, value]) => [
      caseId,
      {
        caseFingerprint:
          value.caseFingerprints.size === 1
            ? (value.caseFingerprints.values().next().value ?? null)
            : null,
        sampleIndexes: value.sampleIndexes.sort((a, b) => a - b),
      },
    ]),
  );
}
