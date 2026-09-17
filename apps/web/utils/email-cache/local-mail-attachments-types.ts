export type LocalMailAttachmentReference = {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  attachmentId: string;
  revision: string;
  filename: string;
  mimeType: string;
  reportedBytes?: number;
};

export type LocalMailAttachmentKey = [string, string, string, string];

export type LocalMailAttachmentFile = LocalMailAttachmentReference & {
  blob: Blob;
  byteSize: number;
  lastAccessedAt: number;
};

export type LocalMailAttachmentJob = LocalMailAttachmentReference & {
  reservationId: string;
  state: "pending" | "failed" | "complete";
  attempts: number;
  updatedAt: number;
};
