import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
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
import { getIntegrationActionLabelMessage } from "@/utils/mcp/tool-specs-messages";
import { useIntegrationActionsEnabled } from "@/hooks/useFeatureFlags";

const actionNames: Record<
  Exclude<ActionType, typeof ActionType.INTEGRATION>,
  MessageDescriptor
> = {
  [ActionType.LABEL]: msg`Label`,
  [ActionType.MOVE_FOLDER]: msg`Move to folder`,
  [ActionType.ARCHIVE]: msg`Archive`,
  [ActionType.DELETE]: msg`Delete`,
  [ActionType.DRAFT_EMAIL]: msg`Draft replies`,
  [ActionType.DRAFT_MESSAGING_CHANNEL]: msg`Draft replies`,
  [ActionType.REPLY]: msg`Send replies`,
  [ActionType.FORWARD]: msg`Forward`,
  [ActionType.MARK_READ]: msg`Mark as read`,
  [ActionType.STAR]: msg`Star`,
  [ActionType.MARK_SPAM]: msg`Mark as spam`,
  [ActionType.SEND_EMAIL]: msg`Send email`,
  [ActionType.CALL_WEBHOOK]: msg`Call webhook`,
  [ActionType.DIGEST]: msg`Add to digest`,
  [ActionType.NOTIFY_MESSAGING_CHANNEL]: msg`Notify`,
  [ActionType.NOTIFY_SENDER]: msg`Notify sender`,
};

const actionTooltips: Partial<Record<ActionType, MessageDescriptor>> = {
  [ActionType.CALL_WEBHOOK]: msg`For developers: trigger external integrations by sending email data to a custom URL`,
  [ActionType.DIGEST]: msg`Group emails together and receive them as a daily summary`,
};

export function AvailableActionsPanel() {
  const { t, i18n } = useLingui();
  const { emailAccountId, provider } = useAccount();
  const integrationActionsEnabled = useIntegrationActionsEnabled();
  const { data: messagingChannelsData } = useMessagingChannels(emailAccountId);
  const notifyActionName = getNotifyActionName(messagingChannelsData, i18n);

  return (
    <Card className="h-fit bg-slate-50 dark:bg-slate-900 hidden sm:block">
      <CardContent className="pt-4">
        <div className="grid gap-2">
          <ActionSection
            actions={[
              ...getAvailableActions(provider),
              ...getExtraActions({
                integrationActionsEnabled,
              }),
            ]}
            notifyActionName={notifyActionName}
            title={t`Available Actions`}
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
  const { i18n } = useLingui();
  return (
    <div>
      <SectionHeader>{title}</SectionHeader>
      <div className="grid gap-2 mt-1">
        {actions.map((actionType) => {
          const Icon = getActionIcon(actionType);
          const tooltipMessage = actionTooltips[actionType];
          const tooltip = tooltipMessage ? i18n._(tooltipMessage) : undefined;
          return (
            <div key={actionType} className="flex items-center gap-2">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="text-sm">
                {getActionName(actionType, notifyActionName, i18n)}
              </span>
              {tooltip && <TooltipExplanation text={tooltip} size="sm" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getActionName(
  actionType: ActionType,
  notifyActionName: string,
  i18n: I18n,
) {
  if (actionType === ActionType.NOTIFY_MESSAGING_CHANNEL)
    return notifyActionName;
  if (actionType === ActionType.INTEGRATION)
    return i18n._(getIntegrationActionLabelMessage());
  return i18n._(actionNames[actionType]);
}

function getNotifyActionName(
  messagingChannelsData: GetMessagingChannelsResponse | undefined,
  i18n: I18n,
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

  if (providerNames.length === 0) return i18n._(msg`Notify`);

  const providerList = new Intl.ListFormat(i18n.locale, {
    type: "disjunction",
  }).format(providerNames);
  return i18n._(msg`Notify on ${providerList}`);
}
