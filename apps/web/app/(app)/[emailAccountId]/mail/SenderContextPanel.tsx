"use client";

import { useEffect, useRef } from "react";
import {
  Building2Icon,
  ExternalLinkIcon,
  type LucideIcon,
  SparklesIcon,
  UsersIcon,
  WalletCardsIcon,
  XIcon,
} from "lucide-react";
import { usePublicContactContext } from "@/app/(app)/[emailAccountId]/mail/use-public-contact-context";
import { LoadingContent } from "@/components/LoadingContent";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PublicContactContextUnavailableReason } from "@/utils/ai/public-contact-context";
import type { PublicContactContext } from "@/utils/ai/public-contact-context-schema";

type SenderContextPanelProps = {
  messageId: string;
  senderName: string;
  senderEmail: string;
  /**
   * `inline` sits beside the reader as a pane. `sheet` slides over it, for
   * viewports too narrow to give up a column.
   */
  variant: "inline" | "sheet";
  onClose: () => void;
};

/** Who a sender is, from public sources: role, company, and where that came from. */
export function SenderContextPanel({
  messageId,
  senderName,
  senderEmail,
  variant,
  onClose,
}: SenderContextPanelProps) {
  const { data, isLoading, error } = usePublicContactContext({
    messageId,
    enabled: true,
  });
  const isResearching =
    isLoading ||
    (data?.status === "unavailable" && data.reason === "research_in_progress");
  const inlineRef = useRef<HTMLElement>(null);

  // Takes focus like the sheet does, so Escape lands on the pane and can
  // dismiss it from the keyboard.
  useEffect(() => {
    inlineRef.current?.focus();
  }, []);

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
      <LoadingContent
        error={error}
        errorComponent={<ContextError />}
        loading={isResearching}
        loadingComponent={<ContextSkeleton />}
      >
        {data?.status === "found" ? (
          <PublicContext context={data.context} />
        ) : (
          <ContextUnavailable reason={data?.reason} />
        )}
      </LoadingContent>
    </div>
  );

  const identity = (
    <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <Avatar className="size-10 border border-border">
        <AvatarFallback className="font-title font-medium text-sm">
          {getInitials(senderName || senderEmail)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate font-title font-medium text-base text-foreground">
          {senderName}
        </div>
        <div className="truncate text-muted-foreground text-sm">
          {senderEmail}
        </div>
      </div>
    </div>
  );

  if (variant === "sheet") {
    return (
      <Sheet onOpenChange={(open) => !open && onClose()} open>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <SheetTitle className="sr-only">{senderName}</SheetTitle>
          <SheetDescription className="sr-only">{senderEmail}</SheetDescription>
          <div className="border-border border-b px-5 py-4 pr-12">
            {identity}
          </div>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      aria-label="Sender profile"
      className="flex w-80 shrink-0 flex-col border-border border-l bg-card outline-none"
      data-testid="sender-context-panel"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Stopped here so the mail shell's Escape shortcut, which listens on
        // the document, doesn't also close the whole reader.
        event.stopPropagation();
        onClose();
      }}
      ref={inlineRef}
      tabIndex={-1}
    >
      <div className="flex items-start gap-2 border-border border-b px-5 py-4">
        {identity}
        <Button
          aria-label="Close sender profile"
          className="-mr-2 -mt-1 size-7 shrink-0 text-muted-foreground"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      {body}
    </aside>
  );
}

function PublicContext({ context }: { context: PublicContactContext }) {
  return (
    <div className="space-y-6">
      {context.role || context.confidence === "low" ? (
        <section>
          <div className="flex flex-wrap items-center gap-2">
            {context.role ? (
              <div className="font-medium text-foreground text-sm">
                {context.role}
              </div>
            ) : null}
            {context.confidence === "low" ? (
              <Badge className="font-normal" variant="outline">
                Possible match
              </Badge>
            ) : null}
          </div>
        </section>
      ) : null}

      {context.company ? <CompanyContext company={context.company} /> : null}

      <section className="border-border border-t pt-5">
        <h3 className="font-medium text-foreground text-xs uppercase tracking-wide">
          Public sources
        </h3>
        <div className="mt-3 space-y-2">
          {context.sources.map((source, index) => (
            <a
              className="flex items-start gap-2 rounded-md px-2 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
              href={source}
              key={`${source}-${index}`}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0" />
              <span className="line-clamp-2">{getSourceLabel(source)}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function CompanyContext({
  company,
}: {
  company: NonNullable<PublicContactContext["company"]>;
}) {
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-card">
          <Building2Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-title font-medium text-foreground">
              {company.name}
            </h3>
            {company.website ? (
              <a
                aria-label={`Visit ${company.name}`}
                className="text-muted-foreground hover:text-foreground"
                href={company.website}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLinkIcon className="size-3.5" />
              </a>
            ) : null}
          </div>
          {company.industry ? (
            <div className="mt-0.5 text-muted-foreground text-xs">
              {company.industry}
            </div>
          ) : null}
        </div>
      </div>

      {company.description ? (
        <p className="mt-3 text-muted-foreground text-sm leading-5">
          {company.description}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 text-xs">
        {company.employeeCount ? (
          <CompanyFact icon={UsersIcon} value={company.employeeCount} />
        ) : null}
        {company.funding ? (
          <CompanyFact icon={WalletCardsIcon} value={company.funding} />
        ) : null}
      </div>
    </section>
  );
}

function CompanyFact({
  icon: Icon,
  value,
}: {
  icon: LucideIcon;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span>{value}</span>
    </div>
  );
}

function ContextUnavailable({
  reason,
}: {
  reason?: PublicContactContextUnavailableReason;
}) {
  const message = getUnavailableMessage(reason);

  return (
    <div className="flex min-h-64 flex-col items-center justify-center text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <SparklesIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-3 font-medium text-foreground text-sm">
        No public context
      </div>
      <p className="mt-1 max-w-64 text-muted-foreground text-xs leading-5">
        {message}
      </p>
    </div>
  );
}

function ContextError() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center text-center">
      <div className="font-medium text-foreground text-sm">
        Couldn't load public context
      </div>
      <p className="mt-1 text-muted-foreground text-xs">
        Close the panel and try again.
      </p>
    </div>
  );
}

function ContextSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function getUnavailableMessage(reason?: PublicContactContextUnavailableReason) {
  switch (reason) {
    case "personal_email":
      return "Public profiles are not researched for personal email addresses.";
    case "search_unavailable":
      return "Web search is not configured for this account.";
    case "cache_unavailable":
      return "Public context is temporarily unavailable. Try again shortly.";
    default:
      return "No confident public professional profile was found.";
  }
}

function getSourceLabel(url: string) {
  return new URL(url).hostname.replace(/^www\./, "");
}
