import type { Logger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import {
  redactSensitiveContent,
  scanSensitiveContent,
  type SensitiveContentFinding,
} from "@/utils/dlp/sensitive-content";
import { resolveSensitiveDataPolicy } from "@/utils/dlp/policy.server";

type LlmSensitiveDataOptions = {
  emailAccountId?: string;
  label: string;
  logger: Logger;
  policy?: string | null;
  userId?: string;
};

type LlmRequestOptions = {
  messages?: unknown;
  prompt?: unknown;
  system?: unknown;
};

const BLOCKED_TOOL_OUTPUT = {
  error:
    "Sensitive content was detected, so this tool result was blocked by your account settings.",
  blocked: true,
} as const;

export function enforceSensitiveDataPolicy<T extends LlmRequestOptions>({
  options,
  emailAccountId,
  label,
  logger,
  policy,
  userId,
}: LlmSensitiveDataOptions & { options: T }): T {
  return enforceSensitiveDataPolicyOnValue({
    value: options,
    emailAccountId,
    label,
    logger,
    policy,
    userId,
    getFindings: getLlmRequestSensitiveContentFindings,
  });
}

export function enforceSensitiveToolOutputPolicy<T>({
  output,
  emailAccountId,
  label,
  logger,
  policy,
  userId,
}: LlmSensitiveDataOptions & { output: T }): T {
  return enforceSensitiveDataPolicyOnValue({
    value: output,
    emailAccountId,
    label,
    logger,
    policy,
    userId,
    blockReplacement: BLOCKED_TOOL_OUTPUT,
  });
}

function enforceSensitiveDataPolicyOnValue<T>({
  value,
  emailAccountId,
  label,
  logger,
  policy,
  userId,
  blockReplacement,
  getFindings = getSensitiveContentFindings,
}: LlmSensitiveDataOptions & {
  blockReplacement?: unknown;
  getFindings?: (value: T) => SensitiveContentFinding[];
  value: T;
}): T {
  const parsedPolicy = resolveSensitiveDataPolicy(policy);
  if (parsedPolicy === "ALLOW") return value;

  const findings = getFindings(value);
  if (findings.length === 0) return value;

  const summary = summarizeFindings(findings);
  logger.warn("Sensitive content detected in AI content", {
    emailAccountId,
    userId,
    label,
    policy: parsedPolicy,
    ...summary,
  });

  if (parsedPolicy === "BLOCK") {
    if (blockReplacement !== undefined) return blockReplacement as T;

    throw new SafeError(
      "Sensitive content was detected, so this AI request was blocked by your account settings.",
    );
  }

  if (parsedPolicy === "REDACT") {
    return redactUnknown(value) as T;
  }

  return value;
}

export function redactSensitiveContentForLogging(text: string | undefined) {
  return text ? redactSensitiveContent(text) : undefined;
}

function getSensitiveContentFindings(value: unknown) {
  const strings = collectStrings(value);
  return strings.flatMap((text) => scanSensitiveContent(text));
}

function getLlmRequestSensitiveContentFindings(options: LlmRequestOptions) {
  const strings = [
    ...collectStrings(options.system),
    ...collectStrings(options.prompt),
    ...collectStrings(options.messages),
  ];

  return strings.flatMap((text) => scanSensitiveContent(text));
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    const redacted = redactSensitiveContent(value);
    return redacted === value ? value : redacted;
  }

  if (Array.isArray(value)) {
    let changed = false;
    const nextValue = value.map((item) => {
      const nextItem = redactUnknown(item);
      if (nextItem !== item) changed = true;
      return nextItem;
    });

    return changed ? nextValue : value;
  }

  if (isRecord(value)) {
    let changed = false;
    const nextValue: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      const nextKey = redactSensitiveContent(key);
      if (nextKey !== key) changed = true;

      const nextItem = redactUnknown(item);
      if (nextItem !== item) changed = true;
      nextValue[nextKey] = nextItem;
    }

    return changed ? nextValue : value;
  }

  return value;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) => [
      key,
      ...collectStrings(item),
    ]);
  }

  return [];
}

function summarizeFindings(findings: SensitiveContentFinding[]): {
  categories: SensitiveContentFinding["category"][];
  findingCount: number;
  labels: string[];
} {
  return {
    categories: uniqueSorted(findings.map((finding) => finding.category)),
    findingCount: findings.length,
    labels: uniqueSorted(findings.map((finding) => finding.label)),
  };
}

function uniqueSorted<T extends string>(values: T[]) {
  return Array.from(new Set(values)).sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
