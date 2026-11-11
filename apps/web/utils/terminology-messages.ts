import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { isMicrosoftProvider } from "@/utils/email/provider-types";

// The English terms in utils/terminology also feed server-side text (chat
// bots, example prompts), so the UI keeps its translatable copies here.
const OUTLOOK_TERMINOLOGY = {
  label: {
    singular: msg`category`,
    plural: msg`categories`,
    singularCapitalized: msg`Category`,
    pluralCapitalized: msg`Categories`,
    action: msg({ message: "Categorize", context: "action" }),
  },
} satisfies EmailTerminologyMessages;

const GMAIL_TERMINOLOGY = {
  label: {
    singular: msg`label`,
    plural: msg`labels`,
    singularCapitalized: msg`Label`,
    pluralCapitalized: msg`Labels`,
    action: msg({ message: "Label", context: "action" }),
  },
} satisfies EmailTerminologyMessages;

export function getEmailTerminologyMessages(
  provider: string,
): EmailTerminologyMessages {
  return isMicrosoftProvider(provider)
    ? OUTLOOK_TERMINOLOGY
    : GMAIL_TERMINOLOGY;
}

type EmailTerminologyMessages = {
  label: {
    singular: MessageDescriptor;
    plural: MessageDescriptor;
    singularCapitalized: MessageDescriptor;
    pluralCapitalized: MessageDescriptor;
    action: MessageDescriptor;
  };
};
