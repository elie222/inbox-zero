import type { LocalMailSyncRequest } from "@/utils/actions/local-mail-sync.validation";
import type {
  getGmailMailBackfillPage,
  getGmailMailChangesPage,
  hydrateGmailMailMessages,
} from "@/utils/gmail/local-mail-sync";
import type {
  getOutlookMailFoldersPage,
  getOutlookMailFolderChangesPage,
  getOutlookMailBackfillPage,
  getOutlookLocalMailMessage,
} from "@/utils/outlook/local-mail-sync";

type Results = {
  capabilities: {
    strategy: "account-history" | "folder-delta";
    excludedFolderIds: string[];
    maxHydrationMessages: number;
  };
  "history-baseline": { cursor: string };
  "history-backfill": Awaited<ReturnType<typeof getGmailMailBackfillPage>>;
  "history-changes": Exclude<
    Awaited<ReturnType<typeof getGmailMailChangesPage>>,
    { resetRequired: true }
  >;
  "history-hydrate": Awaited<ReturnType<typeof hydrateGmailMailMessages>>;
  folders: Awaited<ReturnType<typeof getOutlookMailFoldersPage>>;
  "folder-changes": Exclude<
    Awaited<ReturnType<typeof getOutlookMailFolderChangesPage>>,
    { resetRequired: true }
  >;
  "folder-backfill": Exclude<
    Awaited<ReturnType<typeof getOutlookMailBackfillPage>>,
    { resetRequired: true }
  >;
  "message-lookup": Awaited<ReturnType<typeof getOutlookLocalMailMessage>>;
};
export type LocalMailSyncResponse =
  | {
      [Phase in keyof Results]: {
        status: "ok";
        phase: Phase;
        result: Results[Phase];
      };
    }[keyof Results]
  | { status: "paused"; retryAfterMs: number }
  | { status: "reset-required"; phase: LocalMailSyncRequest["phase"] }
  | { status: "unsupported"; strategy: "account-history" | "folder-delta" };
