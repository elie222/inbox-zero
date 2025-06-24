import type { gmail_v1 } from "@googleapis/gmail";
import type { OutlookClient } from "@/utils/outlook/client";
import type { ParsedMessage } from "@/utils/types";
import { parseMessage } from "@/utils/mail";
import {
  getMessage as getGmailMessage,
  getMessages as getGmailMessages,
} from "@/utils/gmail/message";
import {
  getMessage as getOutlookMessage,
  getMessages as getOutlookMessages,
} from "@/utils/outlook/message";
import {
  getLabels as getGmailLabels,
  getLabelById as getGmailLabelById,
  createLabel as createGmailLabel,
  getOrCreateInboxZeroLabel as getOrCreateGmailInboxZeroLabel,
} from "@/utils/gmail/label";
import {
  getLabels as getOutlookLabels,
  createLabel as createOutlookLabel,
  getOrCreateInboxZeroLabel as getOrCreateOutlookInboxZeroLabel,
} from "@/utils/outlook/label";
import { labelVisibility, messageVisibility } from "@/utils/gmail/constants";
import {
  getGmailClientForEmail,
  getOutlookClientForEmail,
} from "@/utils/account";
import { inboxZeroLabels, type InboxZeroLabel } from "@/utils/label";
import { getMessageByRfc822Id } from "@/utils/gmail/message";
import {
  draftEmail as gmailDraftEmail,
  forwardEmail as gmailForwardEmail,
  replyToEmail as gmailReplyToEmail,
  sendEmailWithPlainText as gmailSendEmailWithPlainText,
} from "@/utils/gmail/mail";
import {
  draftEmail as outlookDraftEmail,
  forwardEmail as outlookForwardEmail,
  replyToEmail as outlookReplyToEmail,
  sendEmailWithPlainText as outlookSendEmailWithPlainText,
} from "@/utils/outlook/mail";
import {
  archiveThread as gmailArchiveThread,
  getOrCreateLabel as gmailGetOrCreateLabel,
  labelMessage as gmailLabelMessage,
  markReadThread as gmailMarkReadThread,
  removeThreadLabel as gmailRemoveThreadLabel,
} from "@/utils/gmail/label";
import {
  archiveThread as outlookArchiveThread,
  getOrCreateLabel as outlookGetOrCreateLabel,
  labelMessage as outlookLabelMessage,
  markReadThread as outlookMarkReadThread,
} from "@/utils/outlook/label";
import { markSpam as gmailMarkSpam } from "@/utils/gmail/spam";
import { markSpam as outlookMarkSpam } from "@/utils/outlook/spam";
import { handlePreviousDraftDeletion } from "@/utils/ai/choose-rule/draft-management";
import { createScopedLogger } from "@/utils/logger";
import { getThreadMessages as getGmailThreadMessages } from "@/utils/gmail/thread";
import { getThreadMessages as getOutlookThreadMessages } from "@/utils/outlook/thread";
import { getMessagesBatch } from "@/utils/gmail/message";
import { getAccessTokenFromClient } from "@/utils/gmail/client";
import { getAwaitingReplyLabel as getGmailAwaitingReplyLabel } from "@/utils/reply-tracker/label";
import {
  getDraft as getGmailDraft,
  deleteDraft as deleteGmailDraft,
} from "@/utils/gmail/draft";
import {
  getDraft as getOutlookDraft,
  deleteDraft as deleteOutlookDraft,
} from "@/utils/outlook/draft";

const logger = createScopedLogger("email-provider");

export interface EmailThread {
  id: string;
  messages: ParsedMessage[];
  snippet: string;
  historyId?: string;
}

export interface EmailLabel {
  id: string;
  name: string;
  type: string;
  threadsTotal?: number;
}

export interface EmailProvider {
  getThreads(folderId?: string): Promise<EmailThread[]>;
  getThread(threadId: string): Promise<EmailThread>;
  getLabels(): Promise<EmailLabel[]>;
  getLabelById(labelId: string): Promise<EmailLabel | null>;
  getMessage(messageId: string): Promise<ParsedMessage>;
  getMessages(query?: string, maxResults?: number): Promise<ParsedMessage[]>;
  getThreadMessages(threadId: string): Promise<ParsedMessage[]>;
  getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]>;
  archiveThread(threadId: string, ownerEmail: string): Promise<void>;
  labelMessage(messageId: string, labelName: string): Promise<void>;
  removeThreadLabel(threadId: string, labelId: string): Promise<void>;
  getAwaitingReplyLabel(): Promise<string>;
  draftEmail(
    email: ParsedMessage,
    args: { to?: string; subject?: string; content: string },
    executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }>;
  replyToEmail(email: ParsedMessage, content: string): Promise<void>;
  sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
  }): Promise<void>;
  forwardEmail(
    email: ParsedMessage,
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void>;
  markSpam(threadId: string): Promise<void>;
  markRead(threadId: string): Promise<void>;
  getDraft(draftId: string): Promise<ParsedMessage | null>;
  deleteDraft(draftId: string): Promise<void>;
  createLabel(name: string, description?: string): Promise<EmailLabel>;
  getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel>;
  getOriginalMessage(
    originalMessageId: string | undefined,
  ): Promise<ParsedMessage | null>;
}

export class GmailProvider implements EmailProvider {
  private client: gmail_v1.Gmail;

  constructor(client: gmail_v1.Gmail) {
    this.client = client;
  }

  async getThreads(folderId?: string): Promise<EmailThread[]> {
    const response = await this.client.users.threads.list({
      userId: "me",
      q: folderId ? `in:${folderId}` : undefined,
    });

    const threads = response.data.threads || [];
    const threadPromises = threads.map((thread) => this.getThread(thread.id!));
    return Promise.all(threadPromises);
  }

  async getThread(threadId: string): Promise<EmailThread> {
    const response = await this.client.users.threads.get({
      userId: "me",
      id: threadId,
    });

    const messages = response.data.messages || [];
    const messagePromises = messages.map((message) =>
      this.getMessage(message.id!),
    );

    return {
      id: threadId,
      messages: await Promise.all(messagePromises),
      snippet: response.data.snippet || "",
      historyId: response.data.historyId || undefined,
    };
  }

  async getLabels(): Promise<EmailLabel[]> {
    const labels = await getGmailLabels(this.client);
    return (labels || [])
      .filter(
        (label) =>
          label.type === "user" &&
          label.labelListVisibility !== labelVisibility.labelHide,
      )
      .map((label) => ({
        id: label.id!,
        name: label.name!,
        type: label.type!,
        threadsTotal: label.threadsTotal || undefined,
      }));
  }

  async getLabelById(labelId: string): Promise<EmailLabel | null> {
    try {
      const label = await getGmailLabelById({
        gmail: this.client,
        id: labelId,
      });
      return {
        id: label.id!,
        name: label.name!,
        type: label.type!,
        threadsTotal: label.threadsTotal || undefined,
      };
    } catch (error) {
      return null;
    }
  }

  async getMessage(messageId: string): Promise<ParsedMessage> {
    const message = await getGmailMessage(messageId, this.client, "full");
    return parseMessage(message);
  }

  async getMessages(
    query?: string,
    maxResults: number = 50,
  ): Promise<ParsedMessage[]> {
    const response = await getGmailMessages(this.client, { query, maxResults });
    const messages = response.messages || [];

    const messagePromises = messages.map((message) =>
      this.getMessage(message.id!),
    );

    return Promise.all(messagePromises);
  }

  async archiveThread(threadId: string, ownerEmail: string): Promise<void> {
    await gmailArchiveThread({
      gmail: this.client,
      threadId,
      ownerEmail,
      actionSource: "automation",
    });
  }

  async labelMessage(messageId: string, labelName: string): Promise<void> {
    const label = await gmailGetOrCreateLabel({
      gmail: this.client,
      name: labelName,
    });
    if (!label.id)
      throw new Error("Label not found and unable to create label");
    await gmailLabelMessage({
      gmail: this.client,
      messageId,
      addLabelIds: [label.id],
    });
  }

  async getDraft(draftId: string): Promise<ParsedMessage | null> {
    return getGmailDraft(draftId, this.client);
  }

  async deleteDraft(draftId: string): Promise<void> {
    await deleteGmailDraft(this.client, draftId);
  }

  async draftEmail(
    email: ParsedMessage,
    args: { to?: string; subject?: string; content: string },
    executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }> {
    if (executedRule) {
      // Run draft creation and previous draft deletion in parallel
      const [result] = await Promise.all([
        gmailDraftEmail(this.client, email, args),
        handlePreviousDraftDeletion({
          client: this,
          executedRule,
          logger,
        }),
      ]);
      return { draftId: result.data.message?.id || "" };
    } else {
      const result = await gmailDraftEmail(this.client, email, args);
      return { draftId: result.data.message?.id || "" };
    }
  }

  async replyToEmail(email: ParsedMessage, content: string): Promise<void> {
    await gmailReplyToEmail(this.client, email, content);
  }

  async sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
  }): Promise<void> {
    await gmailSendEmailWithPlainText(this.client, args);
  }

  async forwardEmail(
    email: ParsedMessage,
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void> {
    await gmailForwardEmail(this.client, { messageId: email.id, ...args });
  }

  async markSpam(threadId: string): Promise<void> {
    await gmailMarkSpam({ gmail: this.client, threadId });
  }

  async markRead(threadId: string): Promise<void> {
    await gmailMarkReadThread({
      gmail: this.client,
      threadId,
      read: true,
    });
  }

  async getThreadMessages(threadId: string): Promise<ParsedMessage[]> {
    return getGmailThreadMessages(threadId, this.client);
  }

  async getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]> {
    return getMessagesBatch({
      messageIds,
      accessToken: getAccessTokenFromClient(this.client),
    });
  }

  async removeThreadLabel(threadId: string, labelId: string): Promise<void> {
    await gmailRemoveThreadLabel(this.client, threadId, labelId);
  }

  async getAwaitingReplyLabel(): Promise<string> {
    return getGmailAwaitingReplyLabel(this.client);
  }

  async createLabel(name: string, description?: string): Promise<EmailLabel> {
    const label = await createGmailLabel({
      gmail: this.client,
      name,
      messageListVisibility: messageVisibility.show,
      labelListVisibility: labelVisibility.labelShow,
    });

    return {
      id: label.id!,
      name: label.name!,
      type: label.type!,
    };
  }

  async getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel> {
    const label = await getOrCreateGmailInboxZeroLabel({
      gmail: this.client,
      key,
    });
    return {
      id: label.id!,
      name: label.name!,
      type: label.type!,
      threadsTotal: label.threadsTotal || undefined,
    };
  }

  async getOriginalMessage(
    originalMessageId: string | undefined,
  ): Promise<ParsedMessage | null> {
    if (!originalMessageId) return null;
    const originalMessage = await getMessageByRfc822Id(
      originalMessageId,
      this.client,
    );
    if (!originalMessage) return null;
    return parseMessage(originalMessage);
  }
}

export class OutlookProvider implements EmailProvider {
  private client: OutlookClient;

  constructor(client: OutlookClient) {
    this.client = client;
  }

  async getThreads(folderId?: string): Promise<EmailThread[]> {
    const messages = await this.getMessages(folderId);
    const threadMap = new Map<string, ParsedMessage[]>();

    messages.forEach((message) => {
      const threadId = message.threadId;
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      threadMap.get(threadId)!.push(message);
    });

    return Array.from(threadMap.entries()).map(([id, messages]) => ({
      id,
      messages,
      snippet: messages[0]?.snippet || "",
    }));
  }

  async getThread(threadId: string): Promise<EmailThread> {
    const messages = await this.getMessages(`conversationId:${threadId}`);
    return {
      id: threadId,
      messages,
      snippet: messages[0]?.snippet || "",
    };
  }

  async getLabels(): Promise<EmailLabel[]> {
    const labels = await getOutlookLabels(this.client);
    return labels.map((label) => ({
      id: label.id || "",
      name: label.displayName || "",
      type: "user",
    }));
  }

  async getLabelById(labelId: string): Promise<EmailLabel | null> {
    const labels = await this.getLabels();
    return labels.find((label) => label.id === labelId) || null;
  }

  async getMessage(messageId: string): Promise<ParsedMessage> {
    return getOutlookMessage(messageId, this.client);
  }

  async getMessages(
    query?: string,
    maxResults: number = 50,
  ): Promise<ParsedMessage[]> {
    const response = await getOutlookMessages(this.client, {
      query,
      maxResults,
    });
    return response.messages || [];
  }

  async archiveThread(threadId: string, ownerEmail: string): Promise<void> {
    await outlookArchiveThread({
      client: this.client,
      threadId,
      ownerEmail,
      actionSource: "automation",
    });
  }

  async labelMessage(messageId: string, labelName: string): Promise<void> {
    const label = await outlookGetOrCreateLabel({
      client: this.client,
      name: labelName,
    });
    await outlookLabelMessage({
      client: this.client,
      messageId,
      categories: [label.displayName || ""],
    });
  }

  async getDraft(draftId: string): Promise<ParsedMessage | null> {
    return getOutlookDraft(draftId, this.client);
  }

  async deleteDraft(draftId: string): Promise<void> {
    await deleteOutlookDraft(this.client, draftId);
  }

  async draftEmail(
    email: ParsedMessage,
    args: { to?: string; subject?: string; content: string },
    executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }> {
    if (executedRule) {
      // Run draft creation and previous draft deletion in parallel
      const [result] = await Promise.all([
        outlookDraftEmail(this.client, email, args),
        handlePreviousDraftDeletion({
          client: this,
          executedRule,
          logger,
        }),
      ]);
      return { draftId: result.id };
    } else {
      const result = await outlookDraftEmail(this.client, email, args);
      return { draftId: result.id };
    }
  }

  async replyToEmail(email: ParsedMessage, content: string): Promise<void> {
    await outlookReplyToEmail(this.client, email, content);
  }

  async sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
  }): Promise<void> {
    await outlookSendEmailWithPlainText(this.client, args);
  }

  async forwardEmail(
    email: ParsedMessage,
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void> {
    await outlookForwardEmail(this.client, { messageId: email.id, ...args });
  }

  async markSpam(threadId: string): Promise<void> {
    await outlookMarkSpam(this.client, threadId);
  }

  async markRead(threadId: string): Promise<void> {
    await outlookMarkReadThread({
      client: this.client,
      threadId,
      read: true,
    });
  }

  async getThreadMessages(threadId: string): Promise<ParsedMessage[]> {
    return getOutlookThreadMessages(threadId, this.client);
  }

  async getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]> {
    return this.getThreadMessages(messageIds[0]);
  }

  async removeThreadLabel(threadId: string, labelId: string): Promise<void> {
    // For Outlook, we don't need to do anything with labels at this point
    return Promise.resolve();
  }

  async getAwaitingReplyLabel(): Promise<string> {
    // For Outlook, we don't need to do anything with labels at this point
    return Promise.resolve("");
  }

  async createLabel(name: string, description?: string): Promise<EmailLabel> {
    const label = await createOutlookLabel({
      client: this.client,
      name,
    });

    return {
      id: label.id,
      name: label.displayName || label.id,
      type: "user",
    };
  }

  async getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel> {
    const label = await getOrCreateOutlookInboxZeroLabel({
      client: this.client,
      key,
    });
    return {
      id: label.id,
      name: label.displayName || label.id,
      type: "user",
    };
  }

  async getOriginalMessage(
    originalMessageId: string | undefined,
  ): Promise<ParsedMessage | null> {
    if (!originalMessageId) return null;
    try {
      return await this.getMessage(originalMessageId);
    } catch (error) {
      return null;
    }
  }
}

export async function createEmailProvider({
  emailAccountId,
  provider,
}: {
  emailAccountId: string;
  provider: string;
}): Promise<EmailProvider> {
  if (provider === "google") {
    const client = await getGmailClientForEmail({ emailAccountId });
    return new GmailProvider(client);
  } else if (provider === "microsoft-entra-id") {
    const client = await getOutlookClientForEmail({ emailAccountId });
    return new OutlookProvider(client);
  }
  throw new Error(`Unsupported provider: ${provider}`);
}
