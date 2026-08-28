export type TransactionalEmailAttachment = {
  content?: string;
  contentId?: string;
  contentType?: string;
  filename?: string | false;
  path?: string;
};

export type TransactionalEmailMessage = {
  attachments?: TransactionalEmailAttachment[];
  from: string;
  headers?: Record<string, string>;
  html: string;
  replyTo?: string;
  subject: string;
  tags?: { name: string; value: string }[];
  text: string;
  to: string;
};

export type TransactionalEmailSendOptions = {
  idempotencyKey?: string;
  test?: boolean;
};

export type TransactionalEmailProviderResult = {
  messageId?: string;
};

export interface TransactionalEmailProvider {
  send(
    message: TransactionalEmailMessage,
    options?: TransactionalEmailSendOptions,
  ): Promise<TransactionalEmailProviderResult>;
}
