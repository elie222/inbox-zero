"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HashIcon, MessageSquareIcon, XIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import { MutedText } from "@/components/Typography";
import { toastSuccess, toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { disconnectChannelAction } from "@/utils/actions/messaging-channels";
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

export function ConnectedAppsSection() {
  useSlackNotifications();

  const { emailAccountId } = useAccount();
  const {
    data: channelsData,
    isLoading,
    error,
    mutate: mutateChannels,
  } = useMessagingChannels();
  const [connectingSlack, setConnectingSlack] = useState(false);

  const connectedChannels =
    channelsData?.channels.filter((c) => c.isConnected) ?? [];
  const hasSlack = connectedChannels.some((c) => c.provider === "SLACK");

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

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h3 className="font-medium">Connected Apps</h3>
            <MutedText>Manage connected messaging services</MutedText>
          </div>
          {!hasSlack && (
            <Button
              variant="outline"
              size="sm"
              disabled={connectingSlack}
              onClick={handleConnectSlack}
            >
              <MessageSquareIcon className="mr-2 h-4 w-4" />
              {connectingSlack ? "Connecting..." : "Connect Slack"}
            </Button>
          )}
        </div>

        {connectedChannels.length > 0 && (
          <div className="mt-4 space-y-3">
            <LoadingContent loading={isLoading} error={error}>
              {connectedChannels.map((channel) => (
                <ConnectedChannelRow
                  key={channel.id}
                  channel={channel}
                  emailAccountId={emailAccountId}
                  onUpdate={mutateChannels}
                />
              ))}
            </LoadingContent>
          </div>
        )}
      </CardContent>
    </Card>
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
  };
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const config = PROVIDER_CONFIG[channel.provider];
  const Icon = config?.icon ?? MessageSquareIcon;

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

  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <div className="flex-1">
        <div className="font-medium text-sm">
          {config?.name ?? channel.provider}
          {channel.teamName && (
            <span className="text-muted-foreground font-normal">
              {" "}
              &middot; {channel.teamName}
            </span>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={disconnectStatus === "executing"}
        onClick={() => executeDisconnect({ channelId: channel.id })}
      >
        <XIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}

function useSlackNotifications() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    const message = searchParams.get("message");
    const error = searchParams.get("error");

    if (!message && !error) return;

    handled.current = true;

    if (message === "slack_connected") {
      toastSuccess({ description: "Slack connected" });
    }

    if (error === "connection_failed") {
      toastError({
        title: "Slack connection failed",
        description:
          "We couldn't complete the Slack connection. Please try again.",
      });
    }

    const preserved = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      if (key !== "message" && key !== "error") {
        preserved.set(key, value);
      }
    }
    const qs = preserved.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);
}
