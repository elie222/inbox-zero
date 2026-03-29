"use client";

import { useMemo, useState } from "react";
import {
  LockIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  SendIcon,
  SlackIcon,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { PageHeader } from "@/components/PageHeader";
import { LoadingContent } from "@/components/LoadingContent";
import { Toggle } from "@/components/Toggle";
import { MutedText } from "@/components/Typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyInput } from "@/components/CopyInput";
import {
  Item,
  ItemActions,
  ItemCard,
  ItemContent,
  ItemDescription,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  useMessagingChannels,
  useChannelTargets,
} from "@/hooks/useMessagingChannels";
import { useRules } from "@/hooks/useRules";
import { useSlackConnect } from "@/hooks/useSlackConnect";
import {
  updateChannelFeaturesAction,
  updateSlackChannelAction,
  toggleRuleChannelAction,
  createMessagingLinkCodeAction,
} from "@/utils/actions/messaging-channels";
import { useSlackNotifications } from "@/app/(app)/[emailAccountId]/settings/ConnectedAppsSection";
import { toastSuccess, toastError } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import type { MessagingProvider } from "@/generated/prisma/enums";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";

type LinkableProvider = "TEAMS" | "TELEGRAM";

const PROVIDER_CONFIG: Record<
  MessagingProvider,
  { name: string; icon: typeof SlackIcon }
> = {
  SLACK: { name: "Slack", icon: SlackIcon },
  TEAMS: { name: "Teams", icon: MessageCircleIcon },
  TELEGRAM: { name: "Telegram", icon: SendIcon },
};

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  sendMeetingBriefs: "Get a summary before your meetings.",
  sendDocumentFilings: "Notifications when documents are auto-filed.",
};

type ChannelFromResponse =
  GetMessagingChannelsResponse["channels"][number];

export function Channels() {
  const { emailAccountId } = useAccount();
  const {
    data: channelsData,
    isLoading: isLoadingChannels,
    error: channelsError,
    mutate: mutateChannels,
  } = useMessagingChannels(emailAccountId);
  const {
    data: rulesData,
    isLoading: isLoadingRules,
    error: rulesError,
    mutate: mutateRules,
  } = useRules();

  useSlackNotifications({
    enabled: true,
    onSlackConnected: () => mutateChannels(),
  });

  const connectedChannels = useMemo(
    () => channelsData?.channels.filter((c) => c.isConnected) ?? [],
    [channelsData],
  );

  const availableProviders = channelsData?.availableProviders ?? [];
  const connectedProviders = new Set(
    connectedChannels.map((c) => c.provider),
  );
  const unconnectedProviders = availableProviders.filter(
    (p) => !connectedProviders.has(p),
  );

  const onUpdate = () => {
    mutateChannels();
    mutateRules();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Channels"
        description="Manage what gets delivered to your chat apps."
      />

      <LoadingContent
        loading={isLoadingChannels || isLoadingRules}
        error={channelsError || rulesError}
      >
        <div className="space-y-6">
          {connectedChannels.map((channel) => (
            <ConnectedChannelCard
              key={channel.id}
              channel={channel}
              rules={rulesData ?? []}
              emailAccountId={emailAccountId}
              onUpdate={onUpdate}
            />
          ))}

          {unconnectedProviders.map((provider) => (
            <UnconnectedProviderCard
              key={provider}
              provider={provider}
              emailAccountId={emailAccountId}
              onConnected={mutateChannels}
            />
          ))}

          {connectedChannels.length === 0 &&
            unconnectedProviders.length === 0 && (
              <ItemCard className="py-8 text-center">
                <MutedText>No channels available.</MutedText>
              </ItemCard>
            )}
        </div>
      </LoadingContent>
    </div>
  );
}

function ConnectedChannelCard({
  channel,
  rules,
  emailAccountId,
  onUpdate,
}: {
  channel: ChannelFromResponse;
  rules: Array<{ id: string; name: string }>;
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const config = PROVIDER_CONFIG[channel.provider];
  const Icon = config.icon;
  const hasTarget = channel.hasSendDestination;
  const isSlack = channel.provider === "SLACK";

  const channelRuleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const action of channel.actions) {
      if (action.ruleId) ids.add(action.ruleId);
    }
    return ids;
  }, [channel.actions]);

  return (
    <ItemCard>
      <Item size="sm">
        <Icon className="h-5 w-5" />
        <ItemContent>
          <ItemTitle>
            {config.name}
            <Badge variant="secondary" className="text-xs font-normal">
              Connected
            </Badge>
          </ItemTitle>
        </ItemContent>
      </Item>

      {isSlack && (
        <>
          <ItemSeparator />
          <Item size="sm">
            <ItemContent>
              <ItemTitle>Deliver to</ItemTitle>
              <ItemDescription>
                Choose where Inbox Zero sends notifications.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <SlackTargetSelect
                channelId={channel.id}
                targetId={channel.channelId}
                channelName={channel.channelName}
                isDm={channel.isDm}
                canSendAsDm={channel.canSendAsDm}
                emailAccountId={emailAccountId}
                onUpdate={onUpdate}
              />
            </ItemActions>
          </Item>
        </>
      )}

      <ItemSeparator />
      <SectionLabel>Rules</SectionLabel>
      {rules.length > 0 ? (
        rules.map((rule) => (
          <RuleToggle
            key={rule.id}
            rule={rule}
            channelId={channel.id}
            enabled={channelRuleIds.has(rule.id)}
            emailAccountId={emailAccountId}
            onUpdate={onUpdate}
          />
        ))
      ) : (
        <Item size="sm">
          <ItemContent>
            <MutedText className="text-sm">No rules</MutedText>
          </ItemContent>
        </Item>
      )}

      <ItemSeparator />
      <SectionLabel>Other</SectionLabel>
      <FeatureToggle
        name="Meeting briefs"
        channelId={channel.id}
        enabled={channel.sendMeetingBriefs}
        featureKey="sendMeetingBriefs"
        emailAccountId={emailAccountId}
        onUpdate={onUpdate}
        disabled={!hasTarget}
      />
      <FeatureToggle
        name="Document filing alerts"
        channelId={channel.id}
        enabled={channel.sendDocumentFilings}
        featureKey="sendDocumentFilings"
        emailAccountId={emailAccountId}
        onUpdate={onUpdate}
        disabled={!hasTarget}
      />
    </ItemCard>
  );
}

function UnconnectedProviderCard({
  provider,
  emailAccountId,
  onConnected,
}: {
  provider: MessagingProvider;
  emailAccountId: string;
  onConnected: () => void;
}) {
  const config = PROVIDER_CONFIG[provider];
  const Icon = config.icon;
  const { connect: connectSlack, connecting: connectingSlack } =
    useSlackConnect({ emailAccountId, onConnected });

  const [linkCodeDialog, setLinkCodeDialog] = useState<{
    provider: LinkableProvider;
    code: string;
    botUrl?: string | null;
  } | null>(null);

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

  const handleConnect = () => {
    if (provider === "SLACK") {
      connectSlack();
    } else {
      executeCreateLinkCode({ provider });
    }
  };

  const isLoading = connectingSlack || linkCodeStatus === "executing";

  return (
    <>
      <ItemCard>
        <Item size="sm">
          <Icon className="h-5 w-5" />
          <ItemContent>
            <ItemTitle>{config.name}</ItemTitle>
          </ItemContent>
        </Item>
        <ItemSeparator />
        <Item size="sm">
          <ItemContent>
            <ItemTitle>Connect {config.name}</ItemTitle>
            <ItemDescription>
              Receive notifications via {config.name}.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={handleConnect}
            >
              Connect
            </Button>
          </ItemActions>
        </Item>
      </ItemCard>
      <LinkCodeDialog
        dialog={linkCodeDialog}
        onClose={() => setLinkCodeDialog(null)}
      />
    </>
  );
}

function LinkCodeDialog({
  dialog,
  onClose,
}: {
  dialog: {
    provider: LinkableProvider;
    code: string;
    botUrl?: string | null;
  } | null;
  onClose: () => void;
}) {
  if (!dialog) return null;

  const providerName = dialog.provider === "TEAMS" ? "Teams" : "Telegram";
  const command = `/connect ${dialog.code}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
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
        {dialog.provider === "TELEGRAM" && dialog.botUrl && (
          <div className="pt-1">
            <Button asChild size="sm">
              <a
                href={dialog.botUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Telegram bot
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-2 pb-0">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

function SlackTargetSelect({
  channelId,
  targetId,
  channelName,
  isDm,
  canSendAsDm,
  emailAccountId,
  onUpdate,
}: {
  channelId: string;
  targetId: string | null;
  channelName: string | null;
  isDm: boolean;
  canSendAsDm: boolean;
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const [loadTargets, setLoadTargets] = useState(false);
  const {
    data: targetsData,
    isLoading,
    error,
    mutate: mutateTargets,
  } = useChannelTargets(loadTargets ? channelId : null, emailAccountId);

  const privateTargets = targetsData?.targets ?? [];
  const hasError = Boolean(error || targetsData?.error);

  const { execute, status } = useAction(
    updateSlackChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Channel updated" });
        onUpdate();
      },
      onError: (err) => {
        toastError({
          description:
            getActionErrorMessage(err.error) ?? "Failed to update channel",
        });
      },
    },
  );

  return (
    <Select
      value={isDm ? "dm" : (targetId ?? "")}
      onValueChange={(value) => {
        execute({ channelId, targetId: value === "dm" ? "dm" : value });
      }}
      disabled={isLoading || status === "executing"}
      onOpenChange={(open) => {
        if (open) setLoadTargets(true);
      }}
    >
      <SelectTrigger className="h-8 w-[180px]">
        <SelectValue
          placeholder={
            isLoading
              ? "Loading..."
              : hasError
                ? "Failed to load"
                : "Select channel"
          }
        >
          {isDm
            ? "Direct message"
            : channelName
              ? `#${channelName}`
              : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {canSendAsDm && (
          <SelectItem value="dm">
            <MessageSquareIcon className="mr-1 inline h-3 w-3" />
            Direct message
          </SelectItem>
        )}
        {privateTargets.map((target) => (
          <SelectItem key={target.id} value={target.id}>
            <LockIcon className="mr-1 inline h-3 w-3" />
            {target.name}
          </SelectItem>
        ))}
        {!isLoading && !hasError && (
          <div className="border-t px-2 py-1.5 text-xs text-muted-foreground">
            <div>
              {privateTargets.length === 0
                ? "No channels found."
                : "Don't see your channel?"}
            </div>
            <div>
              Invite the bot with{" "}
              <code className="rounded bg-muted px-1">/invite @InboxZero</code>
            </div>
          </div>
        )}
        {hasError && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Failed to load channels.{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => mutateTargets()}
            >
              Retry
            </button>
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

function RuleToggle({
  rule,
  channelId,
  enabled,
  emailAccountId,
  onUpdate,
}: {
  rule: { id: string; name: string };
  channelId: string;
  enabled: boolean;
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const { execute, status } = useAction(
    toggleRuleChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved" });
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? "Failed to update",
        });
      },
    },
  );

  return (
    <Item size="sm" className="py-1.5">
      <ItemContent>
        <ItemTitle>{rule.name}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Toggle
          name={`rule-${rule.id}-${channelId}`}
          enabled={enabled}
          disabled={status === "executing"}
          onChange={(value) =>
            execute({
              ruleId: rule.id,
              messagingChannelId: channelId,
              enabled: value,
            })
          }
        />
      </ItemActions>
    </Item>
  );
}

function FeatureToggle({
  name,
  channelId,
  enabled,
  featureKey,
  emailAccountId,
  onUpdate,
  disabled,
}: {
  name: string;
  channelId: string;
  enabled: boolean;
  featureKey: "sendMeetingBriefs" | "sendDocumentFilings";
  emailAccountId: string;
  onUpdate: () => void;
  disabled?: boolean;
}) {
  const { execute, status } = useAction(
    updateChannelFeaturesAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved" });
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? "Failed to update",
        });
      },
    },
  );

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
        <ItemDescription>{FEATURE_DESCRIPTIONS[featureKey]}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Toggle
          name={`feature-${featureKey}-${channelId}`}
          enabled={enabled}
          disabled={disabled || status === "executing"}
          onChange={(value) =>
            execute({ channelId, [featureKey]: value })
          }
        />
      </ItemActions>
    </Item>
  );
}
