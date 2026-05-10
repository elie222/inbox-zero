"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  Link2,
  Settings2,
  Zap,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { CardBasic } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError, toastSuccess } from "@/components/Toast";
import { useBookingLinksEnabled } from "@/hooks/useFeatureFlags";
import { useBookingLinks } from "@/hooks/useBookingLinks";
import { useCalendars } from "@/hooks/useCalendars";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import {
  createBookingLinkAction,
  updateBookingLinkAction,
} from "@/utils/actions/booking";
import { updateCalendarBookingLinkAction } from "@/utils/actions/calendar";
import { updateBookingLinkBody } from "@/utils/actions/calendar.validation";
import { getBookingLinkSlugSuggestion } from "@/utils/booking/slug";
import { cn } from "@/utils";
import { ConfigureBookingLinkDialog } from "./ConfigureBookingLinkDialog";
import { CreateBookingLinkDialog } from "./CreateBookingLinkDialog";

type BookingLink = NonNullable<
  ReturnType<typeof useBookingLinks>["data"]
>["bookingLinks"][number];

export function BookingLinksSection() {
  const bookingLinksEnabled = useBookingLinksEnabled();

  if (!bookingLinksEnabled) return null;

  return <BookingLinksPanel />;
}

function BookingLinksPanel() {
  const { emailAccountId, emailAccount } = useAccount();
  const { data, isLoading, error, mutate } = useBookingLinks();
  const [configureLinkId, setConfigureLinkId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const link = data?.bookingLinks[0] ?? null;
  const timezone =
    data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const defaultName = emailAccount?.name?.trim() || null;
  const defaultTitle = defaultName
    ? `${defaultName}'s booking link`
    : "Booking link";
  const defaultSlug = getBookingLinkSlugSuggestion(defaultName);

  const { executeAsync: createLink, isExecuting: isCreating } = useAction(
    createBookingLinkAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Booking link created" });
        mutate();
        setCreateOpen(false);
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

  const handleCreate = async ({
    title,
    slug,
    durationMinutes,
    destinationCalendarId,
    videoEnabled,
    description,
  }: {
    title: string;
    slug: string;
    durationMinutes: number;
    destinationCalendarId: string | null;
    videoEnabled: boolean;
    description: string;
  }) => {
    await createLink({
      title,
      slug,
      timezone,
      description,
      durationMinutes,
      slotIntervalMinutes: durationMinutes,
      destinationCalendarId,
      videoEnabled,
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
          <EmptyLinkCard onCreate={() => setCreateOpen(true)} />
        )}
      </LoadingContent>

      <ExternalBookingLinkCard />

      {createOpen ? (
        <CreateBookingLinkDialog
          key={defaultSlug}
          data={data}
          defaultTitle={defaultTitle}
          defaultSlug={defaultSlug}
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
          isCreating={isCreating}
        />
      ) : null}

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

function ExternalBookingLinkCard() {
  const { emailAccountId } = useAccount();
  const analytics = useProductAnalytics("calendars");
  const { data, isLoading, error, mutate } = useCalendars();
  const calendarBookingLink = data?.calendarBookingLink || null;

  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const isOpen = userToggled ?? Boolean(calendarBookingLink);

  const { execute, isExecuting } = useAction(
    updateCalendarBookingLinkAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        analytics.captureAction("calendar_booking_link_saved", {
          had_existing_booking_link: Boolean(calendarBookingLink),
        });
        toastSuccess({ description: "Booking link updated!" });
        mutate();
      },
    },
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof updateBookingLinkBody>>({
    resolver: zodResolver(updateBookingLinkBody),
    defaultValues: { bookingLink: calendarBookingLink || "" },
  });

  useEffect(() => {
    if (calendarBookingLink !== null || data) {
      reset({ bookingLink: calendarBookingLink || "" });
    }
  }, [calendarBookingLink, reset, data]);

  const onSubmit: SubmitHandler<z.infer<typeof updateBookingLinkBody>> = (
    formData,
  ) => {
    analytics.captureAction("calendar_booking_link_save_started", {
      has_booking_link: Boolean(formData.bookingLink),
    });
    execute(formData);
  };

  return (
    <CardBasic className="px-4 py-3">
      <button
        type="button"
        onClick={() => setUserToggled(!isOpen)}
        className="flex w-full items-center justify-between gap-2 text-left text-sm text-muted-foreground hover:text-foreground"
        aria-expanded={isOpen}
      >
        <span>Use your own scheduling link</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {isOpen ? (
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="mt-3 h-10 w-full" />}
        >
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start"
          >
            <div className="flex-1">
              <Input
                type="url"
                name="bookingLink"
                placeholder="https://cal.com/your-link"
                registerProps={register("bookingLink")}
                error={errors.bookingLink}
              />
            </div>
            <Button
              type="submit"
              loading={isExecuting}
              size="sm"
              className="w-full sm:w-auto"
            >
              Save
            </Button>
          </form>
        </LoadingContent>
      ) : null}
    </CardBasic>
  );
}

function EmptyLinkCard({ onCreate }: { onCreate: () => void }) {
  return (
    <CardBasic className="px-4 py-4">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="font-medium">Booking link</h3>
        <span className="rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-400">
          New
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Create a link people can use to book time on your calendar.
      </p>
      <Button onClick={onCreate} Icon={Zap}>
        Create booking link
      </Button>
    </CardBasic>
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
    <CardBasic className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Booking link</h3>
            {!isActive ? (
              <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-muted-foreground/60" />
                Inactive
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Used by our AI to schedule appointments over email.
          </p>
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
    </CardBasic>
  );
}

function stripScheme(url: string) {
  return url.replace(/^https?:\/\//, "");
}
