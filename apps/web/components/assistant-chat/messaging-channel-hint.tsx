"use client";

import { useState } from "react";
import { SlackIcon, XIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/useUser";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { useAccount } from "@/providers/EmailAccountProvider";
import { dismissHintAction } from "@/utils/actions/hints";
import { fetchWithAccount } from "@/utils/fetch";
import { captureException } from "@/utils/error";
import { toastError } from "@/components/Toast";
import type { GetSlackAuthUrlResponse } from "@/app/api/slack/auth-url/route";

const HINT_ID = "messaging-channel";

export function MessagingChannelHint() {
  const { emailAccountId } = useAccount();
  const { data: user, mutate: mutateUser } = useUser();
  const { data: channelsData, isLoading: channelsLoading } =
    useMessagingChannels();
  const [connecting, setConnecting] = useState(false);

  const { execute: dismiss } = useAction(dismissHintAction, {
    onSuccess: () => mutateUser(),
  });

  if (!user || channelsLoading) return null;

  const isDismissed = user.dismissedHints?.includes(HINT_ID);
  if (isDismissed) return null;

  const hasSlack = channelsData?.channels.some(
    (channel) => channel.isConnected && channel.provider === "SLACK",
  );
  const slackAvailable =
    channelsData?.availableProviders?.includes("SLACK") ?? false;

  if (hasSlack || !slackAvailable) return null;

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetchWithAccount({
        url: "/api/slack/auth-url",
        emailAccountId,
      });
      if (!res.ok) throw new Error("Failed to get Slack auth URL");

      const data: GetSlackAuthUrlResponse = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      } else {
        throw new Error("No auth URL returned");
      }
    } catch (error) {
      captureException(error, {
        extra: { context: "Slack OAuth from chat hint" },
      });
      toastError({ description: "Failed to connect Slack" });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="mb-2 flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
      <SlackIcon className="size-4 flex-shrink-0" />
      <span className="flex-1 text-muted-foreground">
        You can also chat with your assistant on Slack.
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={connecting}
        onClick={handleConnect}
      >
        {connecting ? "Connecting..." : "Connect"}
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded p-0.5 text-muted-foreground hover:bg-muted-foreground/10"
        onClick={() => dismiss({ hintId: HINT_ID })}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
