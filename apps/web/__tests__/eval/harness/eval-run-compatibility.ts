import type { EvalRun } from "@/__tests__/eval/harness/run-suite";

export function assertComparableEvalRuns(
  baseline: EvalRun,
  variant: EvalRun,
  { allowModelChange = false }: { allowModelChange?: boolean } = {},
): void {
  const baselineInspection = inspectRun("baseline", baseline);
  const variantInspection = inspectRun("variant", variant);
  const issues = [...baselineInspection.issues, ...variantInspection.issues];

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

  const baselineCases = baselineInspection.cases;
  const variantCases = variantInspection.cases;
  const baselineIds = [...baselineCases.keys()].sort();
  const variantIds = [...variantCases.keys()].sort();

  if (JSON.stringify(baselineIds) !== JSON.stringify(variantIds)) {
    issues.push("case-id sets differ");
  } else {
    for (const caseId of baselineIds) {
      const baselineCase = baselineCases.get(caseId);
      const variantCase = variantCases.get(caseId);
      if (!(baselineCase && variantCase)) continue;

      const baselineFingerprint = singleFingerprint(baselineCase);
      const variantFingerprint = singleFingerprint(variantCase);
      if (!(baselineFingerprint && variantFingerprint)) continue;

      if (baselineFingerprint !== variantFingerprint) {
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

type CaseInspection = {
  fingerprints: Set<string | null>;
  sampleIndexes: number[];
};

function inspectRun(
  label: string,
  run: EvalRun,
): { issues: string[]; cases: Map<string, CaseInspection> } {
  const issues: string[] = [];
  const cases = new Map<string, CaseInspection>();
  if (!run.codeFingerprint) issues.push(`${label} is missing code fingerprint`);
  if (!run.judgeFingerprint)
    issues.push(`${label} is missing judge fingerprint`);
  if (!run.judgeProvider) issues.push(`${label} is missing judge provider`);
  if (!run.judgeModel) issues.push(`${label} is missing judge model`);
  if (!run.environmentFingerprint)
    issues.push(`${label} is missing environment fingerprint`);

  let hasModelMismatch = false;
  let hasVariantMismatch = false;
  let hasCodeFingerprintMismatch = false;
  let hasJudgeFingerprintMismatch = false;
  let hasEnvironmentFingerprintMismatch = false;
  for (const record of run.records) {
    hasModelMismatch ||= record.model !== run.model;
    hasVariantMismatch ||= record.variantId !== run.variantId;
    hasCodeFingerprintMismatch ||=
      record.codeFingerprint !== run.codeFingerprint;
    hasJudgeFingerprintMismatch ||=
      record.judgeFingerprint !== run.judgeFingerprint;
    hasEnvironmentFingerprintMismatch ||=
      record.environmentFingerprint !== run.environmentFingerprint;

    const current = cases.get(record.caseId) ?? {
      fingerprints: new Set<string | null>(),
      sampleIndexes: [],
    };
    current.fingerprints.add(record.caseFingerprint);
    current.sampleIndexes.push(record.sampleIndex);
    cases.set(record.caseId, current);
  }

  if (hasModelMismatch)
    issues.push(`${label} contains a record from another generator model`);
  if (hasVariantMismatch)
    issues.push(`${label} contains a record from another variant`);
  if (hasCodeFingerprintMismatch)
    issues.push(`${label} contains inconsistent code fingerprints`);
  if (hasJudgeFingerprintMismatch)
    issues.push(`${label} contains inconsistent judge fingerprints`);
  if (hasEnvironmentFingerprintMismatch)
    issues.push(`${label} contains inconsistent environment fingerprints`);

  if (cases.size !== run.selectedCaseCount) {
    issues.push(`${label} selected-case count does not match its records`);
  }

  const descriptions = [...cases.values()];
  for (const description of descriptions) {
    description.sampleIndexes.sort((a, b) => a - b);
  }
  if (
    descriptions.some((description) =>
      [...description.fingerprints].some((fingerprint) => !fingerprint),
    )
  ) {
    issues.push(`${label} contains a record without a case fingerprint`);
  }
  if (descriptions.some((description) => description.fingerprints.size > 1)) {
    issues.push(`${label} contains inconsistent case fingerprints`);
  }
  if (
    descriptions.some(
      ({ sampleIndexes }) =>
        new Set(sampleIndexes).size !== sampleIndexes.length,
    )
  ) {
    issues.push(`${label} contains duplicate sample indexes`);
  }

  return { issues, cases };
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

function singleFingerprint({
  fingerprints,
}: CaseInspection): string | undefined {
  if (fingerprints.size !== 1) return;
  return fingerprints.values().next().value ?? undefined;
}
