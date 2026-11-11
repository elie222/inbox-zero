"use client";

import { useState, type ChangeEvent } from "react";
import { Trash2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useAction } from "next-safe-action/hooks";
import { Input, Label } from "@/components/Input";
import { Button } from "@/components/ui/button";
import {
  BookingLinkDialog,
  BookingLinkDialogFooter,
} from "./BookingLinkDialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError, toastSuccess } from "@/components/Toast";
import { useBookingLinks } from "@/hooks/useBookingLinks";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import {
  deleteBookingLinkAction,
  updateBookingLinkAction,
} from "@/utils/actions/booking";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import { cn } from "@/utils";
import { normalizeBookingSlug } from "@/utils/booking/slug";
import {
  DURATION_OPTIONS,
  getCalendarOptions,
  getDefaultDestinationCalendarId,
  getProviderVideoLocationType,
  getSelectedCalendarProvider,
  getVideoLocationLabel,
  isProviderVideoLocationType,
} from "./booking-calendar-helpers";
import { VideoConferencingItem } from "./VideoConferencingItem";

type BookingLink = NonNullable<
  ReturnType<typeof useBookingLinks>["data"]
>["bookingLinks"][number];
type ConfigureBookingLinkTab = "general" | "advanced";

export function ConfigureBookingLinkDialog({
  link,
  onClose,
  onSaved,
}: {
  link: BookingLink;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLingui();
  const [tab, setTab] = useState<ConfigureBookingLinkTab>("general");

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/^https?:\/\//, "")}/book/${link.slug}`
      : `/book/${link.slug}`;

  return (
    <BookingLinkDialog
      title={t`Configure booking link`}
      description={publicUrl}
      onClose={onClose}
      navigation={
        <div className="border-b px-6">
          <div className="flex gap-2">
            <TabButton
              active={tab === "general"}
              onClick={() => setTab("general")}
            >
              <Trans>General</Trans>
            </TabButton>
            <TabButton
              active={tab === "advanced"}
              onClick={() => setTab("advanced")}
            >
              <Trans>Advanced</Trans>
            </TabButton>
          </div>
        </div>
      }
    >
      {tab === "general" && <GeneralTab link={link} onSaved={onSaved} />}
      {tab === "advanced" && <AdvancedTab link={link} onSaved={onSaved} />}
    </BookingLinkDialog>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-3 text-sm font-medium transition-colors",
        active
          ? "border-blue-600 text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function GeneralTab({
  link,
  onSaved,
}: {
  link: BookingLink;
  onSaved: () => void;
}) {
  const { t, i18n } = useLingui();
  const { emailAccountId } = useAccount();
  const { data } = useBookingLinks();

  const [title, setTitle] = useState(link.title);
  const [slug, setSlug] = useState(link.slug);
  const [duration, setDuration] = useState<number>(link.durationMinutes);
  const [minimumNoticeHours, setMinimumNoticeHours] = useState(() =>
    formatHours(link.minimumNoticeMinutes / 60),
  );
  const defaultDestinationCalendarId = getDefaultDestinationCalendarId(data);
  const [destinationCalendarId, setDestinationCalendarId] = useState<string>(
    link.destinationCalendarId ?? defaultDestinationCalendarId,
  );
  const [videoEnabled, setVideoEnabled] = useState(() =>
    isProviderVideoLocationType(link.locationType),
  );
  const [description, setDescription] = useState<string>(
    link.description ?? "",
  );

  const selectedCalendarProvider = getSelectedCalendarProvider(
    data,
    destinationCalendarId,
  );
  const videoLocationType = getProviderVideoLocationType(
    selectedCalendarProvider,
  );
  const videoLabel = getVideoLocationLabel(videoLocationType);
  const canAddVideo = Boolean(videoLocationType);
  const calendarOptions = getCalendarOptions(data, i18n);

  const { executeAsync: updateLink, isExecuting: isSaving } = useAction(
    updateBookingLinkAction.bind(null, emailAccountId),
    {
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ??
            t`Failed to update booking link`,
        });
      },
    },
  );

  const publicUrlPrefix =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/^https?:\/\//, "")}/book/`
      : "/book/";

  const handleSave = async () => {
    const minimumNoticeMinutes = parseMinimumNoticeHours(minimumNoticeHours);
    if (minimumNoticeMinutes === null) {
      toastError({
        description: t`Minimum notice must be 0 hours or more.`,
      });
      return;
    }

    try {
      const nextLocationType =
        videoEnabled && videoLocationType
          ? videoLocationType
          : isProviderVideoLocationType(link.locationType)
            ? BookingLinkLocationType.CUSTOM
            : link.locationType;
      const nextLocationValue = isProviderVideoLocationType(nextLocationType)
        ? null
        : link.locationValue;

      const result = await updateLink({
        id: link.id,
        slug,
        title,
        description,
        durationMinutes: duration,
        minimumNoticeMinutes,
        locationType: nextLocationType,
        locationValue: nextLocationValue,
        destinationCalendarId,
      });
      if (hasActionResultError(result)) return;

      toastSuccess({ description: t`Booking link updated` });
      onSaved();
    } catch (error) {
      toastError({
        description:
          error instanceof Error
            ? error.message
            : t`Failed to update booking link`,
      });
    }
  };

  return (
    <>
      <div className="space-y-5 px-6 py-5">
        <Input
          type="text"
          name="title"
          label={t`What guests see`}
          placeholder={t`15 min intro`}
          registerProps={{
            value: title,
            onChange: (event: ChangeEvent<HTMLInputElement>) =>
              setTitle(event.target.value),
          }}
        />

        <Input
          type="text"
          name="slug"
          label={t`Link URL`}
          leftText={publicUrlPrefix}
          placeholder="elie"
          registerProps={{
            value: slug,
            onChange: (event: ChangeEvent<HTMLInputElement>) =>
              setSlug(normalizeBookingSlug(event.target.value)),
          }}
        />

        <div>
          <Label name="duration" label={t`Duration`} />
          <div className="mt-1 grid grid-cols-4 gap-2">
            {DURATION_OPTIONS.map((option) => {
              const active = option === duration;
              return (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  onClick={() => setDuration(option)}
                  className={cn(
                    "w-full",
                    active && "border-primary ring-1 ring-primary",
                  )}
                >
                  {t`${option} min`}
                </Button>
              );
            })}
          </div>
        </div>

        <Item variant="outline">
          <ItemContent>
            <ItemTitle>
              <Trans>Minimum notice</Trans>
            </ItemTitle>
            <ItemDescription>
              <Trans>Block new bookings this many hours into the future.</Trans>
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Input
              type="number"
              name="minimumNoticeHours"
              min={0}
              max={365 * 24}
              step={0.25}
              rightText={t`hours`}
              className="w-24 tabular-nums"
              registerProps={{
                value: minimumNoticeHours,
                onChange: (event: ChangeEvent<HTMLInputElement>) =>
                  setMinimumNoticeHours(event.target.value),
              }}
            />
          </ItemActions>
        </Item>

        <div>
          <Label name="destinationCalendarId" label={t`Add events to`} />
          <Select
            name="destinationCalendarId"
            value={destinationCalendarId}
            onValueChange={setDestinationCalendarId}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {calendarOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <VideoConferencingItem
          canAddVideo={canAddVideo}
          videoEnabled={videoEnabled}
          videoLabel={videoLabel}
          onChange={setVideoEnabled}
        />

        <Input
          type="text"
          autosizeTextarea
          rows={3}
          name="description"
          label={t`Description (optional)`}
          placeholder={t`Tell guests what to expect.`}
          registerProps={{
            value: description,
            onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
              setDescription(event.target.value),
          }}
        />
      </div>

      <DialogFooter onSaved={onSaved} onSave={handleSave} loading={isSaving} />
    </>
  );
}

function AdvancedTab({
  link,
  onSaved,
}: {
  link: BookingLink;
  onSaved: () => void;
}) {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const { executeAsync: deleteLink, isExecuting: isDeleting } = useAction(
    deleteBookingLinkAction.bind(null, emailAccountId),
    {
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ??
            t`Failed to delete booking link`,
        });
      },
    },
  );

  const handleDelete = async () => {
    const confirmed = window.confirm(
      t`Delete this booking link permanently? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      const result = await deleteLink({ id: link.id });
      if (hasActionResultError(result)) return;

      toastSuccess({ description: t`Booking link deleted` });
      onSaved();
    } catch (error) {
      toastError({
        description:
          error instanceof Error
            ? error.message
            : t`Failed to delete booking link`,
      });
    }
  };

  return (
    <>
      <div className="space-y-4 overflow-y-auto px-6 py-5">
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>
              <Trans>Delete booking link</Trans>
            </ItemTitle>
            <ItemDescription>
              <Trans>
                Permanently remove this booking link and its booking history.
              </Trans>
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="destructiveSoft"
              onClick={handleDelete}
              loading={isDeleting}
              Icon={Trash2}
            >
              <Trans>Delete</Trans>
            </Button>
          </ItemActions>
        </Item>
      </div>

      <BookingLinkDialogFooter>
        <Button variant="outline" onClick={onSaved}>
          <Trans>Close</Trans>
        </Button>
      </BookingLinkDialogFooter>
    </>
  );
}
function DialogFooter({
  onSaved,
  onSave,
  loading,
}: {
  onSaved: () => void;
  onSave: () => void;
  loading: boolean;
}) {
  return (
    <BookingLinkDialogFooter>
      <Button variant="outline" onClick={onSaved}>
        <Trans>Cancel</Trans>
      </Button>
      <Button onClick={onSave} loading={loading}>
        <Trans>Save</Trans>
      </Button>
    </BookingLinkDialogFooter>
  );
}

function parseMinimumNoticeHours(value: string) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0 || hours > 365 * 24) return null;
  return Math.round(hours * 60);
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : String(value.toFixed(2));
}

function hasActionResultError(
  result:
    | {
        serverError?: string;
        validationErrors?: unknown;
      }
    | undefined,
) {
  return Boolean(result?.serverError || result?.validationErrors);
}
