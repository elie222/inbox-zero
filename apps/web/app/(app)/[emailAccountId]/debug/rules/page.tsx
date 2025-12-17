"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { CopyIcon, CheckIcon } from "lucide-react";
import { PageHeading } from "@/components/Typography";
import { PageWrapper } from "@/components/PageWrapper";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toastSuccess, toastError } from "@/components/Toast";
import { toggleAllRulesAction } from "@/utils/actions/rule";
import type { DebugRulesResponse } from "@/app/api/user/debug/rules/route";
import { useAccount } from "@/providers/EmailAccountProvider";

export default function DebugRulesPage() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<DebugRulesResponse>(
    "/api/user/debug/rules",
  );
  const [copied, setCopied] = useState(false);
  const allRulesEnabled = data?.every((rule) => rule.enabled) ?? false;
  const someRulesEnabled = data?.some((rule) => rule.enabled) ?? false;
  const { execute, isExecuting } = useAction(
    toggleAllRulesAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Rules updated successfully" });
        mutate();
      },
      onError: (result) => {
        toastError({
          title: "Failed to update rules",
          description: result.error.serverError || "Unknown error",
        });
      },
    },
  );

  const handleCopy = useCallback(() => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    toastSuccess({ description: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  return (
    <PageWrapper>
      <PageHeading>Rules</PageHeading>

      <LoadingContent loading={isLoading} error={error}>
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Switch
                id="toggle-all-rules"
                checked={allRulesEnabled}
                onCheckedChange={(enabled) => execute({ enabled })}
                disabled={isExecuting}
              />
              <Label htmlFor="toggle-all-rules" className="font-medium">
                {allRulesEnabled
                  ? "All rules enabled"
                  : someRulesEnabled
                    ? "Some rules enabled"
                    : "All rules disabled"}
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!data}
            >
              {copied ? (
                <CheckIcon className="mr-2 h-4 w-4" />
              ) : (
                <CopyIcon className="mr-2 h-4 w-4" />
              )}
              {copied ? "Copied" : "Copy JSON"}
            </Button>
          </div>

          <div className="rounded-lg border bg-muted/50 p-4">
            <pre className="overflow-auto text-sm">
              {data ? JSON.stringify(data, null, 2) : "Loading..."}
            </pre>
          </div>
        </div>
      </LoadingContent>
    </PageWrapper>
  );
}
