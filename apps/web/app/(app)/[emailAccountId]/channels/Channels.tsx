"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BellIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronRightIcon,
  LogOutIcon,
  MailIcon,
  MessageCircleReplyIcon,
  MoreVerticalIcon,
  Settings2Icon,
  SunIcon,
} from "lucide-react";
import Image from "next/image";
import { useAction } from "next-safe-action/hooks";
import { DigestSettingsDialogContent } from "@/app/(app)/[emailAccountId]/assistant/settings/DigestSetting";
import { FollowUpSettingsDialogContent } from "@/app/(app)/[emailAccountId]/assistant/settings/FollowUpRemindersSetting";
import { SlackNotificationTargetSelect } from "@/components/SlackNotificationTargetSelect";
import { PageHeader } from "@/components/PageHeader";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
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
  updateMessagingFeatureRouteAction,
  toggleRuleChannelAction,
  createMessagingLinkCodeAction,
  disconnectChannelAction,
} from "@/utils/actions/messaging-channels";
import { useSlackNotifications } from "@/app/(app)/[emailAccountId]/settings/ConnectedAppsSection";
import { ProactiveUpdatesSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/ProactiveUpdatesSetting";
import { toastSuccess, toastError } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import {
  canEnableMessagingFeatureRoute,
  getMessagingFeatureRouteSummary,
  type MessagingFeatureRoutePurpose,
  type MessagingRouteSummary,
} from "@/utils/messaging/routes";
import { sortRulesForAutomation } from "@/utils/rule/sort";
import {
  type MessagingProvider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";
import type { RulesResponse } from "@/app/api/user/rules/route";
import type { MessagingActionType } from "@/utils/actions/messaging-channels.validation";
import { prefixPath } from "@/utils/path";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";

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

const CHANNEL_FEATURES: Array<{
  purpose: MessagingFeatureRoutePurpose;
  name: string;
  description: string;
}> = [
  {
    purpose: MessagingRoutePurpose.MEETING_BRIEFS,
    name: "Meeting briefs",
    description: "Get a summary before your meetings.",
  },
  {
    purpose: MessagingRoutePurpose.FOLLOW_UPS,
    name: "Follow-up reminders",
    description: "Get nudged about emails that need a follow-up.",
  },
  {
    purpose: MessagingRoutePurpose.DIGESTS,
    name: "Digests",
    description: "Receive your scheduled digest in chat.",
  },
  {
    purpose: MessagingRoutePurpose.DOCUMENT_FILINGS,
    name: "Document filing alerts",
    description: "Notifications when documents are auto-filed.",
  },
];

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
  const connectedProviders = useMemo(
    () => new Set(connectedChannels.map((c) => c.provider)),
    [connectedChannels],
  );
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
          {connectedChannels.length === 0 && (
            <ChannelsIntro availableProviders={availableProviders} />
          )}

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
        </div>
      </LoadingContent>
    </div>
  );
}

const INTRO_FEATURES: Array<{
  icon: React.ElementType;
  label: string;
}> = [
  { icon: MailIcon, label: "Important emails" },
  { icon: MessageCircleReplyIcon, label: "Drafted replies" },
  { icon: CalendarClockIcon, label: "Meeting briefs" },
  { icon: SunIcon, label: "Daily summary" },
];

function ChannelsIntro({
  availableProviders,
}: {
  availableProviders: MessagingProvider[];
}) {
  const providerList = formatProviderList(availableProviders);

  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-6 dark:border-blue-950 dark:bg-blue-950/20">
      <h2 className="flex items-start gap-2 text-lg font-semibold tracking-tight">
        <BellIcon className="mt-1 size-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <span>Inbox Zero where you work.</span>
      </h2>
      <MutedText className="mt-2 text-sm">
        Important emails, pre-drafted replies, meeting briefs, and a daily inbox
        summary
        {providerList ? `, delivered to ${providerList}` : ""}.
      </MutedText>
      <div className="mt-5 flex flex-wrap gap-2">
        {INTRO_FEATURES.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium"
          >
            <Icon className="size-3.5 text-muted-foreground" />
            {label}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatProviderList(providers: MessagingProvider[]) {
  if (providers.length === 0) return null;
  const names = sortProviders(providers).map((p) => PROVIDER_CONFIG[p].name);
  return new Intl.ListFormat("en", { type: "disjunction" }).format(names);
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
  const analytics = useProductAnalytics("channels");
  const config = PROVIDER_CONFIG[channel.provider];
  const isSlack = channel.provider === "SLACK";

  const { execute: executeDisconnect, status: disconnectStatus } = useAction(
    disconnectChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        analytics.captureAction("channel_disconnected", {
          provider: channel.provider,
        });
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
      <ItemCard>
        <Item size="sm">
          <ItemContent>
            <ItemTitle>Rule notifications</ItemTitle>
            <ItemDescription>
              Choose which rules send notifications and where they go.
            </ItemDescription>
          </ItemContent>
          {isSlack && (
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
          )}
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
        {CHANNEL_FEATURES.map((feature, index) => {
          const destination = getMessagingFeatureRouteSummary(
            channel.destinations,
            feature.purpose,
          );

          return (
            <div key={feature.purpose}>
              {index > 0 && <ItemSeparator />}
              {feature.purpose === MessagingRoutePurpose.FOLLOW_UPS && (
                <>
                  <ProactiveUpdatesSetting
                    channel={channel}
                    emailAccountId={emailAccountId}
                    onUpdate={onUpdate}
                  />
                  <ItemSeparator />
                </>
              )}
              <FeatureRouteToggle
                name={feature.name}
                description={feature.description}
                purpose={feature.purpose}
                messagingChannelId={channel.id}
                destination={destination}
                showTargetSelect={isSlack}
                canSendAsDm={channel.canSendAsDm}
                emailAccountId={emailAccountId}
                onUpdate={onUpdate}
                disabled={
                  !canEnableMessagingFeatureRoute(
                    channel.destinations,
                    feature.purpose,
                  )
                }
              />
            </div>
          );
        })}
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
  const analytics = useProductAnalytics("channels");
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
        analytics.captureAction("channel_link_code_created", {
          provider: data.provider,
        });
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
    analytics.captureAction("channel_connect_started", { provider });
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
  const analytics = useProductAnalytics("channels");
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
    analytics.captureAction("rule_channel_mode_changed", {
      action_type: newType,
      was_enabled: enabled,
    });
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
            onChange={(value) => {
              analytics.captureAction("rule_channel_toggled", {
                enabled: value,
                action_type: value ? defaultActionType : currentActionType,
              });
              execute({
                ruleId: rule.id,
                messagingChannelId: channelId,
                enabled: value,
                actionType: value ? defaultActionType : undefined,
              });
            }}
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
  destination,
  showTargetSelect,
  canSendAsDm,
  emailAccountId,
  onUpdate,
  disabled,
}: {
  name: string;
  description: string;
  purpose: MessagingFeatureRoutePurpose;
  messagingChannelId: string;
  destination: MessagingRouteSummary;
  showTargetSelect: boolean;
  canSendAsDm: boolean;
  emailAccountId: string;
  onUpdate: () => void;
  disabled?: boolean;
}) {
  const analytics = useProductAnalytics("channels");
  const { execute, status } = useAction(
    updateMessagingFeatureRouteAction.bind(null, emailAccountId),
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

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <div className="flex items-center gap-2">
          <FeatureRouteAction
            purpose={purpose}
            emailAccountId={emailAccountId}
          />
          {showTargetSelect && (
            <SlackNotificationTargetSelect
              emailAccountId={emailAccountId}
              messagingChannelId={messagingChannelId}
              purpose={purpose}
              targetId={destination.targetId}
              targetLabel={destination.targetLabel}
              isDm={destination.isDm}
              canSendAsDm={canSendAsDm}
              onUpdate={onUpdate}
            />
          )}
          <Toggle
            name={`feature-${purpose}-${messagingChannelId}`}
            enabled={destination.enabled}
            disabled={disabled || status === "executing"}
            onChange={(enabled) => {
              if (disabled) return;
              analytics.captureAction("feature_route_toggled", {
                purpose,
                enabled,
              });
              execute({ channelId: messagingChannelId, purpose, enabled });
            }}
          />
        </div>
      </ItemActions>
    </Item>
  );
}

function FeatureRouteAction({
  purpose,
  emailAccountId,
}: {
  purpose: MessagingFeatureRoutePurpose;
  emailAccountId: string;
}) {
  const [open, setOpen] = useState(false);

  if (
    purpose === MessagingRoutePurpose.MEETING_BRIEFS ||
    purpose === MessagingRoutePurpose.DOCUMENT_FILINGS
  ) {
    const href =
      purpose === MessagingRoutePurpose.MEETING_BRIEFS
        ? prefixPath(emailAccountId, "/briefs")
        : prefixPath(emailAccountId, "/drive");

    return (
      <Tooltip content="Open settings">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href={href}>
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip content="Configure">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setOpen(true)}
        >
          <Settings2Icon className="h-4 w-4" />
        </Button>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        {purpose === MessagingRoutePurpose.DIGESTS ? (
          <DigestSettingsDialogContent
            onSuccess={() => setOpen(false)}
            showChannelsHint={false}
          />
        ) : (
          <FollowUpSettingsDialogContent
            onSuccess={() => setOpen(false)}
            showChannelsHint={false}
          />
        )}
      </Dialog>
    </>
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
