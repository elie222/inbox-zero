export type LocalMailRetentionPolicy = {
  emailAccountId: string;
  generation: string;
  revision: number;
  requestedAfter: number;
  automaticAfter: number;
  exceptionSweepAfter?: number;
};

export type LocalMailEvictionJob = {
  kind?: "exceptions" | "clear-downloads";
  cleanupGeneration?: string;
  emailAccountId: string;
  generation: string;
  revision: number;
  after: number;
  before: number;
  startedAt: number;
  protectedRecentAfter: number;
  protectedFetchedAfter: number;
  cursor?: { receivedAt: number; messageId: string };
  stage: "remove-source" | "drain-index";
  removedBytes: number;
};

export type LocalMailEvictedMessage = {
  emailAccountId: string;
  messageId: string;
  threadId: string;
  receivedAt: number;
  evictedAt: number;
  revision: number;
  byteSize: number;
};

export type LocalMailThreadProtection = {
  emailAccountId: string;
  threadId: string;
  generation: string;
  reservations?: Record<string, { bytes: number; expiresAt: number }>;
  recentlyOpenedUntil?: number;
};
