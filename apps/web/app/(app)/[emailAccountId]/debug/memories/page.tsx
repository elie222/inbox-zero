"use client";

import type {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { LoadingContent } from "@/components/LoadingContent";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeading } from "@/components/Typography";
import type { DebugMemoriesResponse } from "@/app/api/user/debug/memories/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

const REPLY_MEMORY_KIND_LABELS: Record<ReplyMemoryKind, string> = {
  FACT: "Fact",
  PREFERENCE: "Preference",
  PROCEDURE: "Procedure",
};

const REPLY_MEMORY_SCOPE_LABELS: Record<ReplyMemoryScopeType, string> = {
  GLOBAL: "Global",
  SENDER: "Sender",
  DOMAIN: "Domain",
  TOPIC: "Topic",
};

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
          <div className="grid gap-3 sm:grid-cols-3">
            <MemoryCountCard label="Total memories" count={data?.totalCount} />
            <MemoryCountCard
              label="Chat memories"
              count={data?.chatMemoryCount}
            />
            <MemoryCountCard
              label="Drafting reply memories"
              count={data?.replyMemoryCount}
            />
          </div>

          <MemorySection
            title="Chat memories"
            emptyMessage="No chat memories stored yet."
            items={data?.chatMemories}
            renderItem={(memory) => (
              <div key={memory.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Chat</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(memory.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-sm">{memory.content}</p>
                {memory.chatId && (
                  <Link
                    href={prefixPath(
                      emailAccountId,
                      `/assistant?chatId=${memory.chatId}`,
                    )}
                    className="mt-2 inline-block text-xs underline hover:text-foreground"
                  >
                    View chat
                  </Link>
                )}
              </div>
            )}
          />

          <MemorySection
            title="Drafting reply memories"
            emptyMessage="No drafting reply memories stored yet."
            items={data?.replyMemories}
            renderItem={(memory) => (
              <div key={memory.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{REPLY_MEMORY_KIND_LABELS[memory.kind]}</Badge>
                  <Badge variant="secondary">
                    {formatScope(memory.scopeType, memory.scopeValue)}
                  </Badge>
                  {memory.isLearnedStyleEvidence && (
                    <Badge variant="outline">Learned style</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {memory._count.sources}{" "}
                    {memory._count.sources === 1 ? "source" : "sources"}
                  </span>
                </div>
                <p className="mt-2 text-sm">{memory.content}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>
                    Created {new Date(memory.createdAt).toLocaleString()}
                  </span>
                  <span>
                    Updated {new Date(memory.updatedAt).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          />
        </div>
      </LoadingContent>
    </PageWrapper>
  );
}

function MemoryCountCard({
  label,
  count,
}: {
  label: string;
  count: number | undefined;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-medium">{count ?? 0}</p>
    </div>
  );
}

function MemorySection<T>({
  title,
  emptyMessage,
  items,
  renderItem,
}: {
  title: string;
  emptyMessage: string;
  items: T[] | undefined;
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {items && items.length > 0 ? (
        <div className="space-y-2">{items.map(renderItem)}</div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </section>
  );
}

function formatScope(scopeType: ReplyMemoryScopeType, scopeValue: string) {
  const label = REPLY_MEMORY_SCOPE_LABELS[scopeType];
  if (!scopeValue) return label;

  return `${label}: ${scopeValue}`;
}
