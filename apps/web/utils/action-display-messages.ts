import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { ActionType, type MessagingProvider } from "@/generated/prisma/enums";
import { getActionLabelName } from "@/utils/action-display";
import { getIntegrationActionDisplayValue } from "@/utils/mcp/tool-specs";
import { getIntegrationActionLabelMessage } from "@/utils/mcp/tool-specs-messages";
import { getMessagingProviderName } from "@/utils/messaging/platforms";
import { truncate } from "@/utils/string";
import { getEmailTerminologyMessages } from "@/utils/terminology-messages";

// Translated copy of getActionDisplay in utils/action-display, which chat bots
// also call on the server and so stays English.
export function getActionDisplayText(
  action: {
    type: ActionType;
    label?: string | null;
    labelId?: string | null;
    folderName?: string | null;
    content?: string | null;
    to?: string | null;
    notificationDestination?: string | null;
    messagingChannel?: { provider: MessagingProvider } | null;
    integrationName?: string | null;
    integrationToolName?: string | null;
    integrationArgs?: unknown;
  },
  provider: string,
  labels: Array<{ id: string; name: string }>,
  i18n: I18n,
): string {
  switch (action.type) {
    case ActionType.DRAFT_EMAIL:
    case ActionType.DRAFT_MESSAGING_CHANNEL:
      if (action.content) {
        const content = truncate(action.content, 10);
        return i18n._(msg`Draft Reply: ${content}`);
      }
      return i18n._(msg`Draft Reply`);
    case ActionType.LABEL: {
      const labelAction = i18n._(
        getEmailTerminologyMessages(provider).label.action,
      );
      const labelName = getActionLabelName(action, labels);
      if (!labelName) return labelAction;
      // ICU reads '{x}' as literal text, so the quotes go in the value.
      const quotedLabelName = `'${truncate(labelName, 15)}'`;
      return i18n._(msg`${labelAction} as ${quotedLabelName}`);
    }
    case ActionType.ARCHIVE:
      return i18n._(msg`Archive`);
    case ActionType.DELETE:
      return i18n._(msg`Delete`);
    case ActionType.MARK_READ:
      return i18n._(msg`Mark Read`);
    case ActionType.STAR:
      return i18n._(msg`Star`);
    case ActionType.MARK_SPAM:
      return i18n._(msg`Mark Spam`);
    case ActionType.REPLY:
      return i18n._(msg`Reply`);
    case ActionType.SEND_EMAIL: {
      if (!action.to) return i18n._(msg`Send Email`);
      const to = truncate(action.to, 8);
      return i18n._(msg`Send Email to ${to}`);
    }
    case ActionType.FORWARD: {
      if (!action.to) return i18n._(msg`Forward`);
      const to = truncate(action.to, 8);
      return i18n._(msg`Forward to ${to}`);
    }
    case ActionType.MOVE_FOLDER: {
      if (!action.folderName) return i18n._(msg`Move to folder`);
      const quotedFolderName = `'${action.folderName}'`;
      return i18n._(msg`Move to ${quotedFolderName} folder`);
    }
    case ActionType.DIGEST:
      return i18n._(msg`Digest`);
    case ActionType.CALL_WEBHOOK:
      return i18n._(msg`Call Webhook`);
    case ActionType.NOTIFY_MESSAGING_CHANNEL: {
      if (action.messagingChannel?.provider) {
        const providerName = getMessagingProviderName(
          action.messagingChannel.provider,
        );
        return i18n._(msg`Notify on ${providerName}`);
      }
      if (!action.notificationDestination) return i18n._(msg`Notify`);
      const destination = truncate(action.notificationDestination, 18);
      return i18n._(msg`Notify on ${destination}`);
    }
    case ActionType.NOTIFY_SENDER:
      return i18n._(msg`Notify Sender`);
    case ActionType.INTEGRATION: {
      const label = i18n._(getIntegrationActionLabelMessage(action));
      const displayValue = getIntegrationActionDisplayValue(action);
      if (!displayValue) return label;
      const truncatedValue = truncate(displayValue, 20);
      return `${label}: '${truncatedValue}'`;
    }
    default: {
      const exhaustiveCheck: never = action.type;
      return exhaustiveCheck;
    }
  }
}
