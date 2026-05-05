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

export function enforceSensitiveDataPolicy<T extends LlmRequestOptions>({
  options,
  emailAccountId,
  label,
  logger,
  policy,
  userId,
}: LlmSensitiveDataOptions & { options: T }): T {
  const parsedPolicy = resolveSensitiveDataPolicy(policy);
  if (parsedPolicy === "ALLOW") return options;

  const findings = getSensitiveContentFindings(options);
  if (findings.length === 0) return options;

  const summary = summarizeFindings(findings);
  logger.warn("Sensitive content detected in AI request", {
    emailAccountId,
    userId,
    label,
    policy: parsedPolicy,
    ...summary,
  });

  if (parsedPolicy === "BLOCK") {
    throw new SafeError(
      "Sensitive content was detected, so this AI request was blocked by your account settings.",
    );
  }

  if (parsedPolicy === "REDACT") {
    return redactLlmRequestOptions(options);
  }

  return options;
}

export function redactSensitiveContentForLogging(text: string | undefined) {
  return text ? redactSensitiveContent(text) : undefined;
}

function getSensitiveContentFindings(options: LlmRequestOptions) {
  const strings = [
    ...collectStrings(options.system),
    ...collectStrings(options.prompt),
    ...collectStrings(options.messages),
  ];

  return strings.flatMap((text) => scanSensitiveContent(text));
}

function redactLlmRequestOptions<T extends LlmRequestOptions>(options: T): T {
  let changed = false;
  const nextOptions: LlmRequestOptions = { ...options };

  if ("system" in options) {
    const nextSystem = redactUnknown(options.system);
    if (nextSystem !== options.system) changed = true;
    nextOptions.system = nextSystem;
  }

  if ("prompt" in options) {
    const nextPrompt = redactUnknown(options.prompt);
    if (nextPrompt !== options.prompt) changed = true;
    nextOptions.prompt = nextPrompt;
  }

  if ("messages" in options) {
    const nextMessages = redactUnknown(options.messages);
    if (nextMessages !== options.messages) changed = true;
    nextOptions.messages = nextMessages;
  }

  return changed ? (nextOptions as T) : options;
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
      const nextItem = redactUnknown(item);
      if (nextItem !== item) changed = true;
      nextValue[key] = nextItem;
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
    return Object.values(value).flatMap((item) => collectStrings(item));
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
