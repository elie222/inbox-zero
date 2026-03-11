const RULE_NOT_FOUND_ERROR = "Rule not found";

export function isMissingRuleError(
  error?: {
    error?: string;
    info?: { error?: string };
    message?: string;
    status?: number;
  } | null,
) {
  if (!error) return false;

  return (
    error.status === 404 ||
    error.info?.error === RULE_NOT_FOUND_ERROR ||
    error.error === RULE_NOT_FOUND_ERROR ||
    error.message === RULE_NOT_FOUND_ERROR
  );
}
