"use client";

import { SlackIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/useUser";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { dismissHintAction } from "@/utils/actions/hints";

const HINT_ID = "messaging-channel";

export function MessagingChannelHint() {
  const { data: user, mutate: mutateUser } = useUser();
  const { data: channelsData, isLoading: channelsLoading } =
    useMessagingChannels();

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

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
      <SlackIcon className="size-4 flex-shrink-0" />
      <span className="flex-1 text-muted-foreground">
        You can also chat with your assistant on Slack.
      </span>
      <Link href="/settings">
        <Button variant="outline" size="sm" className="h-7 text-xs">
          Connect
        </Button>
      </Link>
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
