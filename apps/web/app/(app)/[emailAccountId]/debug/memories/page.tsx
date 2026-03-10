"use client";

import Link from "next/link";
import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeading } from "@/components/Typography";
import type { DebugMemoriesResponse } from "@/app/api/user/debug/memories/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

export default function DebugMemoriesPage() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useSWR<DebugMemoriesResponse>(
    emailAccountId ? ["/api/user/debug/memories", emailAccountId] : null,
  );

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
            {data?.memories?.map((memory) => (
              <div key={memory.id} className="rounded-lg border p-3">
                <p className="text-sm">{memory.content}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(memory.createdAt).toLocaleString()}</span>
                  {memory.chatId && (
                    <Link
                      href={prefixPath(emailAccountId, `/assistant?chatId=${memory.chatId}`)}
                      className="underline hover:text-foreground"
                    >
                      View chat
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {data?.memories?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No memories stored yet.
              </p>
            )}
          </div>
        </div>
      </LoadingContent>
    </PageWrapper>
  );
}
