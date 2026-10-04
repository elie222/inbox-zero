import { createHash } from "node:crypto";
import prisma from "@/utils/prisma";
import { ActionType } from "@/generated/prisma/enums";
import { canonicalizeEmailAddress } from "@/utils/email";
import { SafeError } from "@/utils/error";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage, RuleWithActions } from "@/utils/types";

const prefix = "fastmail-filter-";
export function isManagedFastmailFilter(rule: { id: string }) {
  return rule.id.startsWith(prefix);
}

export async function getFastmailFilters(emailAccountId: string) {
  return prisma.rule.findMany({
    where: { emailAccountId, id: { startsWith: prefix }, enabled: true },
    include: { actions: true },
  });
}

export async function saveFastmailFilter(
  emailAccountId: string,
  from: string,
  labelIds: string[],
  archive: boolean,
) {
  const sender = canonicalizeEmailAddress(from);
  if (!sender) throw new SafeError("Enter a valid sender email address.");
  const id =
    prefix +
    createHash("sha256").update(`${emailAccountId}\0${sender}`).digest("hex");
  const actions = [...new Set(labelIds)].map((labelId) => ({
    type: ActionType.LABEL,
    labelId,
    emailAccountId,
  }));
  const createActions = [
    ...actions,
    ...(archive ? [{ type: ActionType.ARCHIVE, emailAccountId }] : []),
  ];
  await prisma.rule.upsert({
    where: { id_emailAccountId: { id, emailAccountId } },
    create: {
      id,
      emailAccountId,
      name: `Fastmail sender: ${sender}`,
      from: sender,
      actions: { create: createActions },
    },
    update: {
      from: sender,
      enabled: true,
      actions: { deleteMany: {}, create: createActions },
    },
  });
}

export async function deleteFastmailFilter(emailAccountId: string, id: string) {
  if (!id.startsWith(prefix))
    throw new SafeError("Only Inbox Zero managed filters can be removed here.");
  await prisma.rule.deleteMany({ where: { id, emailAccountId } });
}

export async function applyFastmailFilters(
  message: ParsedMessage,
  rules: RuleWithActions[],
  provider: EmailProvider,
) {
  if (!message.labelIds?.includes("INBOX") || provider.isSentMessage(message))
    return;
  const sender = canonicalizeEmailAddress(message.headers.from);
  for (const rule of rules) {
    if (
      !isManagedFastmailFilter(rule) ||
      !rule.enabled ||
      canonicalizeEmailAddress(rule.from ?? "") !== sender
    )
      continue;
    for (const action of rule.actions) {
      if (action.type === ActionType.ARCHIVE)
        await provider.archiveMessage(message.id);
      if (action.type === ActionType.LABEL && action.labelId)
        await provider.labelMessage({
          messageId: message.id,
          labelId: action.labelId,
          labelName: action.label,
        });
    }
  }
}
