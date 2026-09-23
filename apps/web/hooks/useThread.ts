import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuerySnapshot } from "@inboxzero/mail-react/use-query-snapshot";
import type { QuerySnapshot } from "@inboxzero/mail-core/queries";
import type { ConversationView } from "@inboxzero/mail-core/ports/mail-store";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  conversationViewToThreadResponse,
  missingConversationBodyIds,
} from "@/utils/mail-engine/conversation-thread";

const EMPTY_SNAPSHOT: QuerySnapshot<ConversationView> = {
  status: "loading",
  revision: null,
  data: null,
  refreshing: false,
  error: null,
};

export function useThread(
  {
    id,
    emailAccountId: explicitEmailAccountId,
  }: { id: string | null; emailAccountId?: string },
  options?: {
    includeDrafts?: boolean;
    localMail?: boolean;
    parseReplies?: boolean;
  },
) {
  const { emailAccountId: currentEmailAccountId } = useAccount();
  const emailAccountId = explicitEmailAccountId ?? currentEmailAccountId;
  const client = useOptionalMailClient();
  const includeDrafts = options?.includeDrafts;
  const [pagination, setPagination] = useState({
    accountId: emailAccountId,
    id,
    pageSize: 50,
  });
  const pageSize =
    pagination.accountId === emailAccountId && pagination.id === id
      ? pagination.pageSize
      : 50;
  const createHandle = useCallback(() => {
    if (!client || !emailAccountId || !id) {
      return {
        getSnapshot: () => EMPTY_SNAPSHOT,
        subscribe: () => () => undefined,
        close: () => undefined,
      };
    }
    return client.observeConversation(
      { accountId: emailAccountId, conversationId: id },
      { after: null, pageSize },
    );
  }, [client, emailAccountId, id, pageSize]);
  const snapshot = useQuerySnapshot(createHandle);

  useEffect(() => {
    if (!client || !snapshot.data) return;
    for (const message of snapshot.data.messages) {
      if (message.content.status === "available") continue;
      client.ensureMessageContent(message.key).catch(() => undefined);
    }
  }, [client, snapshot.data]);

  const data = useMemo<ThreadResponse | undefined>(() => {
    if (!id || !snapshot.data) return;
    return conversationViewToThreadResponse(snapshot.data, { includeDrafts });
  }, [id, includeDrafts, snapshot.data]);

  const mutate = useCallback(async () => {
    if (!client || !emailAccountId) return data;
    await client.requestSync([emailAccountId]);
    if (snapshot.data) {
      await Promise.all(
        snapshot.data.messages.map((message) =>
          client.ensureMessageContent(message.key),
        ),
      );
    }
    return data;
  }, [client, data, emailAccountId, snapshot.data]);

  const isLoading =
    Boolean(id) && (!client || !data) && snapshot.status !== "error";

  return {
    data,
    error: conversationQueryError(snapshot.error),
    isLoading,
    isValidating: snapshot.refreshing,
    mutate,
    localAvailability:
      data && snapshot.data
        ? {
            missingBodyIds: missingConversationBodyIds(snapshot.data),
            hasMore: Boolean(snapshot.data.nextPage),
            loadingMore: snapshot.refreshing && pageSize > 50,
            loadMore: () =>
              setPagination({
                accountId: emailAccountId,
                id,
                pageSize: pageSize + 50,
              }),
          }
        : undefined,
  };
}

function conversationQueryError(
  error: { code: string } | null,
): { error: string; info: { error: string } } | undefined {
  if (!error) return;
  const message =
    error.code === "not_found"
      ? "This conversation isn't available yet."
      : "Couldn't open this conversation.";
  return { error: message, info: { error: message } };
}
