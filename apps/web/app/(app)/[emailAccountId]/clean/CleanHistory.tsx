"use client";

import useSWR from "swr";
import Link from "next/link";
import type { CleanHistoryResponse } from "@/app/api/clean/history/route";
import { LoadingContent } from "@/components/LoadingContent";
import { formatDateSimple } from "@/utils/date";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { MutedText } from "@/components/Typography";

export function CleanHistory() {
  const { emailAccountId } = useAccount();
  const { data, error, isLoading } =
    useSWR<CleanHistoryResponse>("/api/clean/history");

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data?.result.length ? (
        <div className="space-y-2">
          {data.result.map((job) => (
            <Link
              href={prefixPath(emailAccountId, `/clean/run?jobId=${job.id}`)}
              key={job.id}
              className="block w-full cursor-pointer rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">
                    {formatDateSimple(new Date(job.createdAt))}
                  </h4>
                </div>
                <MutedText>{job._count.threads} emails processed</MutedText>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <MutedText className="p-4 text-center">No history yet</MutedText>
      )}
    </LoadingContent>
  );
}
