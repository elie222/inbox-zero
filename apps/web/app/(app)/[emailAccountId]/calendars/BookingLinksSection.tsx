"use client";

import { useState } from "react";
import { Copy, ExternalLink, Link2, Settings2, Zap } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError, toastSuccess } from "@/components/Toast";
import { useBookingLinksEnabled } from "@/hooks/useFeatureFlags";
import { useBookingLinks } from "@/hooks/useBookingLinks";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import {
  createBookingLinkAction,
  updateBookingLinkAction,
} from "@/utils/actions/booking";
import { ConfigureBookingLinkDialog } from "./ConfigureBookingLinkDialog";

type BookingLink = NonNullable<
  ReturnType<typeof useBookingLinks>["data"]
>["bookingLinks"][number];

export function BookingLinksSection() {
  const bookingLinksEnabled = useBookingLinksEnabled();

  if (!bookingLinksEnabled) return null;

  return <BookingLinksPanel />;
}

function BookingLinksPanel() {
  const { emailAccountId, emailAccount, userEmail } = useAccount();
  const { data, isLoading, error, mutate } = useBookingLinks();
  const [configureLinkId, setConfigureLinkId] = useState<string | null>(null);

  const link = data?.bookingLinks[0] ?? null;
  const timezone =
    data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const defaultName = emailAccount?.name || userEmail.split("@")[0] || "you";
  const defaultSlug = suggestSlug(userEmail, defaultName);

  const { execute: createLink, isExecuting: isCreating } = useAction(
    createBookingLinkAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Booking link created" });
        mutate();
      },
      onError: (actionError) => {
        toastError({
          description:
            getActionErrorMessage(actionError.error) ??
            "Failed to create booking link",
        });
      },
    },
  );

  const { execute: toggleActive, isExecuting: isToggling } = useAction(
    updateBookingLinkAction.bind(null, emailAccountId),
    {
      onSuccess: () => mutate(),
      onError: (actionError) => {
        toastError({
          description:
            getActionErrorMessage(actionError.error) ??
            "Failed to update booking link",
        });
      },
    },
  );

  const handleCreate = () => {
    createLink({
      title: `${defaultName}'s booking link`,
      slug: defaultSlug,
      timezone,
      durationMinutes: 30,
      slotIntervalMinutes: 30,
    });
  };

  const handleToggle = (next: boolean) => {
    if (!link) return;
    toggleActive({ id: link.id, isActive: next });
  };

  return (
    <section className="space-y-3">
      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="h-32 w-full rounded-xl" />}
      >
        {link ? (
          <ActiveLinkCard
            link={link}
            isToggling={isToggling}
            onToggle={handleToggle}
            onConfigure={() => setConfigureLinkId(link.id)}
          />
        ) : (
          <EmptyLinkCard onCreate={handleCreate} isCreating={isCreating} />
        )}
      </LoadingContent>

      {link && configureLinkId === link.id ? (
        <ConfigureBookingLinkDialog
          link={link}
          onClose={() => setConfigureLinkId(null)}
          onSaved={() => {
            mutate();
            setConfigureLinkId(null);
          }}
        />
      ) : null}
    </section>
  );
}

function EmptyLinkCard({
  onCreate,
  isCreating,
}: {
  onCreate: () => void;
  isCreating: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-base font-semibold text-foreground">
          Booking link
        </h3>
        <span className="rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-400">
          New
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Create a link people can use to book time on your calendar.
      </p>
      <Button onClick={onCreate} loading={isCreating} Icon={Zap}>
        Create booking link
      </Button>
    </div>
  );
}

function ActiveLinkCard({
  link,
  isToggling,
  onToggle,
  onConfigure,
}: {
  link: BookingLink;
  isToggling: boolean;
  onToggle: (next: boolean) => void;
  onConfigure: () => void;
}) {
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/book/${link.slug}`
      : `/book/${link.slug}`;
  const displayUrl = stripScheme(publicUrl);
  const isActive = link.isActive;

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl);
    toastSuccess({ description: "Booking link copied" });
  };

  return (
    <div className="rounded-xl border bg-card px-5 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">
            Booking link
          </h3>
          {!isActive ? (
            <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-muted-foreground/60" />
              Inactive
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={isActive}
            disabled={isToggling}
            onCheckedChange={onToggle}
            size="sm"
            aria-label="Toggle booking link"
          />
          <Button
            variant="outline"
            size="sm"
            Icon={Settings2}
            onClick={onConfigure}
          >
            Configure
          </Button>
        </div>
      </div>

      <div
        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
          isActive
            ? "bg-muted/40"
            : "border-dashed bg-muted/30 text-muted-foreground"
        }`}
      >
        <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span
          className={`flex-1 truncate font-mono text-xs ${
            isActive ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {displayUrl}
        </span>
        {isActive ? (
          <>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              aria-label="Copy booking link"
              title="Copy booking link"
            >
              <Copy className="size-4" />
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              aria-label="Open booking link"
              title="Open booking link"
            >
              <ExternalLink className="size-4" />
            </a>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">not live</span>
        )}
      </div>
    </div>
  );
}

function stripScheme(url: string) {
  return url.replace(/^https?:\/\//, "");
}

function suggestSlug(email: string, fallback: string) {
  const local = email.split("@")[0] ?? fallback;
  return slugify(local) || slugify(fallback) || "me";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
