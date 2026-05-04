import { ActionType } from "@/generated/prisma/enums";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";
import { Card, CardContent } from "@/components/ui/card";
import { getActionIcon } from "@/utils/action-display";
import { SectionHeader } from "@/components/Typography";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import {
  getAvailableActions,
  getExtraActions,
} from "@/utils/ai/rule/create-rule-schema";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { getMessagingProviderName } from "@/utils/messaging/platforms";
import { getConnectedRuleNotificationChannels } from "@/utils/messaging/routes";

const actionNames: Record<ActionType, string> = {
  [ActionType.LABEL]: "Label",
  [ActionType.MOVE_FOLDER]: "Move to folder",
  [ActionType.ARCHIVE]: "Archive",
  [ActionType.DRAFT_EMAIL]: "Draft replies",
  [ActionType.DRAFT_MESSAGING_CHANNEL]: "Draft replies",
  [ActionType.REPLY]: "Send replies",
  [ActionType.FORWARD]: "Forward",
  [ActionType.MARK_READ]: "Mark as read",
  [ActionType.STAR]: "Star",
  [ActionType.MARK_SPAM]: "Mark as spam",
  [ActionType.SEND_EMAIL]: "Send email",
  [ActionType.CALL_WEBHOOK]: "Call webhook",
  [ActionType.DIGEST]: "Add to digest",
  [ActionType.NOTIFY_MESSAGING_CHANNEL]: "Notify",
  [ActionType.NOTIFY_SENDER]: "Notify sender",
};

const actionTooltips: Partial<Record<ActionType, string>> = {
  [ActionType.CALL_WEBHOOK]:
    "For developers: trigger external integrations by sending email data to a custom URL",
  [ActionType.DIGEST]:
    "Group emails together and receive them as a daily summary",
};

export function AvailableActionsPanel() {
  const { emailAccountId, provider } = useAccount();
  const { data: messagingChannelsData } = useMessagingChannels(emailAccountId);
  const notifyActionName = getNotifyActionName(messagingChannelsData);

  return (
    <Card className="h-fit bg-slate-50 dark:bg-slate-900 hidden sm:block">
      <CardContent className="pt-4">
        <div className="grid gap-2">
          <ActionSection
            actions={[...getAvailableActions(provider), ...getExtraActions()]}
            notifyActionName={notifyActionName}
            title="Available Actions"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ActionSection({
  title,
  actions,
  notifyActionName,
}: {
  title: string;
  actions: ActionType[];
  notifyActionName: string;
}) {
  return (
    <div>
      <SectionHeader>{title}</SectionHeader>
      <div className="grid gap-2 mt-1">
        {actions.map((actionType) => {
          const Icon = getActionIcon(actionType);
          const tooltip = actionTooltips[actionType];
          return (
            <div key={actionType} className="flex items-center gap-2">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="text-sm">
                {actionType === ActionType.NOTIFY_MESSAGING_CHANNEL
                  ? notifyActionName
                  : actionNames[actionType]}
              </span>
              {tooltip && <TooltipExplanation text={tooltip} size="sm" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getNotifyActionName(
  messagingChannelsData: GetMessagingChannelsResponse | undefined,
) {
  const connectedChannels = getConnectedRuleNotificationChannels(
    messagingChannelsData?.channels,
  );
  const providers =
    connectedChannels.length > 0
      ? connectedChannels.map((channel) => channel.provider)
      : (messagingChannelsData?.availableProviders ?? []);
  const providerNames = Array.from(
    new Set(providers.map(getMessagingProviderName)),
  );

  return providerNames.length > 0
    ? `Notify via ${formatProviderList(providerNames)}`
    : "Notify";
}

function formatProviderList(providerNames: string[]) {
  if (providerNames.length === 1) return providerNames[0];
  if (providerNames.length === 2) return providerNames.join(" or ");

  return `${providerNames.slice(0, -1).join(", ")}, or ${providerNames.at(-1)}`;
}
