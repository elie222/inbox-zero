"use client";

import { useCallback, useState } from "react";
import { CopyIcon, CheckIcon } from "lucide-react";
import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeading } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import type { DebugMemoriesResponse } from "@/app/api/user/debug/memories/route";
import { useAccount } from "@/providers/EmailAccountProvider";

export default function DebugMemoriesPage() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useSWR<DebugMemoriesResponse>(
    emailAccountId ? ["/api/user/debug/memories", emailAccountId] : null,
  );
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  return (
    <PageWrapper>
      <PageHeading>Memories Debug</PageHeading>

      <LoadingContent loading={isLoading} error={error}>
        <div className="mt-6 space-y-6">
          <div className="rounded-lg border p-3 sm:w-fit">
            <p className="text-xs text-muted-foreground">Total Memories</p>
            <p className="mt-1 text-lg font-medium">
              {data?.totalCount ?? 0}
            </p>
          </div>

          <div className="space-y-2">
            {data?.memories.map((memory) => (
              <div key={memory.id} className="rounded-lg border p-3">
                <p className="text-sm">{memory.content}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(memory.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
            {data?.memories.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No memories stored yet.
              </p>
            )}
          </div>

          <div className="flex justify-end">
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
        </div>
      </LoadingContent>
    </PageWrapper>
  );
}
