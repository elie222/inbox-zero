import "server-only";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailThread } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import {
  getAuthorizedConversation,
  type ConversationActor,
} from "@/utils/team-comments/access";

const inFlight = new Map<string, Promise<EmailThread>>();

export async function getSharedMessages(
  actor: ConversationActor,
  conversationId: string,
  logger: Logger,
) {
  const { conversation } = await getAuthorizedConversation(
    actor,
    conversationId,
  );
  const publisherEmailAccountId = conversation.publisherEmailAccountId;
  const account = conversation.publisherEmailAccount;
  if (!publisherEmailAccountId || !account || account.account.disconnectedAt)
    return { status: "unavailable" as const, reason: "reconnect" as const };
  try {
    const thread = await fetchCompleteThread({
      emailAccountId: publisherEmailAccountId,
      provider: account.account.provider,
      providerConversationId: conversation.providerConversationId,
      logger,
    });
    const latest = await getAuthorizedConversation(actor, conversationId);
    if (latest.conversation.generation !== conversation.generation)
      throw new Error("Conversation access changed during provider read");
    return {
      status: "available" as const,
      complete: true,
      messages: getVisibleMessages(
        thread.messages,
        conversation.providerConversationId,
      ).map((message, index) =>
        projectMessage(message, index, conversationId, actor.memberId),
      ),
    };
  } catch (error) {
    await getAuthorizedConversation(actor, conversationId);
    const reason = classifyContentError(error);
    logger.warn("Shared conversation email unavailable", { reason });
    logger.trace("Shared conversation email unavailable details", { error });
    return {
      status: "unavailable" as const,
      reason,
    };
  }
}

export async function getSharedAttachment(
  actor: ConversationActor,
  input: {
    conversationId: string;
    attachmentRef: string;
    logger: Logger;
  },
) {
  const { conversation } = await getAuthorizedConversation(
    actor,
    input.conversationId,
  );
  const match = /^(\d+):(\d+)$/.exec(input.attachmentRef);
  if (
    !match ||
    !conversation.publisherEmailAccountId ||
    !conversation.publisherEmailAccount
  )
    return null;
  const thread = await fetchCompleteThread({
    emailAccountId: conversation.publisherEmailAccountId,
    provider: conversation.publisherEmailAccount.account.provider,
    providerConversationId: conversation.providerConversationId,
    logger: input.logger,
  });
  const messages = getVisibleMessages(
    thread.messages,
    conversation.providerConversationId,
  );
  const message = messages[Number(match[1])];
  const attachments = message
    ? [...(message.attachments ?? []), ...message.inline]
    : [];
  const attachment = attachments[Number(match[2])];
  if (!message || !attachment) return null;
  const provider = await createEmailProvider({
    emailAccountId: conversation.publisherEmailAccountId,
    provider: conversation.publisherEmailAccount.account.provider,
    logger: input.logger,
  });
  const stream = await provider.getAttachmentStream(
    message.id,
    attachment.attachmentId,
  );
  const latest = await getAuthorizedConversation(actor, input.conversationId);
  if (latest.conversation.generation !== conversation.generation) return null;
  return {
    stream,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
  };
}

function projectMessage(
  message: ParsedMessage,
  index: number,
  conversationId: string,
  memberId: string,
) {
  const attachments = [...(message.attachments ?? []), ...message.inline];
  const safeAttachments = attachments.map((attachment, attachmentIndex) => ({
    ref: `${index}:${attachmentIndex}`,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    url: `/api/team-comments/conversations/${conversationId}/attachments/${index}:${attachmentIndex}?memberId=${encodeURIComponent(memberId)}`,
  }));
  const html = message.textHtml
    ? sanitizeSharedHtml(
        message.textHtml,
        message,
        index,
        conversationId,
        memberId,
      )
    : null;
  return {
    ref: String(index),
    from: message.headers.from,
    to: message.headers.to,
    cc: message.headers.cc ?? "",
    subject: message.headers.subject,
    date: message.date,
    text: message.textPlain ?? "",
    html,
    attachments: safeAttachments,
  };
}

function sanitizeSharedHtml(
  html: string,
  message: ParsedMessage,
  index: number,
  conversationId: string,
  memberId: string,
) {
  const window = new JSDOM("").window;
  try {
    const purifier = createDOMPurify(
      window as unknown as Parameters<typeof createDOMPurify>[0],
    );
    const sanitized = purifier.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_ATTR: ["style", "srcset", "poster", "background"],
      FORBID_TAGS: [
        "form",
        "input",
        "button",
        "select",
        "textarea",
        "iframe",
        "object",
        "embed",
        "script",
      ],
    });
    const document = new JSDOM(sanitized).window.document;
    for (const image of document.querySelectorAll("img")) {
      const source = image.getAttribute("src") ?? "";
      if (!source.toLowerCase().startsWith("cid:")) {
        image.removeAttribute("src");
        continue;
      }
      const cid = source.slice(4).replace(/^<|>$/g, "").toLowerCase();
      const inlineIndex = message.inline.findIndex(
        (attachment) =>
          attachment.headers["content-id"]
            .replace(/^<|>$/g, "")
            .toLowerCase() === cid,
      );
      if (inlineIndex < 0) {
        image.removeAttribute("src");
      } else {
        image.setAttribute(
          "src",
          `/api/team-comments/conversations/${conversationId}/attachments/${index}:${(message.attachments?.length ?? 0) + inlineIndex}?memberId=${encodeURIComponent(memberId)}`,
        );
      }
    }
    return document.body.innerHTML;
  } finally {
    window.close();
  }
}

function getVisibleMessages(
  messages: EmailThread["messages"],
  providerConversationId: string,
) {
  return messages.filter(
    (message) =>
      message.threadId === providerConversationId && !isDraft(message),
  );
}

async function fetchCompleteThread(input: {
  emailAccountId: string;
  provider: string;
  providerConversationId: string;
  logger: Logger;
}) {
  const key = `${input.emailAccountId}:${input.providerConversationId}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const provider = await createEmailProvider({
      emailAccountId: input.emailAccountId,
      provider: input.provider,
      logger: input.logger,
    });
    return provider.getThread(input.providerConversationId, { complete: true });
  })();
  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  }
}

function isDraft(message: ParsedMessage) {
  return message.labelIds?.includes("DRAFT") ?? false;
}

function classifyContentError(
  error: unknown,
): "rate-limited" | "reconnect" | "missing" | "unknown" {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number(error.statusCode)
      : undefined;
  if (status === 429) return "rate-limited";
  if (status === 401 || status === 403) return "reconnect";
  if (status === 404) return "missing";
  return "unknown";
}
