"use client";

import { useMemo, useState } from "react";
import {
  HashIcon,
  LockIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  PlusIcon,
  SendIcon,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { PageHeader } from "@/components/PageHeader";
import { LoadingContent } from "@/components/LoadingContent";
import { Toggle } from "@/components/Toggle";
import { MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyInput } from "@/components/CopyInput";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  useMessagingChannels,
  useChannelTargets,
} from "@/hooks/useMessagingChannels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  { name: string; icon: typeof MessageSquareIcon }
> = {
  SLACK: { name: "Slack", icon: HashIcon },
  TEAMS: { name: "Teams", icon: MessageCircleIcon },
  TELEGRAM: { name: "Telegram", icon: SendIcon },
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

  return (
    <>
      <div className="flex items-center justify-between">
        <PageHeader
          title="Channels"
          description="Manage what gets delivered to your chat apps."
        />
        {unconnectedProviders.length > 0 && (
          <ConnectAppButton
            providers={unconnectedProviders}
            emailAccountId={emailAccountId}
            onConnected={mutateChannels}
          />
        )}
      </div>

      <div className="mt-6 space-y-4">
        <LoadingContent
          loading={isLoadingChannels || isLoadingRules}
          error={channelsError || rulesError}
        >
          {connectedChannels.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <MutedText>
                  No channels connected.
                  {unconnectedProviders.length > 0
                    ? " Connect an app to get started."
                    : ""}
                </MutedText>
              </CardContent>
            </Card>
          ) : (
            connectedChannels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                rules={rulesData ?? []}
                emailAccountId={emailAccountId}
                onUpdate={() => {
                  mutateChannels();
                  mutateRules();
                }}
              />
            ))
          )}
        </LoadingContent>

      </div>
    </>
  );
}

function ConnectAppButton({
  providers,
  emailAccountId,
  onConnected,
}: {
  providers: MessagingProvider[];
  emailAccountId: string;
  onConnected: () => void;
}) {
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

  const handleConnect = (provider: MessagingProvider) => {
    if (provider === "SLACK") {
      connectSlack();
    } else {
      executeCreateLinkCode({ provider });
    }
  };

  if (providers.length === 1) {
    const provider = providers[0];
    const config = PROVIDER_CONFIG[provider];
    const Icon = config.icon;
    return (
      <>
        <Button
          variant="default"
          size="sm"
          disabled={connectingSlack || linkCodeStatus === "executing"}
          onClick={() => handleConnect(provider)}
        >
          <Icon className="mr-2 h-4 w-4" />
          Connect {config.name}
        </Button>
        <LinkCodeDialog
          dialog={linkCodeDialog}
          onClose={() => setLinkCodeDialog(null)}
        />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="default"
            size="sm"
            disabled={connectingSlack || linkCodeStatus === "executing"}
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            Connect app
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {providers.map((provider) => {
            const config = PROVIDER_CONFIG[provider];
            const Icon = config.icon;
            return (
              <DropdownMenuItem
                key={provider}
                onClick={() => handleConnect(provider)}
              >
                <Icon className="mr-2 h-4 w-4" />
                {config.name}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
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

function ChannelCard({
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
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span>{config.name}</span>
          <span className="text-muted-foreground font-normal">
            &middot; {channel.teamName ?? (isSlack ? "Slack workspace" : "Workspace")}
          </span>
          {isSlack ? (
            <SlackTargetSelect
              channelId={channel.id}
              targetId={channel.channelId}
              channelName={channel.channelName}
              isDm={channel.isDm}
              canSendAsDm={channel.canSendAsDm}
              emailAccountId={emailAccountId}
              onUpdate={onUpdate}
            />
          ) : (
            <>
              {channel.channelName && (
                <span className="text-muted-foreground font-normal">
                  &middot; #{channel.channelName}
                </span>
              )}
              {channel.isDm && (
                <span className="text-muted-foreground font-normal">
                  &middot; Direct message
                </span>
              )}
            </>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Rules
          </div>
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
            <MutedText className="text-sm">No rules</MutedText>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Other
          </div>
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
        </div>
      </CardContent>
    </Card>
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
      <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent px-1.5 text-xs text-muted-foreground shadow-none hover:bg-muted">
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
            {privateTargets.length === 0
              ? "No channels found. "
              : "Don't see your channel? "}
            Invite the bot with{" "}
            <code className="rounded bg-muted px-1">/invite @InboxZero</code>
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
    <div className="flex items-center justify-between">
      <span className="text-sm">{rule.name}</span>
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
    </div>
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
    <div className="flex items-center justify-between">
      <span className="text-sm">{name}</span>
      <Toggle
        name={`feature-${featureKey}-${channelId}`}
        enabled={enabled}
        disabled={disabled || status === "executing"}
        onChange={(value) =>
          execute({ channelId, [featureKey]: value })
        }
      />
    </div>
  );
}
