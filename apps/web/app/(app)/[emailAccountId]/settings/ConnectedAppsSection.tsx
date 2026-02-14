"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  HashIcon,
  LockIcon,
  MessageSquareIcon,
  SlackIcon,
  XIcon,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { toastSuccess, toastError, toastInfo } from "@/components/Toast";
import {
  useChannelTargets,
  useMessagingChannels,
} from "@/hooks/useMessagingChannels";
import {
  disconnectChannelAction,
  linkSlackWorkspaceAction,
  updateSlackChannelAction,
} from "@/utils/actions/messaging-channels";
import { fetchWithAccount } from "@/utils/fetch";
import { captureException } from "@/utils/error";
import { getActionErrorMessage } from "@/utils/error";
import type { GetSlackAuthUrlResponse } from "@/app/api/slack/auth-url/route";
import type { MessagingProvider } from "@/generated/prisma/enums";

const PROVIDER_CONFIG: Record<
  MessagingProvider,
  { name: string; icon: typeof MessageSquareIcon }
> = {
  SLACK: { name: "Slack", icon: HashIcon },
};

export function ConnectedAppsSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {

  const {
    data: channelsData,
    isLoading,
    error,
    mutate: mutateChannels,
  } = useMessagingChannels(emailAccountId);
  const [connectingSlack, setConnectingSlack] = useState(false);
  const [existingWorkspace, setExistingWorkspace] = useState<{
    teamId: string;
    teamName: string;
  } | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  const connectedChannels =
    channelsData?.channels.filter((channel) => channel.isConnected) ?? [];
  const hasSlack = connectedChannels.some(
    (channel) => channel.provider === "SLACK",
  );
  const slackAvailable =
    channelsData?.availableProviders?.includes("SLACK") ?? false;

  const { execute: executeLinkSlack, status: linkStatus } = useAction(
    linkSlackWorkspaceAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Slack connected" });
        setExistingWorkspace(null);
        setAuthUrl(null);
        mutateChannels();
      },
      onError: (error) => {
        const msg = getActionErrorMessage(error.error);
        if (msg?.includes("Could not find your Slack account") && authUrl) {
          toastInfo({
            title: "Email not found in Slack",
            description: "Redirecting to Slack authorization...",
          });
          window.location.href = authUrl;
        } else {
          toastError({ description: msg ?? "Failed to link Slack" });
        }
      },
    },
  );

  if (!isLoading && !slackAvailable && connectedChannels.length === 0)
    return null;

  const handleConnectSlack = async () => {
    setConnectingSlack(true);
    try {
      const res = await fetchWithAccount({
        url: "/api/slack/auth-url",
        emailAccountId,
      });
      if (!res.ok) {
        throw new Error("Failed to get Slack auth URL");
      }
      const data: GetSlackAuthUrlResponse = await res.json();

      if (data.existingWorkspace) {
        setExistingWorkspace(data.existingWorkspace);
        setAuthUrl(data.url);
        setConnectingSlack(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No auth URL returned");
      }
    } catch (error) {
      captureException(error, {
        extra: { context: "Slack OAuth initiation" },
      });
      toastError({ description: "Failed to connect Slack" });
      setConnectingSlack(false);
    }
  };

  const handleLinkSlack = () => {
    if (!existingWorkspace) return;
    executeLinkSlack({ teamId: existingWorkspace.teamId });
  };

  return (
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Connected Apps</ItemTitle>
        </ItemContent>
        <ItemActions>
          {!hasSlack && slackAvailable ? (
            existingWorkspace ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={linkStatus === "executing"}
                  onClick={handleLinkSlack}
                >
                  <SlackIcon className="mr-2 h-4 w-4" />
                  {linkStatus === "executing"
                    ? "Linking..."
                    : `Link to ${existingWorkspace.teamName}`}
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-4"
                  onClick={() => {
                    if (authUrl) window.location.href = authUrl;
                  }}
                >
                  Install manually
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={connectingSlack || isLoading}
                onClick={handleConnectSlack}
              >
                <SlackIcon className="mr-2 h-4 w-4" />
                {connectingSlack ? "Connecting..." : "Connect Slack"}
              </Button>
            )
          ) : null}
        </ItemActions>
      </Item>
      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={null}
      >
        {connectedChannels.length > 0 && (
          <div className="space-y-2 px-4 pb-3">
            {connectedChannels.map((channel) => (
              <ConnectedChannelRow
                key={channel.id}
                channel={channel}
                emailAccountId={emailAccountId}
                onUpdate={mutateChannels}
              />
            ))}
          </div>
        )}
      </LoadingContent>
    </>
  );
}

function ConnectedChannelRow({
  channel,
  emailAccountId,
  onUpdate,
}: {
  channel: {
    id: string;
    provider: MessagingProvider;
    teamName: string | null;
    channelId: string | null;
    channelName: string | null;
  };
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const config = PROVIDER_CONFIG[channel.provider];
  const Icon = config?.icon ?? MessageSquareIcon;
  const [selectingTarget, setSelectingTarget] = useState(!channel.channelId);

  useEffect(() => {
    setSelectingTarget(!channel.channelId);
  }, [channel.channelId]);

  const selectingSlackTarget = channel.provider === "SLACK" && selectingTarget;
  const {
    data: targetsData,
    isLoading: isLoadingTargets,
    error: targetsError,
    mutate: mutateTargets,
  } = useChannelTargets(selectingSlackTarget ? channel.id : null);
  const privateTargets =
    targetsData?.targets.filter((target) => target.isPrivate) ?? [];
  const hasTargetLoadError = Boolean(targetsError || targetsData?.error);
  const selectionState = getSlackChannelSelectionState({
    channelId: channel.channelId,
    selectingTarget,
    isLoadingTargets,
    hasTargetLoadError,
  });

  const { execute: executeDisconnect, status: disconnectStatus } = useAction(
    disconnectChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Slack disconnected" });
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? "Failed to disconnect",
        });
      },
    },
  );

  const { execute: executeSetTarget, status: setTargetStatus } = useAction(
    updateSlackChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Slack channel updated" });
        setSelectingTarget(false);
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? "Failed to update channel",
        });
      },
    },
  );

  return (
    <div className="flex items-start justify-between rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-start gap-2 text-sm">
        <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="space-y-1">
          <div>
            {config?.name ?? channel.provider}
            {channel.teamName && (
              <span className="text-muted-foreground">
                {" "}
                &middot; {channel.teamName}
              </span>
            )}
          </div>

          {channel.provider === "SLACK" && (
            <div className="space-y-1">
              {selectionState.showCurrentChannel ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-4"
                  onClick={() => setSelectingTarget(true)}
                >
                  #{channel.channelName || channel.channelId}
                </button>
              ) : (
                <Select
                  onValueChange={(value) => {
                    const target = privateTargets?.find((t) => t.id === value);
                    if (!target) return;

                    executeSetTarget({
                      channelId: channel.id,
                      targetId: target.id,
                      targetName: target.name,
                    });
                  }}
                  disabled={
                    isLoadingTargets ||
                    hasTargetLoadError ||
                    setTargetStatus === "executing"
                  }
                >
                  <SelectTrigger className="h-8 w-52 text-xs">
                    <SelectValue
                      placeholder={
                        hasTargetLoadError
                          ? "Failed to load channels"
                          : isLoadingTargets
                            ? "Loading channels..."
                            : "Select private channel"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {privateTargets?.map((target) => (
                      <SelectItem key={target.id} value={target.id}>
                        <LockIcon className="mr-1 inline h-3 w-3" />
                        {target.name}
                      </SelectItem>
                    ))}
                    {!isLoadingTargets && privateTargets.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No private channels found
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}

              {selectionState.showInviteHint && (
                <div className="text-xs text-muted-foreground">
                  Invite the bot with{" "}
                  <code className="rounded bg-muted px-1">/invite @InboxZero</code>{" "}
                  in a private channel.
                </div>
              )}

              {(selectionState.showErrorHint ||
                selectionState.showCancelSelection) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {selectionState.showErrorHint && (
                    <>
                      <span>Unable to load Slack channels.</span>
                      <button
                        type="button"
                        className="underline underline-offset-4"
                        onClick={() => mutateTargets()}
                      >
                        Retry
                      </button>
                    </>
                  )}
                  {selectionState.showCancelSelection && (
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      onClick={() => setSelectingTarget(false)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={disconnectStatus === "executing"}
        onClick={() => executeDisconnect({ channelId: channel.id })}
      >
        <XIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function useSlackNotifications(enabled: boolean) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const handled = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (handled.current) return;

    const message = searchParams.get("message");
    const error = searchParams.get("error");
    const errorReason = searchParams.get("error_reason");
    const errorDetail = searchParams.get("error_detail");
    const resolvedReason = resolveSlackErrorReason(errorReason, errorDetail);

    if (!message && !error && !errorReason && !errorDetail) return;

    handled.current = true;

    if (message === "slack_connected") {
      toastSuccess({ description: "Slack connected" });
    }
    if (message === "processing") {
      toastInfo({
        title: "Slack connection in progress",
        description:
          "Slack is still finalizing your connection. Please refresh in a moment.",
      });
    }

    if (error === "connection_failed" || errorDetail) {
      toastError({
        title: "Slack connection failed",
        description: getSlackConnectionFailedDescription(resolvedReason),
      });
    }

    const preserved = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      if (
        key !== "message" &&
        key !== "error" &&
        key !== "error_reason" &&
        key !== "error_detail"
      ) {
        preserved.set(key, value);
      }
    }
    const qs = preserved.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [enabled, pathname, router, searchParams]);
}

function getSlackConnectionFailedDescription(
  errorReason: string | null,
): string {
  if (errorReason === "oauth_invalid_code") {
    return "Slack returned an invalid or expired code. Please try connecting again.";
  }

  if (
    errorReason === "missing_code" ||
    errorReason === "missing_state" ||
    errorReason === "invalid_state" ||
    errorReason === "invalid_state_format"
  ) {
    return "Slack session validation failed. Please try connecting again.";
  }

  return "We couldn't complete the Slack connection. Please try again.";
}

function resolveSlackErrorReason(
  errorReason: string | null,
  errorDetail: string | null,
): string | null {
  if (errorReason) return errorReason;
  if (!errorDetail) return null;

  const normalized = errorDetail.toLowerCase();

  if (normalized.includes("invalid_code")) {
    return "oauth_invalid_code";
  }
  if (normalized.includes("invalid_state_format")) {
    return "invalid_state_format";
  }
  if (normalized.includes("invalid_state")) {
    return "invalid_state";
  }
  if (normalized.includes("missing_state")) {
    return "missing_state";
  }
  if (normalized.includes("missing_code")) {
    return "missing_code";
  }

  return null;
}

export function getSlackChannelSelectionState({
  channelId,
  selectingTarget,
  isLoadingTargets,
  hasTargetLoadError,
}: {
  channelId: string | null;
  selectingTarget: boolean;
  isLoadingTargets: boolean;
  hasTargetLoadError: boolean;
}) {
  const showChannelSelector = !channelId || selectingTarget;

  return {
    showChannelSelector,
    showCurrentChannel: !showChannelSelector,
    showInviteHint:
      showChannelSelector && !isLoadingTargets && !hasTargetLoadError,
    showErrorHint: showChannelSelector && hasTargetLoadError,
    showCancelSelection: Boolean(channelId && selectingTarget),
  };
}
