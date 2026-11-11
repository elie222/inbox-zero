import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
  getIntegrationActionSpec,
  type IntegrationArgSpec,
} from "@/utils/mcp/tool-specs";

// The English text in utils/mcp/tool-specs also feeds AI prompts, validation
// and stored history, so the UI keeps its translatable copies here.
const INTEGRATION_TOOL_MESSAGES: Record<
  string,
  {
    actionLabel: MessageDescriptor;
    args: Record<
      string,
      {
        label: MessageDescriptor;
        placeholder?: MessageDescriptor;
        options?: Record<string, MessageDescriptor>;
      }
    >;
  }
> = {
  "todoist:add-tasks": {
    actionLabel: msg`Add Todoist task`,
    args: {
      content: {
        label: msg`Task`,
        placeholder: msg`AI writes a short action item from the email`,
      },
      description: {
        label: msg`Description`,
        placeholder: msg`AI writes one line of context`,
      },
      projectId: { label: msg`Project` },
      dueString: {
        label: msg`Due date`,
        options: {
          ai: msg`AI decides from email`,
          none: msg`No due date`,
          today: msg`Today`,
          tomorrow: msg`Tomorrow`,
          "in-7-days": msg`In a week`,
        },
      },
    },
  },
};

const GENERIC_INTEGRATION_ACTION_LABEL = msg`Add to integration`;

export function getIntegrationActionLabelMessage(action?: {
  integrationName?: string | null;
  integrationToolName?: string | null;
}): MessageDescriptor {
  const spec = getIntegrationActionSpec(action);
  if (!spec) return GENERIC_INTEGRATION_ACTION_LABEL;
  return (
    INTEGRATION_TOOL_MESSAGES[`${spec.integration}:${spec.tool}`]
      ?.actionLabel ?? { id: spec.actionLabel }
  );
}

export function getIntegrationArgText(
  i18n: I18n,
  {
    integration,
    tool,
    arg,
  }: { integration: string; tool: string; arg: IntegrationArgSpec },
) {
  const messages =
    INTEGRATION_TOOL_MESSAGES[`${integration}:${tool}`]?.args[arg.key];
  const placeholder = messages?.placeholder ?? null;

  return {
    label: messages ? i18n._(messages.label) : arg.label,
    placeholder: placeholder ? i18n._(placeholder) : arg.placeholder,
    optionLabel: (option: { value: string; label: string }) => {
      const optionMessage = messages?.options?.[option.value];
      return optionMessage ? i18n._(optionMessage) : option.label;
    },
  };
}
