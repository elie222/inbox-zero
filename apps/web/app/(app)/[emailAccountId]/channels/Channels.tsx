"use client";

import { useMemo, useState } from "react";
import { CheckIcon, LogOutIcon, MoreVerticalIcon } from "lucide-react";
import Image from "next/image";
import { useAction } from "next-safe-action/hooks";
import { SlackNotificationTargetSelect } from "@/components/SlackNotificationTargetSelect";
import { PageHeader } from "@/components/PageHeader";
import { LoadingContent } from "@/components/LoadingContent";
import { Toggle } from "@/components/Toggle";
import { MutedText } from "@/components/Typography";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useAccount } from "@/providers/EmailAccountProvider";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { useRules } from "@/hooks/useRules";
import { useSlackConnect } from "@/hooks/useSlackConnect";
import {
  updateChannelFeaturesAction,
  toggleRuleChannelAction,
  createMessagingLinkCodeAction,
  disconnectChannelAction,
} from "@/utils/actions/messaging-channels";
import { useSlackNotifications } from "@/app/(app)/[emailAccountId]/settings/ConnectedAppsSection";
import { ProactiveUpdatesSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/ProactiveUpdatesSetting";
import { toastSuccess, toastError } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { sortRulesForAutomation } from "@/utils/rule/sort";
import {
  type MessagingProvider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";
import type { RulesResponse } from "@/app/api/user/rules/route";
import type { MessagingActionType } from "@/utils/actions/messaging-channels.validation";

type LinkableProvider = "TEAMS" | "TELEGRAM";

const PROVIDER_CONFIG: Record<
  MessagingProvider,
  { name: string; logo: string }
> = {
  SLACK: { name: "Slack", logo: "/images/slack.svg" },
  TEAMS: { name: "Teams", logo: "/images/teams.png" },
  TELEGRAM: { name: "Telegram", logo: "/images/telegram.svg" },
};

const PROVIDER_ORDER: MessagingProvider[] = ["SLACK", "TEAMS", "TELEGRAM"];

type ChannelFromResponse = GetMessagingChannelsResponse["channels"][number];

type Rule = RulesResponse[number];

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
    () =>
      sortChannelsByProvider(
        channelsData?.channels.filter((c) => c.isConnected) ?? [],
      ),
    [channelsData],
  );

  const availableProviders = channelsData?.availableProviders ?? [];
  const visibleRules = useMemo(
    () =>
      sortRulesForAutomation((rulesData ?? []).filter((rule) => rule.enabled)),
    [rulesData],
  );
  const connectedProviders = new Set(connectedChannels.map((c) => c.provider));
  const unconnectedProviders = sortProviders(
    availableProviders.filter((p) => !connectedProviders.has(p)),
  );
  const orderedProviders = sortProviders([
    ...connectedProviders,
    ...unconnectedProviders,
  ]);

  const onUpdate = () => {
    mutateChannels();
    mutateRules();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <PageHeader
        title="Channels"
        description="Manage what gets delivered to your chat apps."
      />

      <LoadingContent
        loading={isLoadingChannels || isLoadingRules}
        error={channelsError || rulesError}
      >
        <div className="space-y-10">
          {orderedProviders.map((provider) => {
            const providerChannels = connectedChannels.filter(
              (channel) => channel.provider === provider,
            );

            if (providerChannels.length > 0) {
              return providerChannels.map((channel) => (
                <ConnectedChannelSection
                  key={channel.id}
                  channel={channel}
                  rules={visibleRules}
                  emailAccountId={emailAccountId}
                  onUpdate={onUpdate}
                />
              ));
            }

            if (unconnectedProviders.includes(provider)) {
              return (
                <UnconnectedProviderSection
                  key={provider}
                  provider={provider}
                  emailAccountId={emailAccountId}
                  onConnected={mutateChannels}
                />
              );
            }

            return null;
          })}

          {connectedChannels.length === 0 &&
            unconnectedProviders.length === 0 && (
              <ItemCard className="py-8 text-center">
                <MutedText>No channels available.</MutedText>
              </ItemCard>
            )}

          {connectedChannels.length > 0 && (
            <SectionGroup title="Scheduled check-ins">
              <ProactiveUpdatesSetting />
            </SectionGroup>
          )}
        </div>
      </LoadingContent>
    </div>
  );
}

function SectionGroup({
  icon,
  title,
  badge,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <h2 className="text-sm font-medium uppercase tracking-wide">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

function ConnectedChannelSection({
  channel,
  rules,
  emailAccountId,
  onUpdate,
}: {
  channel: ChannelFromResponse;
  rules: Rule[];
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const config = PROVIDER_CONFIG[channel.provider];
  const hasTarget = channel.destinations.ruleNotifications.enabled;
  const isSlack = channel.provider === "SLACK";

  const { execute: executeDisconnect, status: disconnectStatus } = useAction(
    disconnectChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: `${config.name} disconnected` });
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

  const channelRuleActions = useMemo(() => {
    const map = new Map<string, MessagingActionType>();
    for (const action of channel.actions) {
      if (
        action.ruleId &&
        (action.type === "NOTIFY_MESSAGING_CHANNEL" ||
          action.type === "DRAFT_MESSAGING_CHANNEL")
      ) {
        map.set(action.ruleId, action.type as MessagingActionType);
      }
    }
    return map;
  }, [channel.actions]);

  return (
    <SectionGroup
      icon={
        <Image
          src={config.logo}
          alt={config.name}
          width={20}
          height={20}
          className="size-5"
          unoptimized
        />
      }
      title={config.name}
      badge={
        <div className="flex items-center gap-1">
          <Badge color="green">Connected</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={disconnectStatus === "executing"}
              >
                <MoreVerticalIcon className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => executeDisconnect({ channelId: channel.id })}
                className="text-destructive focus:text-destructive"
              >
                <LogOutIcon className="mr-2 h-4 w-4" />
                Disconnect {config.name}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      {isSlack && (
        <ItemCard>
          <Item size="sm">
            <ItemContent>
              <ItemTitle>Rule notifications</ItemTitle>
              <ItemDescription>
                Choose where rule notifications and chat replies go.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <SlackNotificationTargetSelect
                emailAccountId={emailAccountId}
                messagingChannelId={channel.id}
                purpose={MessagingRoutePurpose.RULE_NOTIFICATIONS}
                targetId={channel.destinations.ruleNotifications.targetId}
                targetLabel={channel.destinations.ruleNotifications.targetLabel}
                isDm={channel.destinations.ruleNotifications.isDm}
                canSendAsDm={channel.canSendAsDm}
                onUpdate={onUpdate}
              />
            </ItemActions>
          </Item>
        </ItemCard>
      )}

      <ItemCard>
        <Item size="sm">
          <ItemContent>
            <ItemTitle>Rules</ItemTitle>
            <ItemDescription>
              Choose which rules send notifications to this channel.
            </ItemDescription>
          </ItemContent>
        </Item>
        <ItemSeparator />
        <div className="max-h-80 overflow-y-auto">
          {rules.length > 0 ? (
            rules.map((rule) => (
              <RuleToggle
                key={rule.id}
                rule={rule}
                channelId={channel.id}
                currentActionType={channelRuleActions.get(rule.id) ?? null}
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
        </div>
      </ItemCard>

      <ItemCard>
        <FeatureRouteToggle
          name="Meeting briefs"
          description="Get a summary before your meetings."
          purpose={MessagingRoutePurpose.MEETING_BRIEFS}
          messagingChannelId={channel.id}
          enabled={channel.destinations.meetingBriefs.enabled}
          targetId={channel.destinations.meetingBriefs.targetId}
          targetLabel={channel.destinations.meetingBriefs.targetLabel}
          isDm={channel.destinations.meetingBriefs.isDm}
          showTargetSelect={isSlack}
          canSendAsDm={channel.canSendAsDm}
          emailAccountId={emailAccountId}
          onUpdate={onUpdate}
          disabled={
            !channel.destinations.meetingBriefs.enabled &&
            !hasTarget &&
            !isSlack
          }
        />
        <ItemSeparator />
        <FeatureRouteToggle
          name="Document filing alerts"
          description="Notifications when documents are auto-filed."
          purpose={MessagingRoutePurpose.DOCUMENT_FILINGS}
          messagingChannelId={channel.id}
          enabled={channel.destinations.documentFilings.enabled}
          targetId={channel.destinations.documentFilings.targetId}
          targetLabel={channel.destinations.documentFilings.targetLabel}
          isDm={channel.destinations.documentFilings.isDm}
          showTargetSelect={isSlack}
          canSendAsDm={channel.canSendAsDm}
          emailAccountId={emailAccountId}
          onUpdate={onUpdate}
          disabled={
            !channel.destinations.documentFilings.enabled &&
            !hasTarget &&
            !isSlack
          }
        />
      </ItemCard>
    </SectionGroup>
  );
}

function UnconnectedProviderSection({
  provider,
  emailAccountId,
  onConnected,
}: {
  provider: MessagingProvider;
  emailAccountId: string;
  onConnected: () => void;
}) {
  const config = PROVIDER_CONFIG[provider];
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
      <SectionGroup
        icon={
          <Image
            src={config.logo}
            alt={config.name}
            width={20}
            height={20}
            className="size-5"
            unoptimized
          />
        }
        title={config.name}
      >
        <ItemCard>
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
      </SectionGroup>
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
              <a href={dialog.botUrl} target="_blank" rel="noopener noreferrer">
                Open Telegram bot
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RuleToggle({
  rule,
  channelId,
  currentActionType,
  emailAccountId,
  onUpdate,
}: {
  rule: Rule;
  channelId: string;
  currentActionType: MessagingActionType | null;
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const enabled = currentActionType !== null;
  const isDraft = currentActionType === "DRAFT_MESSAGING_CHANNEL";

  // Smart default: if the rule already has a DRAFT_EMAIL action, default to draft mode
  const hasDraftEmailAction = rule.actions.some(
    (a) => a.type === "DRAFT_EMAIL",
  );
  const defaultActionType: MessagingActionType = hasDraftEmailAction
    ? "DRAFT_MESSAGING_CHANNEL"
    : "NOTIFY_MESSAGING_CHANNEL";

  const { execute, status } = useAction(
    toggleRuleChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved" });
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error) ?? "Failed to update",
        });
      },
    },
  );

  const isExecuting = status === "executing";

  const switchMode = (newType: MessagingActionType) => {
    if (newType === currentActionType) return;
    execute({
      ruleId: rule.id,
      messagingChannelId: channelId,
      enabled: true,
      actionType: newType,
    });
  };

  return (
    <Item size="sm" className="py-1.5">
      <ItemContent>
        <div className="flex items-center gap-2">
          <ItemTitle>{rule.name}</ItemTitle>
          {isDraft && <Badge color="green">Draft reply</Badge>}
        </div>
      </ItemContent>
      <ItemActions>
        <div className="flex items-center gap-1">
          {enabled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={isExecuting}
                >
                  <MoreVerticalIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => switchMode("NOTIFY_MESSAGING_CHANNEL")}
                >
                  <CheckIcon
                    className={`mr-2 h-4 w-4 ${isDraft ? "invisible" : ""}`}
                  />
                  Notify only
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => switchMode("DRAFT_MESSAGING_CHANNEL")}
                >
                  <CheckIcon
                    className={`mr-2 h-4 w-4 ${!isDraft ? "invisible" : ""}`}
                  />
                  Draft reply in chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Toggle
            name={`rule-${rule.id}-${channelId}`}
            enabled={enabled}
            disabled={isExecuting}
            onChange={(value) =>
              execute({
                ruleId: rule.id,
                messagingChannelId: channelId,
                enabled: value,
                actionType: value ? defaultActionType : undefined,
              })
            }
          />
        </div>
      </ItemActions>
    </Item>
  );
}

function FeatureRouteToggle({
  name,
  description,
  purpose,
  messagingChannelId,
  enabled,
  targetId,
  targetLabel,
  isDm,
  showTargetSelect,
  canSendAsDm,
  emailAccountId,
  onUpdate,
  disabled,
}: {
  name: string;
  description: string;
  purpose:
    | MessagingRoutePurpose.MEETING_BRIEFS
    | MessagingRoutePurpose.DOCUMENT_FILINGS;
  messagingChannelId: string;
  enabled: boolean;
  targetId: string | null;
  targetLabel: string | null;
  isDm: boolean;
  showTargetSelect: boolean;
  canSendAsDm: boolean;
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
          description: getActionErrorMessage(error.error) ?? "Failed to update",
        });
      },
    },
  );

  const handleToggleChange = (value: boolean) => {
    if (purpose === MessagingRoutePurpose.MEETING_BRIEFS) {
      execute({
        channelId: messagingChannelId,
        sendMeetingBriefs: value,
      });
      return;
    }

    execute({
      channelId: messagingChannelId,
      sendDocumentFilings: value,
    });
  };

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <div className="flex items-center gap-2">
          {showTargetSelect && (
            <SlackNotificationTargetSelect
              emailAccountId={emailAccountId}
              messagingChannelId={messagingChannelId}
              purpose={purpose}
              targetId={targetId}
              targetLabel={targetLabel}
              isDm={isDm}
              canSendAsDm={canSendAsDm}
              onUpdate={onUpdate}
            />
          )}
          <Toggle
            name={`feature-${purpose}-${messagingChannelId}`}
            enabled={enabled}
            disabled={disabled || status === "executing"}
            onChange={handleToggleChange}
          />
        </div>
      </ItemActions>
    </Item>
  );
}

function sortChannelsByProvider(channels: ChannelFromResponse[]) {
  return [...channels].sort(
    (a, b) =>
      getProviderOrderIndex(a.provider) - getProviderOrderIndex(b.provider),
  );
}

function sortProviders(providers: MessagingProvider[]) {
  return [...providers].sort(
    (a, b) => getProviderOrderIndex(a) - getProviderOrderIndex(b),
  );
}

function getProviderOrderIndex(provider: MessagingProvider) {
  const index = PROVIDER_ORDER.indexOf(provider);
  return index === -1 ? PROVIDER_ORDER.length : index;
}
