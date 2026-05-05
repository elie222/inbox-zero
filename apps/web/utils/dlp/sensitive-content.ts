export const SENSITIVE_DATA_POLICIES = ["ALLOW", "REDACT", "BLOCK"] as const;

export type SensitiveDataPolicy = (typeof SENSITIVE_DATA_POLICIES)[number];

export const DEFAULT_SENSITIVE_DATA_POLICY: SensitiveDataPolicy = "ALLOW";

export type SensitiveContentCategory = "credential" | "payment_card";

export type SensitiveContentFinding = {
  category: SensitiveContentCategory;
  label: string;
  start: number;
  end: number;
};

const CREDENTIAL_VALUE_PATTERN =
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|token|client[_-]?secret|secret|password|passwd|pwd)\b\s*(?:=|:)\s*["']?([^\s"',;]{12,})/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+([A-Za-z0-9._~+/-]{20,}=*)\b/g;
const JSON_WEB_TOKEN_PATTERN =
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const PAYMENT_CARD_CANDIDATE_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;

const REDACTION_LABELS: Record<SensitiveContentCategory, string> = {
  credential: "CREDENTIAL",
  payment_card: "PAYMENT_CARD",
};

export function parseSensitiveDataPolicy(
  value: string | null | undefined,
): SensitiveDataPolicy {
  if (value && SENSITIVE_DATA_POLICIES.includes(value as SensitiveDataPolicy)) {
    return value as SensitiveDataPolicy;
  }

  return DEFAULT_SENSITIVE_DATA_POLICY;
}

export function scanSensitiveContent(text: string): SensitiveContentFinding[] {
  if (!text) return [];

  return normalizeFindings([
    ...scanCredentialLikeContent(text),
    ...scanPaymentCards(text),
  ]);
}

export function redactSensitiveContent(text: string): string {
  const findings = scanSensitiveContent(text);
  if (findings.length === 0) return text;

  return mergeFindings(findings)
    .sort((a, b) => b.start - a.start)
    .reduce((result, finding) => {
      const label = REDACTION_LABELS[finding.category];
      return `${result.slice(0, finding.start)}[REDACTED:${label}]${result.slice(finding.end)}`;
    }, text);
}

function scanCredentialLikeContent(text: string): SensitiveContentFinding[] {
  const findings: SensitiveContentFinding[] = [];

  for (const match of text.matchAll(PRIVATE_KEY_PATTERN)) {
    if (typeof match.index !== "number") continue;
    findings.push({
      category: "credential",
      label: "private_key",
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  for (const match of text.matchAll(CREDENTIAL_VALUE_PATTERN)) {
    const secretValue = match[1];
    if (!secretValue || typeof match.index !== "number") continue;

    const valueOffset = match[0].lastIndexOf(secretValue);
    findings.push({
      category: "credential",
      label: "credential_value",
      start: match.index + valueOffset,
      end: match.index + valueOffset + secretValue.length,
    });
  }

  for (const match of text.matchAll(BEARER_TOKEN_PATTERN)) {
    const token = match[1];
    if (!token || typeof match.index !== "number") continue;

    const tokenOffset = match[0].lastIndexOf(token);
    findings.push({
      category: "credential",
      label: "bearer_token",
      start: match.index + tokenOffset,
      end: match.index + tokenOffset + token.length,
    });
  }

  for (const match of text.matchAll(JSON_WEB_TOKEN_PATTERN)) {
    if (typeof match.index !== "number") continue;
    findings.push({
      category: "credential",
      label: "json_web_token",
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return findings;
}

function scanPaymentCards(text: string): SensitiveContentFinding[] {
  const findings: SensitiveContentFinding[] = [];

  for (const match of text.matchAll(PAYMENT_CARD_CANDIDATE_PATTERN)) {
    if (typeof match.index !== "number") continue;

    const digits = match[0].replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) continue;
    if (!passesLuhnCheck(digits)) continue;

    findings.push({
      category: "payment_card",
      label: "luhn_number",
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return findings;
}

function passesLuhnCheck(digits: string) {
  let sum = 0;
  let doubleDigit = false;

  for (let index = digits.length - 1; index >= 0; index--) {
    let value = Number(digits[index]);
    if (doubleDigit) {
      value *= 2;
      if (value > 9) value -= 9;
    }

    sum += value;
    doubleDigit = !doubleDigit;
  }

  return sum > 0 && sum % 10 === 0;
}

function normalizeFindings(findings: SensitiveContentFinding[]) {
  const sorted = findings
    .filter((finding) => finding.end > finding.start)
    .sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return b.end - a.end;
    });

  const normalized: SensitiveContentFinding[] = [];

  for (const finding of sorted) {
    const previous = normalized.at(-1);

    if (!previous || finding.start >= previous.end) {
      normalized.push(finding);
      continue;
    }

    const previousLength = previous.end - previous.start;
    const findingLength = finding.end - finding.start;

    if (findingLength > previousLength) {
      normalized[normalized.length - 1] = finding;
    }
  }

  return normalized;
}

function mergeFindings(findings: SensitiveContentFinding[]) {
  return findings.reduce<SensitiveContentFinding[]>((merged, finding) => {
    const previous = merged.at(-1);

    if (!previous || finding.start >= previous.end) {
      merged.push({ ...finding });
      return merged;
    }

    previous.end = Math.max(previous.end, finding.end);
    return merged;
  }, []);
}
