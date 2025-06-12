"use client";

import Link from "next/link";
import { capitalCase } from "capital-case";
import { CheckCircle2Icon, EyeIcon, ExternalLinkIcon } from "lucide-react";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { HoverCard } from "@/components/HoverCard";
import { Badge } from "@/components/Badge";
import { isAIRule } from "@/utils/condition";
import { prefixPath } from "@/utils/path";

export function ProcessResultDisplay({
  result,
  prefix,
  emailAccountId,
}: {
  result: RunRulesResult;
  prefix?: string;
  emailAccountId: string;
}) {
  if (!result) return null;

  if (!result.rule) {
    return (
      <HoverCard
        className="w-auto max-w-3xl"
        content={
          <Alert variant="destructive" className="bg-background">
            <AlertTitle>No rule matched</AlertTitle>
            <AlertDescription className="space-y-2">
              <div>
                This email does not match any of the rules you have set.
              </div>
              <div>
                <strong>Reason:</strong> {result.reason || "No reason provided"}
              </div>
            </AlertDescription>
          </Alert>
        }
      >
        <Badge color="red">
          {prefix ? prefix : ""}No rule matched
          <EyeIcon className="ml-1.5 size-3.5 opacity-70" />
        </Badge>
      </HoverCard>
    );
  }

  const MAX_LENGTH = 280;

  const aiGeneratedContent = result.actionItems?.map((action, i) => (
    <div
      key={i}
      className="space-y-2 rounded-md border border-border bg-muted p-3"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-foreground">
        {capitalCase(action.type)}
      </div>
      {Object.entries(action)
        .filter(
          ([key, value]) =>
            value &&
            ["label", "subject", "content", "to", "cc", "bcc", "url"].includes(
              key,
            ),
        )
        .map(([key, value]) => (
          <div key={key} className="flex text-sm text-foreground">
            <span className="min-w-16 font-medium text-muted-foreground">
              {capitalCase(key)}:
            </span>
            <span className="ml-2 max-h-40 flex-1 overflow-y-auto">
              {value}
            </span>
          </div>
        ))}
    </div>
  ));

  return (
    <HoverCard
      className="w-auto max-w-5xl"
      content={
        <Alert variant="blue" className="max-w-prose bg-background">
          <CheckCircle2Icon className="h-4 w-4" />
          <AlertTitle className="flex items-center justify-between">
            Matched rule "{result.rule.name}"
            <Link
              href={prefixPath(
                emailAccountId,
                `/automation?tab=rule&ruleId=${result.rule.id}`,
              )}
              target="_blank"
              className="ml-1.5"
            >
              <span className="sr-only">View rule</span>
              <ExternalLinkIcon className="size-3.5 opacity-70" />
            </Link>
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-4">
            {isAIRule(result.rule) && (
              <div className="text-sm">
                <span className="font-medium">AI Instructions: </span>
                {result.rule.instructions.substring(0, MAX_LENGTH)}
                {result.rule.instructions.length >= MAX_LENGTH && "..."}
              </div>
            )}
            {!!aiGeneratedContent?.length && (
              <div className="space-y-3">{aiGeneratedContent}</div>
            )}
            {!!result.reason && (
              <div className="border-l-2 border-blue-200 pl-3 text-sm">
                <span className="font-medium">Reason: </span>
                {result.reason}
              </div>
            )}
          </AlertDescription>
        </Alert>
      }
    >
      <Badge color="green">
        {prefix ? prefix : ""}
        {result.rule.name}
        <EyeIcon className="ml-1.5 size-3.5 opacity-70" />
      </Badge>
    </HoverCard>
  );
}
