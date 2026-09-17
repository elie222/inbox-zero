import type { LocalMailSyncRequest } from "@/utils/actions/local-mail-sync.validation";

export type LocalMailSyncState = {
  emailAccountId: string;
  generation: string;
  fence: number;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  strategy?: "account-history" | "folder-delta";
  retentionAfter: number;
  retentionRevision?: number;
  retainedAfter: number;
  snapshotBefore: number;
  nextWindowSize: number;
  excludedFolderIds: string[];
  folders: Record<
    string,
    {
      after: number;
      before: number;
      round: number;
      cursor?: string;
      seen: number;
      recovering?: boolean;
      bootstrapComplete?: boolean;
      removed?: boolean;
    }
  >;
  discoveryGeneration: number;
  discoveryComplete: boolean;
  coverage?: { after: number; before: number };
  recovering?: boolean;
  unsupported?: boolean;
  storagePaused?: boolean;
  lastSyncedAt?: number;
  nextAttemptAt: number;
};

export type LocalMailSyncJob = {
  emailAccountId: string;
  id: string;
  kind:
    | "capabilities"
    | "current"
    | "window"
    | "discovery"
    | "delta"
    | "lookup"
    | "sweep"
    | "retained"
    | "bootstrap";
  priority: number;
  nextAttemptAt: number;
  request: LocalMailSyncRequest;
  window?: {
    after: number;
    before: number;
    generation: string;
    startedAt: number;
    folderId?: string;
    historyCursor?: string;
    replay: boolean;
    recovery?: boolean;
    requiredRound?: number;
    membershipOnly?: boolean;
  };
  retainedScope?: { after: number; before: number; part: "older" | "future" };
  pending?: {
    ids: string[];
    offset: number;
    phase: "history-backfill" | "history-changes";
    cursor?: string;
    historyCursor?: string;
    hasMore: boolean;
  };
  sweepAfter?: { receivedAt: number; messageId: string };
  discovery?: { generation: number; parentFolderId?: string };
  lookupFolderIds?: string[];
  retainHistoricalImport?: boolean;
  attempts: number;
};

export type LocalMailSyncSeen = {
  emailAccountId: string;
  generation: string;
  messageId: string;
};

export const LOCAL_MAIL_HISTORY_AFTER = -8_640_000_000_000_000;
export const LOCAL_MAIL_FIRST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function getLocalMailWindowAfter(
  retentionAfter: number,
  before: number,
  size: number,
) {
  const after = Math.max(retentionAfter, before - size);
  // A final unbounded tail includes imported old mail without emitting provider
  // date filters with unsupported expanded-year timestamp syntax.
  return retentionAfter === LOCAL_MAIL_HISTORY_AFTER && after < 0
    ? LOCAL_MAIL_HISTORY_AFTER
    : after;
}

export function getLocalMailSyncRetention(
  state: LocalMailSyncState,
  job: LocalMailSyncJob,
) {
  if (state.retentionRevision === undefined) return;
  const purpose =
    job.kind === "window" || job.kind === "sweep" || job.kind === "bootstrap"
      ? ("backfill" as const)
      : ("current" as const);
  return { revision: state.retentionRevision, purpose };
}
