"use client";

import { useCallback, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import Link from "next/link";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useAction } from "next-safe-action/hooks";
import { HashIcon, MailIcon } from "lucide-react";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { LoadingContent } from "@/components/LoadingContent";
import { SlackNotificationTargetSelect } from "@/components/SlackNotificationTargetSelect";
import { Toggle } from "@/components/Toggle";
import { MutedText } from "@/components/Typography";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { DriveConnections } from "./DriveConnections";
import { FilingPreferences } from "./FilingPreferences";
import { FilingActivity } from "./FilingActivity";
import { DriveOnboarding } from "./DriveOnboarding";
import { DriveSetup } from "./DriveSetup";
import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import {
  updateFilingConfirmationEmailAction,
  updateFilingEnabledAction,
} from "@/utils/actions/drive";
import { updateMessagingFeatureRouteAction } from "@/utils/actions/messaging-channels";
import { getActionErrorMessage } from "@/utils/error";
import {
  canEnableMessagingFeatureRoute,
  getMessagingFeatureRouteSummary,
  type MessagingChannelDestinations,
} from "@/utils/messaging/routes";
import { prefixPath } from "@/utils/path";
import { toastError, toastSuccess } from "@/components/Toast";
import { cn } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { getMessagingProviderName } from "@/utils/messaging/platforms";
import {
  MessagingProvider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";

type DriveView = "onboarding" | "setup" | "settings";

export default function DrivePage() {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useDriveConnections();
  const {
    data: emailAccount,
    isLoading: emailLoading,
    error: emailError,
    mutate: mutateEmail,
  } = useEmailAccountFull();
  const [forceOnboarding] = useQueryState("onboarding", parseAsBoolean);
  const [forceSetup] = useQueryState("setup", parseAsBoolean);

  const hasConnections = (data?.connections?.length ?? 0) > 0;
  const filingEnabled = emailAccount?.filingEnabled ?? false;
  const [isSaving, setIsSaving] = useState(false);

  const view = getDriveView(
    hasConnections,
    filingEnabled,
    forceOnboarding,
    forceSetup,
  );

  const handleToggle = useCallback(
    async (checked: boolean) => {
      setIsSaving(true);

      try {
        const result = await updateFilingEnabledAction(emailAccountId, {
          filingEnabled: checked,
        });

        if (result?.serverError) {
          toastError({
            title: t`Error saving preferences`,
            description: result.serverError,
          });
        } else {
          toastSuccess({ description: t`Preferences saved` });
          mutateEmail();
        }
      } finally {
        setIsSaving(false);
      }
    },
    [emailAccountId, mutateEmail, t],
  );

  return (
    <PageWrapper>
      <LoadingContent
        loading={isLoading || emailLoading}
        error={error || emailError}
      >
        {view === "onboarding" && <DriveOnboarding />}
        {view === "setup" && <DriveSetup />}
        {view === "settings" && (
          <>
            <div className="flex items-center justify-between">
              <PageHeader title={t`Auto-file attachments`} />
              <div className="flex items-center gap-3">
                <DeliveryPopover
                  emailAccountId={emailAccountId}
                  filingConfirmationSendEmail={
                    emailAccount?.filingConfirmationSendEmail ?? true
                  }
                  onEmailDeliveryUpdated={mutateEmail}
                />
                {!filingEnabled && (
                  <Badge variant="destructive">
                    <Trans>Paused</Trans>
                  </Badge>
                )}
                <Switch
                  checked={filingEnabled}
                  onCheckedChange={handleToggle}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div
              className={cn(
                "mt-6 space-y-4 transition-opacity duration-200",
                !filingEnabled && "opacity-50 pointer-events-none",
              )}
            >
              <DriveConnections />
              <FilingPreferences />
              <FilingActivity />
            </div>
          </>
        )}
      </LoadingContent>
    </PageWrapper>
  );
}

function getDriveView(
  hasConnections: boolean,
  filingEnabled: boolean,
  forceOnboarding: boolean | null,
  forceSetup: boolean | null,
): DriveView {
  if (forceOnboarding === true || !hasConnections) return "onboarding";
  if (forceSetup === true || (hasConnections && !filingEnabled)) return "setup";
  return "settings";
}

function DeliveryPopover({
  emailAccountId,
  filingConfirmationSendEmail,
  onEmailDeliveryUpdated,
}: {
  emailAccountId: string;
  filingConfirmationSendEmail: boolean;
  onEmailDeliveryUpdated: () => Promise<unknown>;
}) {
  const { t } = useLingui();
  const { data, isLoading, mutate } = useMessagingChannels();
  const {
    execute: executeEmailDelivery,
    isExecuting: isUpdatingEmailDelivery,
  } = useAction(
    updateFilingConfirmationEmailAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: t`Settings saved` });
        onEmailDeliveryUpdated();
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? t`Failed to update`,
        });
      },
    },
  );

  const allConnected =
    data?.channels.filter((channel) => channel.isConnected) ?? [];
  const configurableChannels = allConnected.filter(
    (channel) =>
      channel.provider === MessagingProvider.SLACK ||
      channel.destinations.ruleNotifications.enabled ||
      channel.destinations.documentFilings.enabled,
  );
  const availableProviders = data?.availableProviders ?? [];
  const slackAvailable = availableProviders.includes("SLACK");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Trans>Delivery</Trans>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium">
              <Trans>Delivery</Trans>
            </h4>
            <MutedText className="text-xs">
              <Trans>Choose how filing updates should reach you</Trans>
            </MutedText>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MailIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  <Trans>Email confirmations</Trans>
                </span>
              </div>
              <Toggle
                name="filing-email-delivery"
                enabled={filingConfirmationSendEmail}
                disabled={isUpdatingEmailDelivery}
                onChange={(sendEmail) => executeEmailDelivery({ sendEmail })}
              />
            </div>
            <MutedText className="text-xs">
              <Trans>
                Questions that need your input still arrive by email.
              </Trans>
            </MutedText>
          </div>

          {!isLoading &&
            (configurableChannels.length > 0 || slackAvailable) && (
              <div className="space-y-2 border-t pt-3">
                <MutedText className="text-xs">
                  <Trans>Connected apps</Trans>
                </MutedText>
                {configurableChannels.length > 0 ? (
                  <div className="space-y-2">
                    {configurableChannels.map((channel) => (
                      <DeliveryChannelRow
                        key={channel.id}
                        channel={channel}
                        emailAccountId={emailAccountId}
                        onUpdate={mutate}
                      />
                    ))}
                  </div>
                ) : (
                  <MutedText className="text-xs">
                    <Trans>
                      Select a destination in{" "}
                      <Link
                        href={prefixPath(emailAccountId, "/channels")}
                        className="underline text-foreground"
                      >
                        Channels
                      </Link>{" "}
                      to enable app notifications.
                    </Trans>
                  </MutedText>
                )}
              </div>
            )}

          {isLoading && (
            <MutedText className="text-xs">
              <Trans>Loading connected apps...</Trans>
            </MutedText>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DeliveryChannelRow({
  channel,
  emailAccountId,
  onUpdate,
}: {
  channel: {
    id: string;
    provider: MessagingProvider;
    destinations: MessagingChannelDestinations;
    canSendAsDm: boolean;
  };
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const { t } = useLingui();
  const destination = getMessagingFeatureRouteSummary(
    channel.destinations,
    MessagingRoutePurpose.DOCUMENT_FILINGS,
  );
  const canEnableFeatureRoute = canEnableMessagingFeatureRoute(
    channel.destinations,
    MessagingRoutePurpose.DOCUMENT_FILINGS,
  );
  const { execute } = useAction(
    updateMessagingFeatureRouteAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: t`Settings saved` });
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? t`Failed to update`,
        });
      },
    },
  );

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <HashIcon className="h-4 w-4 text-muted-foreground" />
        <div className="space-y-1">
          <span className="text-sm">
            {getMessagingProviderName(channel.provider)}
          </span>
          {channel.provider === MessagingProvider.SLACK ? (
            <SlackNotificationTargetSelect
              emailAccountId={emailAccountId}
              messagingChannelId={channel.id}
              purpose={MessagingRoutePurpose.DOCUMENT_FILINGS}
              targetId={destination.targetId}
              targetLabel={destination.targetLabel}
              isDm={destination.isDm}
              canSendAsDm={channel.canSendAsDm}
              onUpdate={onUpdate}
              placeholder={t`Select destination`}
              className="h-8 w-44 text-xs"
            />
          ) : (
            <MutedText className="text-xs">
              <Trans>
                Filing updates use this connected app&apos;s direct message
                destination.
              </Trans>
            </MutedText>
          )}
        </div>
      </div>
      <Toggle
        name={`filing-${channel.id}`}
        enabled={destination.enabled}
        disabled={!canEnableFeatureRoute}
        onChange={(enabled) => {
          if (!canEnableFeatureRoute) return;
          execute({
            channelId: channel.id,
            purpose: MessagingRoutePurpose.DOCUMENT_FILINGS,
            enabled,
          });
        }}
      />
    </div>
  );
}
