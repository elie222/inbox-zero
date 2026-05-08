"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MessageCircleIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { CopyInput } from "@/components/CopyInput";
import { SlackNotificationTargetSelect } from "@/components/SlackNotificationTargetSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toastSuccess, toastError, toastInfo } from "@/components/Toast";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import {
  createMessagingLinkCodeAction,
  disconnectChannelAction,
  linkSlackWorkspaceAction,
} from "@/utils/actions/messaging-channels";
import { fetchWithAccount } from "@/utils/fetch";
import { captureException } from "@/utils/error";
import { getActionErrorMessage } from "@/utils/error";
import { redirectToSafeUrl } from "@/utils/redirect";
import type { GetSlackAuthUrlResponse } from "@/app/api/slack/auth-url/route";
import {
  type MessagingProvider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";

type LinkableMessagingProvider = "TEAMS" | "TELEGRAM";

const PROVIDER_CONFIG: Partial<
  Record<MessagingProvider, { name: string; icon: typeof MessageSquareIcon }>
> = {
  SLACK: { name: "Slack", icon: MessagesSquareIcon },
  TEAMS: { name: "Teams", icon: MessageCircleIcon },
  TELEGRAM: { name: "Telegram", icon: SendIcon },
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
  const [linkCodeDialog, setLinkCodeDialog] = useState<{
    provider: LinkableMessagingProvider;
    code: string;
    botUrl?: string | null;
  } | null>(null);

  const connectedChannels =
    channelsData?.channels.filter((channel) => channel.isConnected) ?? [];
  const hasSlack = connectedChannels.some(
    (channel) => channel.provider === "SLACK",
  );
  const hasTeams = connectedChannels.some(
    (channel) => channel.provider === "TEAMS",
  );
  const hasTelegram = connectedChannels.some(
    (channel) => channel.provider === "TELEGRAM",
  );
  const slackAvailable =
    channelsData?.availableProviders?.includes("SLACK") ?? false;
  const teamsAvailable =
    channelsData?.availableProviders?.includes("TEAMS") ?? false;
  const telegramAvailable =
    channelsData?.availableProviders?.includes("TELEGRAM") ?? false;

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
          redirectToSafeUrl(authUrl, { allowExternal: true });
        } else {
          toastError({ description: msg ?? "Failed to link Slack" });
        }
      },
    },
  );

  const { execute: executeCreateLinkCode, status: linkCodeStatus } = useAction(
    createMessagingLinkCodeAction.bind(null, emailAccountId),
    {
      onSuccess: ({ data }) => {
        if (!data?.code || !data.provider) return;
        setLinkCodeDialog({
          provider: data.provider,
          code: data.code,
          botUrl: data.botUrl || null,
        });
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? "Failed to generate code",
        });
      },
    },
  );

  if (
    !isLoading &&
    !slackAvailable &&
    !teamsAvailable &&
    !telegramAvailable &&
    connectedChannels.length === 0
  )
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
        redirectToSafeUrl(data.url, { allowExternal: true });
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

  const handleCreateLinkCode = (provider: LinkableMessagingProvider) => {
    executeCreateLinkCode({ provider });
  };

  return (
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Connected Apps</ItemTitle>
        </ItemContent>
        <ItemActions>
          <div className="flex items-center gap-2">
            {!hasSlack &&
              slackAvailable &&
              (existingWorkspace ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={linkStatus === "executing"}
                    onClick={handleLinkSlack}
                  >
                    <MessagesSquareIcon className="mr-2 h-4 w-4" />
                    {linkStatus === "executing"
                      ? "Linking..."
                      : `Link to ${existingWorkspace.teamName}`}
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-4"
                    onClick={() => {
                      if (authUrl) {
                        redirectToSafeUrl(authUrl, { allowExternal: true });
                      }
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
                  <MessagesSquareIcon className="mr-2 h-4 w-4" />
                  {connectingSlack ? "Connecting..." : "Connect Slack"}
                </Button>
              ))}

            {!hasTeams && teamsAvailable && (
              <Button
                variant="outline"
                size="sm"
                disabled={linkCodeStatus === "executing"}
                onClick={() => handleCreateLinkCode("TEAMS")}
              >
                <MessageCircleIcon className="mr-2 h-4 w-4" />
                Connect Teams
              </Button>
            )}

            {!hasTelegram && telegramAvailable && (
              <Button
                variant="outline"
                size="sm"
                disabled={linkCodeStatus === "executing"}
                onClick={() => handleCreateLinkCode("TELEGRAM")}
              >
                <SendIcon className="mr-2 h-4 w-4" />
                Connect Telegram
              </Button>
            )}
          </div>
        </ItemActions>
      </Item>
      <LoadingContent loading={isLoading} error={error} loadingComponent={null}>
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
      <MessagingConnectCodeDialog
        open={Boolean(linkCodeDialog)}
        provider={linkCodeDialog?.provider ?? null}
        code={linkCodeDialog?.code ?? null}
        botUrl={linkCodeDialog?.botUrl ?? null}
        onOpenChange={(open) => {
          if (!open) setLinkCodeDialog(null);
        }}
      />
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
    canSendAsDm: boolean;
    destinations: {
      ruleNotifications: {
        targetId: string | null;
        targetLabel: string | null;
        isDm: boolean;
      };
    };
  };
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const config = PROVIDER_CONFIG[channel.provider];
  const Icon = config?.icon ?? MessageSquareIcon;
  const isSlackChannel = channel.provider === "SLACK";

  const { execute: executeDisconnect, status: disconnectStatus } = useAction(
    disconnectChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: `${config?.name ?? channel.provider} disconnected`,
        });
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

  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span>
          {config?.name ?? channel.provider}
          {channel.teamName && (
            <span className="text-muted-foreground">
              {" "}
              &middot; {channel.teamName}
            </span>
          )}
        </span>

        {isSlackChannel && (
          <SlackNotificationTargetSelect
            emailAccountId={emailAccountId}
            messagingChannelId={channel.id}
            purpose={MessagingRoutePurpose.RULE_NOTIFICATIONS}
            targetId={channel.destinations.ruleNotifications.targetId}
            targetLabel={channel.destinations.ruleNotifications.targetLabel}
            isDm={channel.destinations.ruleNotifications.isDm}
            canSendAsDm={channel.canSendAsDm}
            onUpdate={onUpdate}
            className="h-7 w-auto gap-1 border-none bg-transparent px-1.5 text-xs text-muted-foreground shadow-none hover:bg-muted"
          />
        )}
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 hover:bg-destructive/10 hover:text-destructive"
              disabled={disconnectStatus === "executing"}
              onClick={() => executeDisconnect({ channelId: channel.id })}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Disconnect</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function MessagingConnectCodeDialog({
  open,
  provider,
  code,
  botUrl,
  onOpenChange,
}: {
  open: boolean;
  provider: LinkableMessagingProvider | null;
  code: string | null;
  botUrl?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!provider || !code) return null;

  const providerName = getProviderDisplayName(provider);
  const command = `/connect ${code}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {providerName}</DialogTitle>
          <DialogDescription>
            Send this command in a direct message with the Inbox Zero bot on{" "}
            {providerName}. The code is one-time use and expires in 10 minutes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Command</div>
          <CopyInput value={command} />
        </div>
        {provider === "TELEGRAM" && botUrl && (
          <div className="pt-1">
            <Button asChild size="sm">
              <a href={botUrl} target="_blank" rel="noopener noreferrer">
                Open Telegram bot
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getProviderDisplayName(provider: LinkableMessagingProvider): string {
  if (provider === "TEAMS") return "Teams";
  return "Telegram";
}

export function useSlackNotifications({
  enabled,
  onSlackConnected,
}: {
  enabled: boolean;
  onSlackConnected?: (emailAccountId: string | null) => void;
}) {
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
      onSlackConnected?.(searchParams.get("slack_email_account_id"));
      toastSuccess({
        title: "Slack connected",
        description:
          "Next, choose a private channel in Connected Apps for meeting brief and attachment notifications.",
      });
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
        key !== "error_detail" &&
        key !== "slack_email_account_id"
      ) {
        preserved.set(key, value);
      }
    }
    const qs = preserved.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [enabled, onSlackConnected, pathname, router, searchParams]);
}

function getSlackConnectionFailedDescription(
  errorReason: string | null,
): string {
  if (errorReason === "oauth_invalid_team_for_non_distributed_app") {
    return "This Slack app is not distributed to every workspace yet. Use the currently supported workspace or contact support.";
  }

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
  if (normalized.includes("invalid_team_for_non_distributed_app")) {
    return "oauth_invalid_team_for_non_distributed_app";
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
