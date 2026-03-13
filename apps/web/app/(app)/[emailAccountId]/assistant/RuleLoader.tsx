"use client";

import type { RuleResponse } from "@/app/api/user/rules/[id]/route";
import { LoadingContent } from "@/components/LoadingContent";
import { useRule } from "@/hooks/useRule";
import { RuleNotFoundState } from "./RuleNotFoundState";
import { isMissingRuleError } from "./rule-fetch-error";

export function RuleLoader({
  ruleId,
  children,
}: {
  ruleId: string;
  children: (props: {
    mutate: ReturnType<typeof useRule>["mutate"];
    rule: RuleResponse["rule"];
  }) => React.ReactNode;
}) {
  const { data, isLoading, error, mutate } = useRule(ruleId);
  const isMissingRule = isMissingRuleError(error);

  if (isMissingRule) return <RuleNotFoundState />;

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data ? children({ rule: data.rule, mutate }) : null}
    </LoadingContent>
  );
}
